using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Npgsql;
using Serilog;
using StockTracker.Common.Metrics;
using CandlestickAnalysis.Worker.Configuration;
using CandlestickAnalysis.Worker.Repositories;
using CandlestickAnalysis.Worker.Services;
using CandlestickAnalysis.Worker.Workers;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();

try
{
    Log.Information("Starting Candlestick Analysis Worker Service");

    var builder = WebApplication.CreateBuilder(args);

    // Configure Serilog
    builder.Host.UseSerilog((context, config) => config
        .ReadFrom.Configuration(context.Configuration)
        .WriteTo.Console());

    // Bind configuration
    builder.Services.Configure<DatabaseSettings>(
        builder.Configuration.GetSection("ConnectionStrings"));

    // Register database connection factory
    builder.Services.AddSingleton<IDbConnectionFactory, DbConnectionFactory>();

    // Register repositories
    builder.Services.AddScoped<IStockPriceRepository, StockPriceRepository>();
    builder.Services.AddScoped<IAnalysisRepository, AnalysisRepository>();

    // Register services
    builder.Services.AddScoped<IDailyAggregationService, DailyAggregationService>();
    builder.Services.AddScoped<IPatternDetectionService, PatternDetectionService>();
    builder.Services.AddScoped<ICandlestickAnalysisService, CandlestickAnalysisService>();

    // Register metrics client for pushing metrics to central metrics service
    builder.Services.AddMetricsClient(builder.Configuration);

    // Register the background worker
    builder.Services.AddHostedService<CandlestickAnalysisWorker>();

    // Add controllers
    builder.Services.AddControllers();

    // Get path base from environment (for reverse proxy)
    var pathBase = Environment.GetEnvironmentVariable("PATH_BASE") ?? "/api/analysis";

    // Add Swagger/OpenAPI
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new()
        {
            Title = "Candlestick Analysis API",
            Version = "v1",
            Description = "API for candlestick pattern analysis. Analyzes daily candles for single-candle patterns."
        });

        // Add server URL for reverse proxy
        c.AddServer(new Microsoft.OpenApi.Models.OpenApiServer
        {
            Url = pathBase,
            Description = "Candlestick Analysis API (via Caddy reverse proxy)"
        });
    });

    // Add health checks - use same connection settings as DbConnectionFactory
    var baseConnectionString = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Host=localhost;Port=5432;Database=stocktracker;Username=postgres;Password=postgres";
    
    var healthCheckConnectionString = new NpgsqlConnectionStringBuilder(baseConnectionString)
    {
        CommandTimeout = 30,
        Timeout = 15,
        SslMode = SslMode.Require,
        Pooling = false
    }.ConnectionString;

    builder.Services.AddHealthChecks()
        .AddNpgSql(healthCheckConnectionString, name: "postgresql", tags: ["db", "ready"]);

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
        c.SwaggerEndpoint("v1/swagger.json", "Candlestick Analysis API v1");
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
        service = "Candlestick Analysis Worker",
        version = "1.0.0",
        endpoints = new
        {
            health = "/health",
            swagger = "/swagger",
            api = "/api"
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

