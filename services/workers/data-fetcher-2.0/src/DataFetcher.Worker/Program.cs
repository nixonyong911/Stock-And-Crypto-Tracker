using Dapper;
using DataFetcher.Worker.Application;
using DataFetcher.Worker.Application.Providers.AlphaVantage;
using DataFetcher.Worker.Application.Providers.CandlestickAnalysis;
using DataFetcher.Worker.Application.Providers.Finnhub;
using DataFetcher.Worker.Application.Providers.Massive;
using DataFetcher.Worker.Application.Scheduling;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.AlphaVantage;
using DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.Massive;
using DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;
using DataFetcher.Worker.Workers.CandlestickAnalysis;
using DataFetcher.Worker.Workers.Finnhub;
using DataFetcher.Worker.Workers.Massive;
using DataFetcher.Worker.Workers.Scheduling;
using DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;
using DataFetcher.Worker.Infrastructure.Providers.PriceTargetAnalysis.Repositories;
using DataFetcher.Worker.Workers.PriceTargetAnalysis;
using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Application.Providers.Common;
using DataFetcher.Worker.Application.Providers.Etoro;
using DataFetcher.Worker.Infrastructure.Providers.Alpaca;
using DataFetcher.Worker.Infrastructure.Providers.Alpaca.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.Etoro;
using DataFetcher.Worker.Workers.Alpaca;
using DataFetcher.Worker.Workers.Etoro;
using DataFetcher.Worker.Workers.Pipeline;
using DataFetcher.Worker.Application.Providers.Indicators;
using DataFetcher.Worker.Application.Providers.Indicators.Definitions;
using DataFetcher.Worker.Application.Providers.LocalIndicators;
using DataFetcher.Worker.Application.Validation;
using DataFetcher.Worker.Application.Providers.Pipeline;
using DataFetcher.Worker.Application.Providers.Pipeline.Steps;
using DataFetcher.Worker.Application.Providers.Fred;
using DataFetcher.Worker.Application.Providers.MarketAuxNews;
using DataFetcher.Worker.Infrastructure.Providers.Fred;
using DataFetcher.Worker.Infrastructure.Providers.Fred.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.MarketAuxNews;
using DataFetcher.Worker.Infrastructure.Providers.MarketAuxNews.Repositories;
using DataFetcher.Worker.Workers.Fred;
using DataFetcher.Worker.Workers.LocalIndicators;
using DataFetcher.Worker.Workers.MarketAuxNews;
using DataFetcher.Worker.Workers.DataCompleteness;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.OpenApi.Models;
using Polly;
using Polly.Extensions.Http;
using Serilog;
using StockTracker.Common.Metrics;

