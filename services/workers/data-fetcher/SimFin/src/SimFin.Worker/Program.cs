using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Polly;
using Polly.Extensions.Http;
using Serilog;
using StockTracker.Common.Metrics;
using SimFin.Worker.Configuration;
using SimFin.Worker.Repositories;
using SimFin.Worker.Services;
using SimFin.Worker.Workers;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();

try
{
    Log.Information("Starting SimFin Worker Service");

    var builder = WebApplication.CreateBuilder(args);

    // Configure Serilog
    builder.Host.UseSerilog((context, config) => config
        .ReadFrom.Configuration(context.Configuration)
        .WriteTo.Console());

    // Bind configuration
    builder.Services.Configure<SimFinSettings>(
        builder.Configuration.GetSection("SimFin"));
    builder.Services.Configure<DatabaseSettings>(
        builder.Configuration.GetSection("ConnectionStrings"));

    // Register database connection factory
    builder.Services.AddSingleton<IDbConnectionFactory, DbConnectionFactory>();

    // Register repositories
    builder.Services.AddScoped<IFetchScheduleRepository, FetchScheduleRepository>();
    builder.Services.AddScoped<IStockTickerRepository, StockTickerRepository>();
    builder.Services.AddScoped<IFundamentalsRepository, FundamentalsRepository>();

    // Register SimFin client with HttpClient and Polly retry policy
    // HttpClient configuration is done here (not in constructor) to work properly with IHttpClientFactory
    builder.Services.AddHttpClient<ISimFinClient, SimFinClient>()
        .ConfigureHttpClient((sp, client) =>
        {
            var settings = sp.GetRequiredService<IOptions<SimFinSettings>>().Value;
            var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger("HttpClientSetup");
            // Ensure BaseAddress ends with / for proper relative URL resolution
            var baseUrl = settings.BaseUrl.TrimEnd('/') + "/";
            logger.LogInformation("Configuring SimFin HttpClient. BaseUrl={BaseUrl}, ApiKeyLength={KeyLen}", 
                baseUrl, settings.ApiKey?.Length ?? 0);
            client.BaseAddress = new Uri(baseUrl);
            client.DefaultRequestHeaders.Add("Authorization", $"api-key {settings.ApiKey}");
        })
        .AddPolicyHandler((sp, _) =>
        {
            var settings = sp.GetRequiredService<IOptions<SimFinSettings>>().Value;
            return GetRetryPolicy(settings.MaxRetries);
        });

    // Register services
    builder.Services.AddScoped<IFundamentalsFetchService, FundamentalsFetchService>();

    // Register metrics client for pushing metrics to central metrics service
    builder.Services.AddMetricsClient(builder.Configuration);

    // Register the background worker
    builder.Services.AddHostedService<FundamentalsFetchWorker>();

    // Add controllers with JSON enum string conversion
    builder.Services.AddControllers()
        .AddJsonOptions(options =>
        {
            options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        });

    // Get path base from environment (for reverse proxy)
    var pathBase = Environment.GetEnvironmentVariable("PATH_BASE") ?? "/api/simfin";

    // Add Swagger/OpenAPI
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new()
        {
            Title = "SimFin Worker API",
            Version = "v1",
            Description = "API for controlling the SimFin fundamentals fetcher. Fetches company fundamentals including financial statements, valuation metrics, and profitability ratios."
        });

        // Add server URL for reverse proxy
        c.AddServer(new Microsoft.OpenApi.Models.OpenApiServer
        {
            Url = pathBase,
            Description = "SimFin API (via Caddy reverse proxy)"
        });

        // Include XML comments
        var xmlFile = $"{System.Reflection.Assembly.GetExecutingAssembly().GetName().Name}.xml";
        var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
        if (File.Exists(xmlPath))
        {
            c.IncludeXmlComments(xmlPath);
        }
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

    // Swagger UI
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("v1/swagger.json", "SimFin Worker API v1");
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
        service = "SimFin Worker",
        version = "1.0.0",
        dataSource = "SimFin API",
        endpoints = new
        {
            health = "/health",
            swagger = "/swagger",
            status = "/api/fetch/status",
            trigger = "/api/fetch/trigger/{symbol}",
            triggerAll = "/api/fetch/trigger/all"
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

// Polly retry policy for HTTP requests
static IAsyncPolicy<HttpResponseMessage> GetRetryPolicy(int maxRetries)
{
    return HttpPolicyExtensions
        .HandleTransientHttpError()
        .OrResult(msg => msg.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
        .WaitAndRetryAsync(maxRetries, retryAttempt => TimeSpan.FromSeconds(Math.Pow(2, retryAttempt)));
}
