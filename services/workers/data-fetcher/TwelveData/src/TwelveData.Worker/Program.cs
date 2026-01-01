using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Polly;
using Polly.Extensions.Http;
using Serilog;
using StockTracker.Common.Metrics;
using TwelveData.Worker.Configuration;
using TwelveData.Worker.Repositories;
using TwelveData.Worker.Services;
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

    // Register HTTP client with retry policy
    builder.Services.AddHttpClient<ITwelveDataApiClient, TwelveDataApiClient>()
        .AddPolicyHandler(GetRetryPolicy());

    // Register database connection factory
    builder.Services.AddSingleton<IDbConnectionFactory, DbConnectionFactory>();

    // Register repositories
    builder.Services.AddScoped<IStockTickerRepository, StockTickerRepository>();
    builder.Services.AddScoped<IStockPriceRepository, StockPriceRepository>();
    builder.Services.AddScoped<IFetchScheduleRepository, FetchScheduleRepository>();

    // Register services
    builder.Services.AddScoped<IStockFetchService, StockFetchService>();

    // Register metrics client for pushing metrics to central metrics service
    builder.Services.AddMetricsClient(builder.Configuration);

    // Register the background worker
    builder.Services.AddHostedService<StockFetchWorker>();

    // Add controllers
    builder.Services.AddControllers();

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
            Description = "API for controlling the TwelveData stock data fetcher. Use this to manually trigger data fetches for testing."
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
        .AddNpgSql(connectionString, name: "postgresql", tags: ["db", "ready"]);

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
        version = "1.0.0",
        endpoints = new
        {
            health = "/health",
            swagger = "/swagger",
            api = "/api/fetch"
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
