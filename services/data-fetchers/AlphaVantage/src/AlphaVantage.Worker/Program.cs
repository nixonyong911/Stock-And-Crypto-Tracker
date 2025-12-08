using AlphaVantage.Worker.Services;
using AlphaVantage.Worker.Workers;
using AlphaVantage.Worker.Configuration;
using AlphaVantage.Worker.Repositories;
using Serilog;
using Polly;
using Polly.Extensions.Http;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();

try
{
    Log.Information("Starting Alpha Vantage Worker Service");

    var builder = Host.CreateApplicationBuilder(args);

    // Configure Serilog
    builder.Services.AddSerilog();

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

    // Register the worker
    builder.Services.AddHostedService<StockFetchWorker>();

    var host = builder.Build();
    await host.RunAsync();
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

