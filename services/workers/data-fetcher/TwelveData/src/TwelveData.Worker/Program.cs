using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Polly;
using Polly.Extensions.Http;
using RabbitMQ.Client;
using Serilog;
using StackExchange.Redis;
using StockTracker.Common.Metrics;
using TwelveData.Worker.Configuration;
using TwelveData.Worker.Repositories;
using TwelveData.Worker.Services;
using TwelveData.Worker.Services.RateLimiting;
using TwelveData.Worker.Services.Verification;
using TwelveData.Worker.Workers;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();

try
{
    Log.Information("Starting TwelveData Worker Service");

    var builder = WebApplication.CreateBuilder(args);

    // Configure Serilog
    builder.Host.UseSerilog((context, config) => config
        .ReadFrom.Configuration(context.Configuration)
        .WriteTo.Console());

    // Bind configuration
    builder.Services.Configure<TwelveDataSettings>(
        builder.Configuration.GetSection("TwelveData"));
    builder.Services.Configure<DatabaseSettings>(
        builder.Configuration.GetSection("ConnectionStrings"));
    builder.Services.Configure<RabbitMQSettings>(
        builder.Configuration.GetSection("RabbitMQ"));
    builder.Services.Configure<BackfillSettings>(
        builder.Configuration.GetSection("Backfill"));
    builder.Services.Configure<RedisSettings>(
        builder.Configuration.GetSection("Redis"));

    // Register Redis connection
    var redisConnectionString = builder.Configuration.GetSection("Redis:ConnectionString").Value ?? "localhost:6379";
    builder.Services.AddSingleton<IConnectionMultiplexer>(sp =>
    {
        var config = ConfigurationOptions.Parse(redisConnectionString);
        config.AbortOnConnectFail = false; // Allow graceful handling of connection issues
        return ConnectionMultiplexer.Connect(config);
    });

    // Register HTTP client with retry policy
    builder.Services.AddHttpClient<ITwelveDataApiClient, TwelveDataApiClient>()
        .AddPolicyHandler(GetRetryPolicy());

    // Register database connection factory
    builder.Services.AddSingleton<IDbConnectionFactory, DbConnectionFactory>();

    // Register repositories
    builder.Services.AddScoped<IStockTickerRepository, StockTickerRepository>();
    builder.Services.AddScoped<IStockPriceRepository, StockPriceRepository>();
    builder.Services.AddScoped<IFetchScheduleRepository, FetchScheduleRepository>();
    builder.Services.AddScoped<ICryptoTickerRepository, CryptoTickerRepository>();

    // Register rate limiter (singleton for shared state)
    builder.Services.AddSingleton<ITwelveDataRateLimiter, TwelveDataRateLimiter>();

    // Register asset verifiers
    builder.Services.AddHttpClient<StockVerifier>();
    builder.Services.AddHttpClient<EtfVerifier>();
    builder.Services.AddHttpClient<CryptoVerifier>();
    builder.Services.AddScoped<IAssetVerifier, StockVerifier>();
    builder.Services.AddScoped<IAssetVerifier, EtfVerifier>();
    builder.Services.AddScoped<IAssetVerifier, CryptoVerifier>();
    builder.Services.AddScoped<IAssetVerifierFactory, AssetVerifierFactory>();

    // Register services
    builder.Services.AddScoped<IStockFetchService, StockFetchService>();
    builder.Services.AddScoped<IHistoricalBackfillService, HistoricalBackfillService>();
    builder.Services.AddScoped<ITickerManagementService, TickerManagementService>();

    // Register metrics client for pushing metrics to central metrics service
    builder.Services.AddMetricsClient(builder.Configuration);

    // Register the background workers
    builder.Services.AddHostedService<StockFetchWorker>();
    builder.Services.AddHostedService<BackfillQueueConsumer>();
    builder.Services.AddHostedService<TickerAddQueueConsumer>();

    // Add controllers with JSON enum string conversion
    builder.Services.AddControllers()
        .AddJsonOptions(options =>
        {
            options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        });

    // Get path base from environment (for reverse proxy)
    var pathBase = Environment.GetEnvironmentVariable("PATH_BASE") ?? "/api/twelvedata";
    
    // Add Swagger/OpenAPI
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new()
        {
            Title = "TwelveData Fetcher API",
            Version = "v1",
            Description = "API for controlling the TwelveData stock data fetcher and managing tickers. Includes rate-limited ticker CRUD with Twelve Data verification."
        });
        
        // Add server URL for reverse proxy (Caddy routes /api/twelvedata/* to this service)
        c.AddServer(new Microsoft.OpenApi.Models.OpenApiServer
        {
            Url = pathBase,
            Description = "TwelveData API (via Caddy reverse proxy)"
        });
    });

    // Add health checks
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Host=localhost;Port=5432;Database=stocktracker;Username=postgres;Password=postgres";

    builder.Services.AddHealthChecks()
        .AddNpgSql(connectionString, name: "postgresql", tags: ["db", "ready"])
        .AddRedis(redisConnectionString, name: "redis", tags: ["cache", "ready"]);

    var app = builder.Build();

    // Configure pipeline
    if (!string.IsNullOrEmpty(pathBase))
    {
        app.UsePathBase(pathBase);
    }
    
    app.UseSerilogRequestLogging();

    // Swagger UI (available in all environments for this service)
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        // Use relative path for swagger.json to work behind reverse proxy
        c.SwaggerEndpoint("v1/swagger.json", "TwelveData Fetcher API v1");
        c.RoutePrefix = "swagger";
    });

    // Health check endpoints
    app.MapHealthChecks("/health", new HealthCheckOptions
    {
        Predicate = _ => true
    });

    app.MapHealthChecks("/health/ready", new HealthCheckOptions
    {
        Predicate = check => check.Tags.Contains("ready")
    });

    app.MapHealthChecks("/health/live", new HealthCheckOptions
    {
        Predicate = _ => false // Just checks if app is running
    });

    // Map controllers
    app.MapControllers();

    // Root endpoint
    app.MapGet("/", () => Results.Ok(new
    {
        service = "TwelveData Fetcher",
        version = "1.1.0",
        endpoints = new
        {
            health = "/health",
            swagger = "/swagger",
            fetch = "/api/fetch",
            tickers = "/api/ticker"
        }
    }));

    await app.RunAsync();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
}
finally
{
    await Log.CloseAndFlushAsync();
}

static IAsyncPolicy<HttpResponseMessage> GetRetryPolicy()
{
    return HttpPolicyExtensions
        .HandleTransientHttpError()
        .WaitAndRetryAsync(3, retryAttempt =>
            TimeSpan.FromSeconds(Math.Pow(2, retryAttempt)),
            onRetry: (outcome, timespan, retryAttempt, context) =>
            {
                Log.Warning("Retry {RetryAttempt} after {Delay}s due to {Exception}",
                    retryAttempt, timespan.TotalSeconds, outcome.Exception?.Message ?? outcome.Result?.StatusCode.ToString());
            });
}
