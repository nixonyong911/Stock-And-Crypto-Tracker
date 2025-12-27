using Serilog;
using Prometheus;
using StockTracker.Metrics.Services;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();

try
{
    Log.Information("Starting StockTracker Metrics Service");

    var builder = WebApplication.CreateBuilder(args);

    // Configure Serilog
    builder.Host.UseSerilog((context, config) => config
        .ReadFrom.Configuration(context.Configuration)
        .WriteTo.Console());

    // Register services
    builder.Services.AddSingleton<IMetricsAggregator, MetricsAggregator>();

    // Add controllers
    builder.Services.AddControllers();
    
    // Get path base from environment (for reverse proxy)
    var pathBase = Environment.GetEnvironmentVariable("PATH_BASE") ?? "";
    
    // Add Swagger
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new()
        {
            Title = "StockTracker Metrics Service",
            Version = "v1",
            Description = "Central metrics aggregation service for all workers"
        });
        
        // Add server URL for reverse proxy
        if (!string.IsNullOrEmpty(pathBase))
        {
            c.AddServer(new Microsoft.OpenApi.Models.OpenApiServer
            {
                Url = pathBase,
                Description = "Metrics API (via Caddy reverse proxy)"
            });
        }
    });

    // Add health checks
    builder.Services.AddHealthChecks();

    var app = builder.Build();

    // Configure pipeline - PATH_BASE must be first
    if (!string.IsNullOrEmpty(pathBase))
    {
        app.UsePathBase(pathBase);
    }
    
    app.UseSerilogRequestLogging();

    // Swagger UI
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        // Use relative path for swagger.json to work behind reverse proxy
        c.SwaggerEndpoint("v1/swagger.json", "StockTracker Metrics Service v1");
        c.RoutePrefix = "swagger";
    });

    // Prometheus metrics endpoint - this is what Prometheus scrapes
    app.UseMetricServer();

    // Health checks
    app.MapHealthChecks("/health");
    app.MapHealthChecks("/health/live");
    app.MapHealthChecks("/health/ready");

    // Map controllers
    app.MapControllers();

    // Root endpoint
    app.MapGet("/", () => Results.Ok(new
    {
        service = "StockTracker Metrics Service",
        version = "1.0.0",
        description = "Central metrics aggregation for all workers",
        endpoints = new
        {
            postMetric = "POST /api/metrics",
            postBatch = "POST /api/metrics/batch",
            getWorkers = "GET /api/metrics/workers",
            prometheusMetrics = "/metrics",
            health = "/health",
            swagger = "/swagger"
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
    Log.CloseAndFlush();
}





















