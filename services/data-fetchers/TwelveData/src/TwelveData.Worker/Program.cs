using Polly;
using Polly.Extensions.Http;
using Serilog;
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

    var host = Host.CreateDefaultBuilder(args)
        .UseSerilog((context, config) => config
            .ReadFrom.Configuration(context.Configuration)
            .WriteTo.Console())
        .ConfigureServices((context, services) =>
        {
            // Bind configuration
            services.Configure<TwelveDataSettings>(
                context.Configuration.GetSection("TwelveData"));
            services.Configure<DatabaseSettings>(
                context.Configuration.GetSection("ConnectionStrings"));

            // Register HTTP client with retry policy
            services.AddHttpClient<ITwelveDataApiClient, TwelveDataApiClient>()
                .AddPolicyHandler(GetRetryPolicy());

            // Register database connection factory
            services.AddSingleton<IDbConnectionFactory, DbConnectionFactory>();

            // Register repositories
            services.AddScoped<IStockTickerRepository, StockTickerRepository>();
            services.AddScoped<IStockPriceRepository, StockPriceRepository>();

            // Register services
            services.AddScoped<IStockFetchService, StockFetchService>();

            // Register the background worker
            services.AddHostedService<StockFetchWorker>();
        })
        .Build();

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

