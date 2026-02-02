using Finnhub.Worker.Configuration;
using Finnhub.Worker.Repositories;
using Finnhub.Worker.Services;
using Finnhub.Worker.Workers;
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
        builder.Configuration.GetSection("Finnhub"));

    // Database connection factory
    builder.Services.AddSingleton<IDbConnectionFactory, DbConnectionFactory>();

    // Repositories
    builder.Services.AddScoped<IStockTickerRepository, StockTickerRepository>();
    builder.Services.AddScoped<IFundamentalsRepository, FundamentalsRepository>();
    builder.Services.AddScoped<IEarningsRepository, EarningsRepository>();
    builder.Services.AddScoped<IFetchScheduleRepository, FetchScheduleRepository>();

    // Services
    builder.Services.AddSingleton<MetricsCalculationService>();
    builder.Services.AddScoped<IFundamentalsFetchService, FundamentalsFetchService>();
    builder.Services.AddScoped<IEarningsFetchService, EarningsFetchService>();

    // HTTP Client with Polly retry policy
    builder.Services.AddHttpClient<IFinnhubApiClient, FinnhubApiClient>()
        .AddPolicyHandler(GetRetryPolicy());

    // Metrics client
    builder.Services.AddMetricsClient(builder.Configuration);

    // Background worker
    builder.Services.AddHostedService<FundamentalsFetchWorker>();

    // Controllers
    builder.Services.AddControllers();

    // Health checks
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Host=localhost;Port=5432;Database=stocktracker;Username=postgres;Password=postgres";

    builder.Services.AddHealthChecks()
        .AddNpgSql(connectionString, name: "postgresql", tags: ["db", "ready"]);

    // Swagger
    var pathBase = Environment.GetEnvironmentVariable("PATH_BASE") ?? "/api/finnhub";

    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = "Finnhub Fundamentals API",
            Version = "v1",
            Description = "API for fetching stock fundamental data from Finnhub"
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
        c.SwaggerEndpoint("v1/swagger.json", "Finnhub Fundamentals API v1");
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

    Log.Information("Finnhub Fundamentals Worker starting on port 8080");
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
