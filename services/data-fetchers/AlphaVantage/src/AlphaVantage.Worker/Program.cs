using AlphaVantage.Worker.Services;
using AlphaVantage.Worker.Workers;
using AlphaVantage.Worker.Configuration;
using AlphaVantage.Worker.Repositories;
using Serilog;
using Polly;
using Polly.Extensions.Http;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using StockTracker.Common.Metrics;
using StockTracker.Common.Services;
using StockTracker.Common.Supabase;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();

try
{
    Log.Information("Starting Alpha Vantage Service");

    var builder = WebApplication.CreateBuilder(args);

    // Configure Serilog
    builder.Host.UseSerilog((context, config) => config
        .ReadFrom.Configuration(context.Configuration)
        .WriteTo.Console());

    // Bind configuration
    builder.Services.Configure<AlphaVantageSettings>(
        builder.Configuration.GetSection("AlphaVantage"));
    builder.Services.Configure<DatabaseSettings>(
        builder.Configuration.GetSection("ConnectionStrings"));

    // Register HTTP client with retry policy
    builder.Services.AddHttpClient<IAlphaVantageApiClient, AlphaVantageApiClient>()
        .AddPolicyHandler(GetRetryPolicy());

    // Register services
    builder.Services.AddSingleton<IDbConnectionFactory, DbConnectionFactory>();
    builder.Services.AddScoped<IStockRepository, StockRepository>();
    builder.Services.AddScoped<IFetchLogRepository, FetchLogRepository>();
    builder.Services.AddScoped<IStockFetchService, StockFetchService>();
    
    // Register shared services from StockTracker.Common
    builder.Services.AddMetricsClient(builder.Configuration);
    builder.Services.AddWorkerState();
    
    // Register Supabase client factory
    builder.Services.AddSupabase(builder.Configuration);

    // Register the background worker
    builder.Services.AddHostedService<StockFetchWorker>();

    // Add controllers
    builder.Services.AddControllers();
    
    // Add Swagger/OpenAPI
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new() 
        { 
            Title = "Alpha Vantage Fetcher API", 
            Version = "v1",
            Description = "API for controlling the Alpha Vantage stock data fetcher"
        });
    });

    // Add health checks
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection") 
        ?? "Host=localhost;Port=5432;Database=stocktracker;Username=postgres;Password=postgres";
    
    builder.Services.AddHealthChecks()
        .AddNpgSql(connectionString, name: "postgresql", tags: ["db", "ready"])
        .AddWorkerHealthCheck("worker", ["worker", "ready"]);

    var app = builder.Build();

    // Configure pipeline
    app.UseSerilogRequestLogging();

    // Swagger UI (available in all environments for this service)
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Alpha Vantage Fetcher API v1");
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
        service = "Alpha Vantage Fetcher",
        version = "1.0.0",
        endpoints = new
        {
            health = "/health",
            swagger = "/swagger",
            api = "/api/fetch",
            supabaseTest = "/api/supabasetest/connection"
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
