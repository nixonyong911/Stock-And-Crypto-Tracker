using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Polly;
using Polly.Extensions.Http;
using Serilog;
using TwelveData.Worker.Configuration;
using TwelveData.Worker.Models;
using TwelveData.Worker.Repositories;
using TwelveData.Worker.Services;
using TwelveData.Worker.Workers;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();

// Check if running as a scheduled job (Azure Container Apps Job mode)
var runAsJob = Environment.GetEnvironmentVariable("RUN_AS_JOB")?.ToLower() == "true";

if (runAsJob)
{
    // JOB MODE: Run once and exit
    await RunAsJobAsync(args);
}
else
{
    // SERVICE MODE: Run as web API with background worker (for local dev/testing)
    await RunAsServiceAsync(args);
}

/// <summary>
/// Job mode: Fetch stock data once and exit.
/// Used by Azure Container Apps Jobs with scheduled trigger.
/// </summary>
static async Task RunAsJobAsync(string[] args)
{
    var exitCode = 0;
    
    try
    {
        Log.Information("TwelveData Job starting (scheduled job mode)");

        var builder = Host.CreateApplicationBuilder(args);

        // Configure Serilog
        builder.Services.AddSerilog(config => config
            .ReadFrom.Configuration(builder.Configuration)
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

        var host = builder.Build();

        // Execute the fetch job
        using var scope = host.Services.CreateScope();
        var scheduleRepository = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
        var stockFetchService = scope.ServiceProvider.GetRequiredService<IStockFetchService>();

        const string dataSourceName = "TwelveData";
        var schedule = await scheduleRepository.GetScheduleByDataSourceNameAsync(dataSourceName);

        if (schedule == null)
        {
            Log.Error("No enabled schedule found for data source '{DataSource}'", dataSourceName);
            exitCode = 1;
        }
        else if (!schedule.IsEnabled)
        {
            Log.Warning("Schedule '{ScheduleName}' is disabled. Exiting.", schedule.Name);
            exitCode = 0; // Not an error, just disabled
        }
        else
        {
            Log.Information("Executing scheduled fetch: {ScheduleName}", schedule.Name);
            
            var config = JsonSerializer.Deserialize<FetchConfig>(schedule.FetchConfig) ?? new FetchConfig();
            await stockFetchService.FetchAndStoreStockDataAsync(schedule, config, CancellationToken.None);
            
            Log.Information("TwelveData Job completed successfully");
            exitCode = 0;
        }
    }
    catch (Exception ex)
    {
        Log.Fatal(ex, "TwelveData Job failed with error");
        exitCode = 1;
    }
    finally
    {
        await Log.CloseAndFlushAsync();
    }

    Environment.Exit(exitCode);
}

/// <summary>
/// Service mode: Run as web API with background worker.
/// Used for local development and manual testing via Swagger UI.
/// </summary>
static async Task RunAsServiceAsync(string[] args)
{
    try
    {
        Log.Information("Starting TwelveData Worker Service (web API mode)");

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

        // Register the background worker (only in service mode)
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
