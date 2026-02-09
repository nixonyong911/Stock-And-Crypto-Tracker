using DataFetcher.Worker.Application;
using DataFetcher.Worker.Application.Providers.AlphaVantage;
using DataFetcher.Worker.Application.Providers.Finnhub;
using DataFetcher.Worker.Application.Scheduling;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.AlphaVantage;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub.Repositories;
using DataFetcher.Worker.Workers.Finnhub;
using DataFetcher.Worker.Workers.Scheduling;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.OpenApi.Models;
using Polly;
using Polly.Extensions.Http;
using Serilog;
using StockTracker.Common.Metrics;

// Configure Serilog
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // Configure Serilog
    builder.Host.UseSerilog((context, config) => config
        .ReadFrom.Configuration(context.Configuration)
        .WriteTo.Console());

    // Configuration binding
    builder.Services.Configure<DatabaseSettings>(
        builder.Configuration.GetSection("ConnectionStrings"));
    builder.Services.Configure<FinnhubSettings>(
        builder.Configuration.GetSection("Providers:Finnhub"));
    builder.Services.Configure<AlphaVantageSettings>(
        builder.Configuration.GetSection("Providers:AlphaVantage"));

    // Infrastructure - Common
    builder.Services.AddSingleton<IDbConnectionFactory, DbConnectionFactory>();
    builder.Services.AddScoped<IStockTickerRepository, StockTickerRepository>();
    builder.Services.AddScoped<IFetchScheduleRepository, FetchScheduleRepository>();

    // Infrastructure - Finnhub Provider
    builder.Services.AddScoped<IFundamentalsRepository, FundamentalsRepository>();

    // Infrastructure - Common (shared across providers)
    builder.Services.AddScoped<IEarningsRepository, EarningsRepository>();

    // Application - Finnhub Provider
    builder.Services.AddSingleton<MetricsCalculationService>();
    builder.Services.AddScoped<IFundamentalsFetchService, FundamentalsFetchService>();
    // Note: IEarningsFetchService removed - earnings calendar now handled by AlphaVantage provider

    // HTTP Client with Polly retry policy for Finnhub
    builder.Services.AddHttpClient<IFinnhubApiClient, FinnhubApiClient>()
        .AddPolicyHandler(GetRetryPolicy());

    // Infrastructure - AlphaVantage Provider
    builder.Services.AddHttpClient<IAlphaVantageApiClient, AlphaVantageApiClient>()
        .AddPolicyHandler(GetRetryPolicy());

    // Application - AlphaVantage Provider
    builder.Services.AddScoped<IEarningsCalendarService, EarningsCalendarService>();

    // Application - Scheduling (orchestrated multi-provider services)
    builder.Services.AddScoped<IEarningsSyncService, EarningsSyncService>();

    // Metrics client
    builder.Services.AddMetricsClient(builder.Configuration);

    // Background workers
    builder.Services.AddHostedService<FinnhubFetchWorker>();
    // Note: AlphaVantageFetchWorker replaced by EarningsSyncWorker which combines AV + Finnhub
    builder.Services.AddHostedService<EarningsSyncWorker>();

    // Controllers
    builder.Services.AddControllers();

    // Health checks
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Host=localhost;Port=5432;Database=stocktracker;Username=postgres;Password=postgres";

    builder.Services.AddHealthChecks()
        .AddNpgSql(connectionString, name: "postgresql", tags: ["db", "ready"]);

    // Provider Registry
    var registry = new ProviderRegistry();
    registry.Register(new ProviderInfo
    {
        Name = "Finnhub",
        Description = "Stock fundamentals and metrics calculation",
        StatusEndpoint = "/api/finnhub/status",
        SwaggerGroup = "finnhub",
        Capabilities = new List<string> { "fundamentals", "metrics", "trigger" }
    });
    registry.Register(new ProviderInfo
    {
        Name = "AlphaVantage",
        Description = "Earnings calendar data",
        StatusEndpoint = "/api/alphavantage/status",
        SwaggerGroup = "alphavantage",
        Capabilities = new List<string> { "earnings-calendar", "sync" }
    });
    registry.Register(new ProviderInfo
    {
        Name = "Earnings Sync",
        Description = "Combined earnings sync (Alpha Vantage + Finnhub)",
        StatusEndpoint = "/api/earnings/status",
        SwaggerGroup = "earnings",
        Capabilities = new List<string> { "earnings-sync", "multi-provider" }
    });
    builder.Services.AddSingleton<IProviderRegistry>(registry);

    // Swagger
    var pathBase = Environment.GetEnvironmentVariable("PATH_BASE") ?? "/api/data-fetcher-2.0";

    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("finnhub", new OpenApiInfo
        {
            Title = "Finnhub Provider",
            Version = "v1",
            Description = "Stock fundamentals and metrics from Finnhub API"
        });
        c.SwaggerDoc("alphavantage", new OpenApiInfo
        {
            Title = "AlphaVantage Provider",
            Version = "v1",
            Description = "Earnings calendar data from Alpha Vantage API"
        });
        c.SwaggerDoc("earnings", new OpenApiInfo
        {
            Title = "Earnings Sync Service",
            Version = "v1",
            Description = "Combined earnings sync using Alpha Vantage (upcoming dates) + Finnhub (historical actuals)"
        });
        c.SwaggerDoc("general", new OpenApiInfo
        {
            Title = "General / Discovery",
            Version = "v1",
            Description = "Provider discovery and general endpoints"
        });
        c.AddServer(new OpenApiServer { Url = pathBase });

        // Include XML comments
        var xmlFile = $"{System.Reflection.Assembly.GetExecutingAssembly().GetName().Name}.xml";
        var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
        if (File.Exists(xmlPath))
        {
            c.IncludeXmlComments(xmlPath);
        }
    });

    var app = builder.Build();

    // Configure path base for reverse proxy
    if (!string.IsNullOrEmpty(pathBase))
    {
        app.UsePathBase(pathBase);
    }

    // Swagger UI
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("finnhub/swagger.json", "Finnhub Provider");
        c.SwaggerEndpoint("alphavantage/swagger.json", "AlphaVantage Provider");
        c.SwaggerEndpoint("earnings/swagger.json", "Earnings Sync Service");
        c.SwaggerEndpoint("general/swagger.json", "General / Discovery");
        c.RoutePrefix = "swagger";
    });

    // Health checks
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
        Predicate = _ => false
    });

    // Controllers
    app.MapControllers();

    Log.Information("Data Fetcher 2.0 starting on port 8080");
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
    throw;
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
                Log.Warning("Retry {RetryAttempt} after {Delay}s due to {Error}",
                    retryAttempt, timespan.TotalSeconds, outcome.Exception?.Message ?? outcome.Result?.StatusCode.ToString());
            });
}