// Register Dapper type handlers for DateOnly (not natively supported by Dapper)
SqlMapper.AddTypeHandler(new DateOnlyTypeHandler());
SqlMapper.AddTypeHandler(new NullableDateOnlyTypeHandler());

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
    builder.Services.Configure<MassiveSettings>(
        builder.Configuration.GetSection("Providers:Massive"));
    builder.Services.Configure<CandlestickAnalysisSettings>(
        builder.Configuration.GetSection("Providers:CandlestickAnalysis"));
    builder.Services.Configure<RabbitMQSettings>(
        builder.Configuration.GetSection("RabbitMQ"));
    builder.Services.Configure<AlpacaSettings>(
        builder.Configuration.GetSection("Providers:Alpaca"));
    builder.Services.Configure<EtoroSettings>(
        builder.Configuration.GetSection("Providers:Etoro"));
    builder.Services.Configure<GatewaySettings>(
        builder.Configuration.GetSection("Gateway"));
    builder.Services.Configure<MarketAuxSettings>(
        builder.Configuration.GetSection("Providers:MarketAux"));
    builder.Services.Configure<FredSettings>(
        builder.Configuration.GetSection("Providers:Fred"));

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
    builder.Services.AddScoped<IFinnhubExternalIndicatorService, FinnhubExternalIndicatorService>();
    // Note: IEarningsFetchService removed - earnings calendar now handled by AlphaVantage provider

    // HTTP Client with Polly retry policy for Finnhub
    builder.Services.AddHttpClient<IFinnhubApiClient, FinnhubApiClient>()
        .AddPolicyHandler(GetRetryPolicy());
    builder.Services.AddScoped<IDataProviderContract>(sp => sp.GetRequiredService<IFinnhubApiClient>() as FinnhubApiClient
        ?? throw new InvalidOperationException("FinnhubApiClient must implement IDataProviderContract"));

    // Infrastructure - AlphaVantage Provider
    builder.Services.AddHttpClient<IAlphaVantageApiClient, AlphaVantageApiClient>()
        .AddPolicyHandler(GetRetryPolicy());

    // Infrastructure - Massive Provider (Stock + Crypto)
    builder.Services.AddScoped<IStockIndicatorRepository, StockIndicatorRepository>();
    builder.Services.AddScoped<ICryptoIndicatorRepository, CryptoIndicatorRepository>();
    builder.Services.AddScoped<IStockIndicatorAdvancedRepository, StockIndicatorAdvancedRepository>();
    builder.Services.AddScoped<ICryptoIndicatorAdvancedRepository, CryptoIndicatorAdvancedRepository>();
    builder.Services.AddHttpClient<IMassiveApiClient, MassiveApiClient>()
        .AddPolicyHandler(GetRetryPolicy());

    // Infrastructure - Crypto Ticker
    builder.Services.AddScoped<ICryptoTickerRepository, CryptoTickerRepository>();

    // Application - AlphaVantage Provider
    builder.Services.AddScoped<IEarningsCalendarService, EarningsCalendarService>();

    // Application - Massive Provider (Stock + Crypto)
    builder.Services.AddScoped<IIndicatorFetchService, IndicatorFetchService>();
    builder.Services.AddScoped<ICryptoIndicatorFetchService, CryptoIndicatorFetchService>();

    // Infrastructure - CandlestickAnalysis Provider (Stock + Crypto)
    builder.Services.AddScoped<IStockPriceRepository, StockPriceRepository>();
    builder.Services.AddScoped<IAnalysisRepository, AnalysisRepository>();
    builder.Services.AddScoped<ICryptoPriceRepository, CryptoPriceRepository>();
    builder.Services.AddScoped<ICryptoAnalysisRepository, CryptoAnalysisRepository>();

    // Pipeline
    builder.Services.AddScoped<IBackfillPipelineExecutor, BackfillPipelineExecutor>();
    builder.Services.AddScoped<IBackfillStep, CandlestickBackfillStep>();
    builder.Services.AddScoped<IBackfillStep, PriceTargetBackfillStep>();
    builder.Services.AddScoped<IBackfillStep, MassiveIndicatorBackfillStep>();
    builder.Services.AddScoped<IBackfillStep, IndicatorBackfillStep>();

    // Application - CandlestickAnalysis Provider (Stock + Crypto)
    builder.Services.AddScoped<IDailyAggregationService, DailyAggregationService>();
    builder.Services.AddScoped<IPatternDetectionService, PatternDetectionService>();
    builder.Services.AddScoped<ICandlestickAnalysisService, CandlestickAnalysisService>();
    builder.Services.AddScoped<IAnalysisBackfillService, AnalysisBackfillService>();
    builder.Services.AddScoped<ICryptoDailyAggregationService, CryptoDailyAggregationService>();
    builder.Services.AddScoped<ICryptoCandlestickAnalysisService, CryptoCandlestickAnalysisService>();
    builder.Services.AddScoped<ICryptoAnalysisBackfillService, CryptoAnalysisBackfillService>();

    // Infrastructure - PriceTargetAnalysis Provider
    builder.Services.AddScoped<IPriceTargetRepository, PriceTargetRepository>();
    builder.Services.AddScoped<IPriceTargetParametersRepository, PriceTargetParametersRepository>();
    builder.Services.AddScoped<ICryptoPriceTargetRepository, CryptoPriceTargetRepository>();

    // Application - PriceTargetAnalysis Provider
    builder.Services.AddScoped<IPriceTargetCalculatorService, PriceTargetCalculatorService>();
    builder.Services.AddScoped<IPriceTargetService, PriceTargetService>();
    builder.Services.AddScoped<IPriceTargetBackfillService, PriceTargetBackfillService>();
    builder.Services.AddScoped<ICryptoPriceTargetService, CryptoPriceTargetService>();
    builder.Services.AddScoped<ICryptoPriceTargetBackfillService, CryptoPriceTargetBackfillService>();

    // Infrastructure - Massive Indicator Queue Publisher
    builder.Services.AddSingleton<IMassiveIndicatorQueuePublisher, MassiveIndicatorQueuePublisher>();

    // Infrastructure & Application - FRED Provider
    builder.Services.AddScoped<IFredRepository, FredRepository>();
    builder.Services.AddScoped<IFredFetchService, FredFetchService>();
    builder.Services.AddScoped<IFredCalendarSyncService, FredCalendarSyncService>();
    builder.Services.AddHttpClient<IFredApiClient, FredApiClient>()
        .AddPolicyHandler(GetRetryPolicy());

    // Application & Infrastructure - MarketAux Provider
    builder.Services.AddScoped<IMarketAuxNewsFetchService, MarketAuxNewsFetchService>();
    builder.Services.AddScoped<INewsArticleRepository, NewsArticleRepository>();
    builder.Services.AddHttpClient<IMarketAuxApiClient, MarketAuxApiClient>()
        .AddPolicyHandler(GetRetryPolicy());

    // Infrastructure - Alpaca Provider
    builder.Services.AddScoped<IAlpacaStockPriceRepository, AlpacaStockPriceRepository>();
    builder.Services.AddScoped<IAlpacaCryptoPriceRepository, AlpacaCryptoPriceRepository>();
    builder.Services.AddHttpClient<IAlpacaMarketDataClient, AlpacaMarketDataClient>()
        .AddPolicyHandler(GetRetryPolicy());

    // Application - Alpaca Provider
    builder.Services.AddScoped<IAlpacaStockFetchService, AlpacaStockFetchService>();
    builder.Services.AddScoped<IAlpacaCryptoFetchService, AlpacaCryptoFetchService>();
    builder.Services.AddScoped<IAlpacaStockBackfillService, AlpacaStockBackfillService>();
    builder.Services.AddScoped<IAlpacaCryptoBackfillService, AlpacaCryptoBackfillService>();
    builder.Services.AddScoped<IAlpacaAssetVerificationService, AlpacaAssetVerificationService>();
    builder.Services.AddScoped<IAlpacaTickerManagementService, AlpacaTickerManagementService>();

    // Infrastructure - eToro Provider
    builder.Services.AddHttpClient<IEtoroMarketDataClient, EtoroMarketDataClient>()
        .AddPolicyHandler(GetRetryPolicy());

    // Application - eToro Provider
    builder.Services.AddScoped<EtoroMarketDataProvider>();
    builder.Services.AddScoped<IDataProviderContract>(sp => sp.GetRequiredService<EtoroMarketDataProvider>());
    builder.Services.AddScoped<IEtoroBackfillService, EtoroBackfillService>();

    // Application - Multi-provider abstraction
    builder.Services.AddScoped<AlpacaMarketDataProvider>();
    builder.Services.AddScoped<IDataProviderContract>(sp => sp.GetRequiredService<AlpacaMarketDataProvider>());
    builder.Services.AddScoped<IMarketDataResolver, MarketDataResolver>();
    builder.Services.AddScoped<ITickerManagementService, TickerManagementService>();

    // Application - Scheduling (orchestrated multi-provider services)
    builder.Services.AddScoped<IEarningsSyncService, EarningsSyncService>();
    builder.Services.AddSingleton<IJobDependencyResolver, JobDependencyResolver>();

    // Gateway alert notifier
    builder.Services.AddHttpClient<IGatewayAlertNotifier, GatewayAlertNotifier>();
    builder.Services.AddSingleton<IPipelineEventPublisher, PipelineEventPublisher>();

    // Metrics client
    builder.Services.AddMetricsClient(builder.Configuration);

    // Background workers
    builder.Services.AddHostedService<FinnhubFetchWorker>();
    // Note: AlphaVantageFetchWorker replaced by EarningsSyncWorker which combines AV + Finnhub
    builder.Services.AddHostedService<EarningsSyncWorker>();

    // Massive workers
    builder.Services.AddHostedService<MassiveQueueConsumer>();
    builder.Services.AddHostedService<MassiveFetchWorker>();

    // CandlestickAnalysis workers
    builder.Services.AddHostedService<DataFetcher.Worker.Workers.CandlestickAnalysis.CandlestickAnalysisWorker>();
    builder.Services.AddHostedService<DataFetcher.Worker.Workers.CandlestickAnalysis.AnalysisBackfillQueueConsumer>();

    // Local indicator computation (replaces Massive API for scheduled runs)
    builder.Services.AddScoped<ILocalIndicatorCalculatorService, LocalIndicatorCalculatorService>();

    // Advanced indicator computation (Bollinger, ATR, Stochastic, ADX, OBV, Fibonacci, Pivot, Ichimoku)
    builder.Services.AddScoped<IAdvancedIndicatorCalculatorService, AdvancedIndicatorCalculatorService>();

    // Indicator calculators (individual strategy classes for pipeline use)
    builder.Services.AddSingleton<IIndicatorCalculator, BollingerBandsCalculator>();
    builder.Services.AddSingleton<IIndicatorCalculator, AtrCalculator>();
    builder.Services.AddSingleton<IIndicatorCalculator, StochasticCalculator>();
    builder.Services.AddSingleton<IIndicatorCalculator, AdxCalculator>();
    builder.Services.AddSingleton<IIndicatorCalculator, ObvCalculator>();
    builder.Services.AddSingleton<IIndicatorCalculator, FibonacciCalculator>();
    builder.Services.AddSingleton<IIndicatorCalculator, PivotPointCalculator>();
    builder.Services.AddSingleton<IIndicatorCalculator, IchimokuCalculator>();
    builder.Services.AddSingleton<IIndicatorCalculator, SmaCalculator>();
    builder.Services.AddSingleton<IIndicatorCalculator, EmaCalculator>();
    builder.Services.AddSingleton<IIndicatorCalculator, MacdCalculator>();
    builder.Services.AddSingleton<IIndicatorCalculator, RsiCalculator>();
    builder.Services.AddScoped<ProviderComplianceValidator>();
    builder.Services.AddScoped<IIndicatorDefinition, BasicIndicatorsDefinition>();
    builder.Services.AddScoped<IIndicatorDefinition, AdvancedLocalIndicatorsDefinition>();
    builder.Services.AddScoped<IIndicatorDefinition, ExternalFinnhubIndicatorsDefinition>();
    builder.Services.AddScoped<IIndicatorRegistry, IndicatorRegistry>();

    // Analysis definitions (for startup table validation)
    builder.Services.AddScoped<IAnalysisDefinition, PriceTargetAnalysisDefinition>();
    builder.Services.AddScoped<IAnalysisDefinition, CandlestickAnalysisDefinition>();

    // Asset contexts
    builder.Services.AddSingleton<IAssetContext, StockAssetContext>();
    builder.Services.AddSingleton<IAssetContext, CryptoAssetContext>();
    builder.Services.AddSingleton<IAssetContextFactory, AssetContextFactory>();

    // PriceTargetAnalysis worker
    builder.Services.AddHostedService<PriceTargetWorker>();

    // FRED workers
    builder.Services.AddHostedService<FredFetchWorker>();
    builder.Services.AddHostedService<FredCalendarSyncWorker>();

    // MarketAux workers
    builder.Services.AddHostedService<MarketAuxNewsWorker>();

    // Dynamic indicator scheduling
    builder.Services.AddHostedService<DynamicIndicatorScheduler>();

    // Data completeness monitoring
    builder.Services.AddHostedService<DataCompletenessWorker>();

    // Alpaca workers
    builder.Services.AddHostedService<AlpacaStockFetchWorker>();
    builder.Services.AddHostedService<AlpacaCryptoFetchWorker>();
    builder.Services.AddHostedService<AlpacaBackfillQueueConsumer>();
    builder.Services.AddHostedService<AlpacaCryptoBackfillQueueConsumer>();

    // eToro workers
    builder.Services.AddHostedService<EtoroFetchWorker>();

    // Pipeline orchestration (event-driven)
    builder.Services.AddHostedService<PipelineOrchestratorConsumer>();

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
    registry.Register(new ProviderInfo
    {
        Name = "Massive",
        Description = "Technical indicators (SMA, EMA, MACD, RSI) via centralized RabbitMQ queue",
        StatusEndpoint = "/api/massive/indicators",
        SwaggerGroup = "massive",
        Capabilities = new List<string> { "indicators", "sma", "ema", "macd", "rsi", "backfill" }
    });
    registry.Register(new ProviderInfo
    {
        Name = "CandlestickAnalysis",
        Description = "Candlestick pattern analysis (8 single-candle patterns) with scheduled and backfill processing",
        StatusEndpoint = "/api/analysis/status",
        SwaggerGroup = "analysis",
        Capabilities = new List<string> { "candlestick-patterns", "backfill", "trigger", "webhook" }
    });
    registry.Register(new ProviderInfo
    {
        Name = "PriceTargetAnalysis",
        Description = "Daily price target, entry point, and stop loss calculations using technical composite methodology",
        StatusEndpoint = "/api/price-targets/status",
        SwaggerGroup = "price-targets",
        Capabilities = new List<string> { "price-targets", "entry-price", "stop-loss", "signal" }
    });
    registry.Register(new ProviderInfo
    {
        Name = "Alpaca",
        Description = "OHLCV market data (stocks + crypto) with 15-min delay, pre/post market bars, and automated backfill",
        StatusEndpoint = "/api/alpaca/status",
        SwaggerGroup = "alpaca",
        Capabilities = new List<string> { "ohlcv", "stocks", "crypto", "backfill", "ticker-management", "webhooks" }
    });
    registry.Register(new ProviderInfo
    {
        Name = "eToro",
        Description = "Multi-asset market data - stocks (US + non-US), crypto, commodities, indices, ETFs",
        StatusEndpoint = "/api/etoro/status",
        SwaggerGroup = "alpaca",
        Capabilities = new List<string> { "ohlcv", "stocks", "crypto", "commodities", "indices", "etfs", "non-us-stocks", "backfill" }
    });
    registry.Register(new ProviderInfo
    {
        Name = "FRED",
        Description = "Federal Reserve Economic Data - macro indicators, release calendar, and media-friendly values",
        StatusEndpoint = "/api/fred/status",
        SwaggerGroup = "fred",
        Capabilities = new List<string> { "economic-indicators", "release-calendar", "media-values", "trigger" }
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
        c.SwaggerDoc("massive", new OpenApiInfo
        {
            Title = "Massive Provider",
            Version = "v1",
            Description = "Technical indicators (SMA, EMA, MACD, RSI) via Massive API with centralized RabbitMQ queue for rate limiting"
        });
        c.SwaggerDoc("analysis", new OpenApiInfo
        {
            Title = "Candlestick Analysis Provider",
            Version = "v1",
            Description = "Candlestick pattern analysis. Analyzes daily candles for single-candle patterns (Doji, Hammer, Marubozu, etc.)"
        });
        c.SwaggerDoc("alpaca", new OpenApiInfo
        {
            Title = "Alpaca Provider",
            Version = "v1",
            Description = "OHLCV market data from Alpaca API - stocks, crypto, backfill, and ticker management"
        });
        c.SwaggerDoc("fred", new OpenApiInfo
        {
            Title = "FRED Provider",
            Version = "v1",
            Description = "Federal Reserve Economic Data - macro indicators, release calendar, and media-friendly values"
        });
        c.SwaggerDoc("general", new OpenApiInfo
        {
            Title = "General / Discovery",
            Version = "v1",
            Description = "Centralized multi-provider data fetcher service. Supports Finnhub for stock fundamentals, combined earnings sync (Alpha Vantage + Finnhub), and Massive for technical indicators (SMA, EMA, MACD, RSI)."
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
        c.SwaggerEndpoint("massive/swagger.json", "Massive Provider");
        c.SwaggerEndpoint("analysis/swagger.json", "Candlestick Analysis Provider");
        c.SwaggerEndpoint("alpaca/swagger.json", "Alpaca Provider");
        c.SwaggerEndpoint("fred/swagger.json", "FRED Provider");
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

    // Analysis health checks (for Caddy routing that preserves /api/analysis prefix)
    app.MapHealthChecks("/api/analysis/health", new HealthCheckOptions
    {
        Predicate = _ => true
    });
    app.MapHealthChecks("/api/analysis/health/ready", new HealthCheckOptions
    {
        Predicate = check => check.Tags.Contains("ready")
    });
    app.MapHealthChecks("/api/analysis/health/live", new HealthCheckOptions
    {
        Predicate = _ => false
    });

    // FRED health checks (for Caddy routing that preserves /api/fred prefix)
    app.MapHealthChecks("/api/fred/health", new HealthCheckOptions
    {
        Predicate = _ => true
    });
    app.MapHealthChecks("/api/fred/health/ready", new HealthCheckOptions
    {
        Predicate = check => check.Tags.Contains("ready")
    });
    app.MapHealthChecks("/api/fred/health/live", new HealthCheckOptions
    {
        Predicate = _ => false
    });

    // Controllers
    app.MapControllers();

    // Startup Validation (Phase 3)
    using (var scope = app.Services.CreateScope())
    {
        var indicatorRegistry = scope.ServiceProvider.GetRequiredService<IIndicatorRegistry>();
        var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
        var schedules = await scheduleRepo.GetAllSchedulesAsync();

        var indicatorValidator = new IndicatorComplianceValidator();
        var dbFactory = scope.ServiceProvider.GetRequiredService<IDbConnectionFactory>();
        using var validationConn = dbFactory.CreateConnection();
        var analysisDefinitions = scope.ServiceProvider.GetServices<IAnalysisDefinition>();
        var indicatorResult = await indicatorValidator.ValidateAsync(
            indicatorRegistry, schedules, validationConn, analysisDefinitions);

        if (!indicatorResult.IsValid)
        {
            foreach (var error in indicatorResult.Errors)
                Log.Error("Indicator compliance: {Error}", error);

            throw new InvalidOperationException(
                $"Indicator compliance failed:\n{string.Join("\n", indicatorResult.Errors)}");
        }

        Log.Information("Indicator compliance validation passed ({Count} definitions verified)",
            indicatorRegistry.GetAllDefinitions().Count);

        var providers = scope.ServiceProvider.GetServices<IDataProviderContract>();
        var providerValidator = scope.ServiceProvider.GetRequiredService<ProviderComplianceValidator>();
        var providerResult = await providerValidator.ValidateAsync(providers, CancellationToken.None);

        if (!providerResult.IsValid)
        {
            foreach (var error in providerResult.Errors)
                Log.Error("Provider compliance: {Error}", error);

            throw new InvalidOperationException(
                $"Provider compliance failed:\n{string.Join("\n", providerResult.Errors)}");
        }

        Log.Information("Provider compliance validation passed ({Count} providers verified)",
            providers.Count());
    }

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
