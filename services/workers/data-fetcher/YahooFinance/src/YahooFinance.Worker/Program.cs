using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Serilog;
using StockTracker.Common.Metrics;
using YahooFinance.Worker.Configuration;
using YahooFinance.Worker.Repositories;
using YahooFinance.Worker.Services;
using YahooFinance.Worker.Workers;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();

try
{
    Log.Information("Starting YahooFinance Worker Service");

    var builder = WebApplication.CreateBuilder(args);

    // Configure Serilog
    builder.Host.UseSerilog((context, config) => config
        .ReadFrom.Configuration(context.Configuration)
        .WriteTo.Console());

    // Bind configuration
    builder.Services.Configure<YahooFinanceSettings>(
        builder.Configuration.GetSection("YahooFinance"));
    builder.Services.Configure<DatabaseSettings>(
        builder.Configuration.GetSection("ConnectionStrings"));

    // Register database connection factory
    builder.Services.AddSingleton<IDbConnectionFactory, DbConnectionFactory>();

    // Register repositories
    builder.Services.AddScoped<IFetchScheduleRepository, FetchScheduleRepository>();
    builder.Services.AddScoped<IStockTickerRepository, StockTickerRepository>();
    builder.Services.AddScoped<IFundamentalsRepository, FundamentalsRepository>();

    // Register Yahoo Finance client (singleton - stateless)
    builder.Services.AddSingleton<IYahooFinanceClient, YahooFinanceClient>();

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
    var pathBase = Environment.GetEnvironmentVariable("PATH_BASE") ?? "/api/yahoofinance";

    // Add Swagger/OpenAPI
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new()
        {
            Title = "Yahoo Finance Worker API",
            Version = "v1",
            Description = "API for controlling the Yahoo Finance fundamentals fetcher. Fetches company fundamentals, earnings calendar, and analyst ratings daily."
        });

        // Add server URL for reverse proxy
        c.AddServer(new Microsoft.OpenApi.Models.OpenApiServer
        {
            Url = pathBase,
            Description = "Yahoo Finance API (via Caddy reverse proxy)"
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
        c.SwaggerEndpoint("v1/swagger.json", "Yahoo Finance Worker API v1");
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
        service = "Yahoo Finance Worker",
        version = "1.0.0",
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
