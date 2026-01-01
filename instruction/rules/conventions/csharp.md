# C# (.NET) Coding Conventions

**Last Updated**: 2026-01-01
**Applies To**: All .NET 8 services (TwelveData worker, Metrics service, shared libraries)

---

## Naming Conventions

### General Rules

- Use **PascalCase** for: Classes, Methods, Properties, Public Fields, Constants
- Use **camelCase** for: Private fields, local variables, method parameters
- Use **_camelCase** (underscore prefix) for: Private instance fields
- Use **SCREAMING_SNAKE_CASE** for: Configuration constants only

### Examples

```csharp
// Classes and interfaces
public class DataFetcherService { }
public interface IMetricsClient { }

// Methods and properties
public async Task<StockData> FetchSymbolAsync(string symbol) { }
public DateTime LastFetchTime { get; set; }

// Private fields
private readonly ILogger<DataFetcherService> _logger;
private readonly HttpClient _httpClient;

// Local variables
var fetchResult = await client.GetAsync(url);
string symbolName = "AAPL";
```

### Database Mapping

- **Entity classes** in `StockTracker.Data.Entities` use PascalCase
- **Database columns** use snake_case (e.g., `created_at`, `user_id`)
- **EF Core configurations** handle the mapping

```csharp
// Entity class
public class StockPrice
{
    public Guid Id { get; set; }
    public string Symbol { get; set; }
    public DateTime CreatedAt { get; set; }  // Maps to "created_at"
}

// EF Configuration
entity.Property(e => e.CreatedAt)
    .HasColumnName("created_at");
```

---

## Project Structure

| Project | Purpose | Dependencies |
|---------|---------|--------------|
| `StockTracker.Data` | EF Core entities & DbContext | EF Core, Npgsql |
| `StockTracker.Data.Migrations` | Migration CLI tool | StockTracker.Data |
| `StockTracker.Common` | Shared utilities, metrics client | - |
| `services/data-fetchers/TwelveData` | Stock data fetcher worker | Dapper, StockTracker.Data |
| `services/metrics` | Metrics aggregation API | Prometheus, StockTracker.Common |

---

## Error Handling

### General Principles

1. **Fail fast**: Validate inputs at method entry
2. **Use specific exceptions**: Prefer custom exceptions over generic ones
3. **Don't swallow exceptions**: Always log before rethrowing or returning error
4. **Handle at appropriate level**: Handle errors where you have context to recover

### Exception Patterns

#### Custom Exceptions

```csharp
// Domain-specific exceptions
public class DataFetchException : Exception
{
    public string Symbol { get; }
    public HttpStatusCode? StatusCode { get; }

    public DataFetchException(string symbol, string message, HttpStatusCode? statusCode = null)
        : base(message)
    {
        Symbol = symbol;
        StatusCode = statusCode;
    }
}

public class ConfigurationMissingException : Exception
{
    public string SettingName { get; }

    public ConfigurationMissingException(string settingName)
        : base($"Required configuration setting '{settingName}' is missing")
    {
        SettingName = settingName;
    }
}
```

#### Try-Catch Patterns

```csharp
// Example: API controller with proper error handling
[HttpPost("api/fetch/trigger/{symbol}")]
public async Task<IActionResult> TriggerFetch(string symbol)
{
    try
    {
        // Validate input
        if (string.IsNullOrWhiteSpace(symbol))
        {
            return BadRequest(new { error = "Symbol is required" });
        }

        // Execute operation
        var result = await _fetchService.FetchSymbolAsync(symbol);
        return Ok(result);
    }
    catch (DataFetchException ex)
    {
        // Log with context
        _logger.LogError(ex, "Failed to fetch symbol {Symbol}: {Message}", symbol, ex.Message);

        // Return appropriate HTTP status
        return StatusCode(ex.StatusCode.HasValue ? (int)ex.StatusCode.Value : 500,
            new { error = ex.Message, symbol = ex.Symbol });
    }
    catch (Exception ex)
    {
        // Log unexpected errors
        _logger.LogError(ex, "Unexpected error fetching symbol {Symbol}", symbol);
        return StatusCode(500, new { error = "Internal server error" });
    }
}
```

#### Retry with Polly

```csharp
using Polly;
using Polly.Retry;

// In service registration
services.AddHttpClient<IDataFetcherClient, DataFetcherClient>()
    .AddTransientHttpErrorPolicy(policyBuilder => policyBuilder
        .WaitAndRetryAsync(
            retryCount: 3,
            sleepDurationProvider: retryAttempt => TimeSpan.FromSeconds(Math.Pow(2, retryAttempt)),
            onRetry: (outcome, timespan, retryAttempt, context) =>
            {
                logger.LogWarning("Retry {RetryAttempt} after {Delay}ms", retryAttempt, timespan.TotalMilliseconds);
            }));
```

---

## Logging Patterns

### Use Structured Logging (Serilog)

**Install packages:**
```xml
<PackageReference Include="Serilog.AspNetCore" Version="8.0.0" />
<PackageReference Include="Serilog.Sinks.Console" Version="5.0.0" />
```

### Configuration

```csharp
// Program.cs
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// Configure Serilog
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateLogger();

builder.Host.UseSerilog();

try
{
    var app = builder.Build();
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}
```

### Logging Best Practices

```csharp
public class DataFetcherService
{
    private readonly ILogger<DataFetcherService> _logger;

    public DataFetcherService(ILogger<DataFetcherService> logger)
    {
        _logger = logger;
    }

    public async Task<StockData> FetchSymbolAsync(string symbol)
    {
        // Use structured logging with named parameters
        _logger.LogInformation("Fetching data for symbol {Symbol}", symbol);

        try
        {
            var stopwatch = Stopwatch.StartNew();
            var data = await _apiClient.GetDataAsync(symbol);
            stopwatch.Stop();

            // Log metrics
            _logger.LogInformation(
                "Successfully fetched {RecordCount} records for {Symbol} in {ElapsedMs}ms",
                data.Count, symbol, stopwatch.ElapsedMilliseconds);

            return data;
        }
        catch (HttpRequestException ex)
        {
            // Log errors with context (NO secrets!)
            _logger.LogError(ex,
                "HTTP error fetching symbol {Symbol}: {StatusCode}",
                symbol, ex.StatusCode);
            throw;
        }
    }
}
```

### Log Levels

| Level | When to Use | Example |
|-------|-------------|---------|
| **Trace** | Very detailed debugging | SQL query parameters |
| **Debug** | Development debugging | Method entry/exit |
| **Information** | Normal flow | "Started processing", "Completed successfully" |
| **Warning** | Unexpected but recoverable | "Retry attempt 2/3", "Using fallback value" |
| **Error** | Operation failed | "API call failed", exceptions |
| **Critical** | System failure | "Database unavailable", "Out of memory" |

### What NOT to Log

```csharp
// ❌ BAD - Logging secrets
_logger.LogInformation("Connecting with API key {ApiKey}", apiKey);

// ✅ GOOD - Mask or omit secrets
_logger.LogInformation("Connecting to API with key {MaskedKey}", MaskApiKey(apiKey));

// ❌ BAD - Logging full connection strings
_logger.LogError("Failed to connect: {ConnectionString}", connectionString);

// ✅ GOOD - Log without secrets
_logger.LogError("Failed to connect to database at {Host}", dbHost);
```

---

## Async/Await Best Practices

### General Rules

1. **Use async all the way**: Don't mix sync and async code
2. **Avoid `async void`**: Use `async Task` (except event handlers)
3. **Don't block**: Never use `.Result` or `.Wait()` on Tasks
4. **ConfigureAwait**: Use `ConfigureAwait(false)` in libraries (not needed in ASP.NET Core apps)
5. **Cancellation tokens**: Pass `CancellationToken` for long-running operations

### Examples

```csharp
// ✅ GOOD - Async all the way
public async Task<StockData> FetchDataAsync(string symbol, CancellationToken cancellationToken = default)
{
    var response = await _httpClient.GetAsync($"/api/data/{symbol}", cancellationToken);
    response.EnsureSuccessStatusCode();

    var content = await response.Content.ReadAsStringAsync(cancellationToken);
    return JsonSerializer.Deserialize<StockData>(content);
}

// ❌ BAD - Blocking async code
public StockData FetchDataSync(string symbol)
{
    return FetchDataAsync(symbol).Result;  // DEADLOCK RISK!
}

// ✅ GOOD - Using cancellation tokens
public async Task ProcessDataAsync(CancellationToken cancellationToken)
{
    while (!cancellationToken.IsCancellationRequested)
    {
        await Task.Delay(TimeSpan.FromMinutes(1), cancellationToken);
        await FetchAndProcessAsync(cancellationToken);
    }
}

// ✅ GOOD - Parallel operations
public async Task<List<StockData>> FetchMultipleSymbolsAsync(string[] symbols)
{
    var fetchTasks = symbols.Select(symbol => FetchDataAsync(symbol));
    var results = await Task.WhenAll(fetchTasks);
    return results.ToList();
}
```

---

## Dependency Injection

### Registration Patterns

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

// Transient - new instance every time
builder.Services.AddTransient<IDataValidator, DataValidator>();

// Scoped - one instance per request
builder.Services.AddScoped<IDataFetcherService, DataFetcherService>();

// Singleton - one instance for application lifetime
builder.Services.AddSingleton<IMetricsClient, PrometheusMetricsClient>();

// HttpClient with typed client
builder.Services.AddHttpClient<ITwelveDataClient, TwelveDataClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["TwelveData:BaseUrl"]);
    client.Timeout = TimeSpan.FromSeconds(30);
});

// Options pattern
builder.Services.Configure<TwelveDataOptions>(
    builder.Configuration.GetSection("TwelveData"));
```

### Constructor Injection

```csharp
public class DataFetcherService : IDataFetcherService
{
    private readonly ILogger<DataFetcherService> _logger;
    private readonly ITwelveDataClient _apiClient;
    private readonly IMetricsClient _metricsClient;
    private readonly IOptions<TwelveDataOptions> _options;

    public DataFetcherService(
        ILogger<DataFetcherService> logger,
        ITwelveDataClient apiClient,
        IMetricsClient metricsClient,
        IOptions<TwelveDataOptions> options)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _apiClient = apiClient ?? throw new ArgumentNullException(nameof(apiClient));
        _metricsClient = metricsClient ?? throw new ArgumentNullException(nameof(metricsClient));
        _options = options ?? throw new ArgumentNullException(nameof(options));
    }
}
```

---

## Data Access with Dapper

### Why Dapper?

- **Performance**: Faster than EF Core for queries
- **Control**: Full control over SQL
- **Simplicity**: Minimal overhead

### Dapper Patterns

```csharp
using Dapper;
using Npgsql;

public class StockDataRepository
{
    private readonly string _connectionString;
    private readonly ILogger<StockDataRepository> _logger;

    public StockDataRepository(IConfiguration config, ILogger<StockDataRepository> logger)
    {
        _connectionString = config.GetConnectionString("DefaultConnection")
            ?? throw new ConfigurationMissingException("DefaultConnection");
        _logger = logger;
    }

    // Query single record
    public async Task<StockPrice?> GetLatestPriceAsync(string symbol)
    {
        const string sql = @"
            SELECT id, symbol, price, volume, timestamp, created_at
            FROM stock_prices
            WHERE symbol = @Symbol
            ORDER BY timestamp DESC
            LIMIT 1";

        await using var connection = new NpgsqlConnection(_connectionString);
        return await connection.QuerySingleOrDefaultAsync<StockPrice>(sql, new { Symbol = symbol });
    }

    // Query multiple records
    public async Task<IEnumerable<StockPrice>> GetPricesAsync(string symbol, DateTime startDate)
    {
        const string sql = @"
            SELECT id, symbol, price, volume, timestamp, created_at
            FROM stock_prices
            WHERE symbol = @Symbol AND timestamp >= @StartDate
            ORDER BY timestamp ASC";

        await using var connection = new NpgsqlConnection(_connectionString);
        return await connection.QueryAsync<StockPrice>(sql, new { Symbol = symbol, StartDate = startDate });
    }

    // Insert with returning ID
    public async Task<Guid> InsertPriceAsync(StockPrice price)
    {
        const string sql = @"
            INSERT INTO stock_prices (symbol, price, volume, timestamp, created_at)
            VALUES (@Symbol, @Price, @Volume, @Timestamp, @CreatedAt)
            RETURNING id";

        await using var connection = new NpgsqlConnection(_connectionString);
        return await connection.ExecuteScalarAsync<Guid>(sql, price);
    }

    // Bulk insert
    public async Task BulkInsertPricesAsync(IEnumerable<StockPrice> prices)
    {
        const string sql = @"
            INSERT INTO stock_prices (symbol, price, volume, timestamp, created_at)
            VALUES (@Symbol, @Price, @Volume, @Timestamp, @CreatedAt)";

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.ExecuteAsync(sql, prices);
    }

    // Transaction example
    public async Task TransferDataAsync(string fromSymbol, string toSymbol)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();

        await using var transaction = await connection.BeginTransactionAsync();
        try
        {
            await connection.ExecuteAsync(
                "UPDATE stock_prices SET symbol = @To WHERE symbol = @From",
                new { From = fromSymbol, To = toSymbol },
                transaction);

            await connection.ExecuteAsync(
                "INSERT INTO audit_log (action, details) VALUES (@Action, @Details)",
                new { Action = "symbol_transfer", Details = $"{fromSymbol} -> {toSymbol}" },
                transaction);

            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }
}
```

### Handling PostgreSQL TIME columns

```csharp
// PostgreSQL TIME maps to TimeSpan in C#, NOT TimeOnly
public class TradingHours
{
    public TimeSpan MarketOpen { get; set; }  // 09:30:00
    public TimeSpan MarketClose { get; set; } // 16:00:00
}

// If you need TimeOnly, convert:
var timeOnly = TimeOnly.FromTimeSpan(tradingHours.MarketOpen);
```

---

## Testing Standards

### Unit Tests

```csharp
using Xunit;
using Moq;
using FluentAssertions;

public class DataFetcherServiceTests
{
    private readonly Mock<ILogger<DataFetcherService>> _loggerMock;
    private readonly Mock<ITwelveDataClient> _apiClientMock;
    private readonly DataFetcherService _sut;  // System Under Test

    public DataFetcherServiceTests()
    {
        _loggerMock = new Mock<ILogger<DataFetcherService>>();
        _apiClientMock = new Mock<ITwelveDataClient>();
        _sut = new DataFetcherService(_loggerMock.Object, _apiClientMock.Object);
    }

    [Fact]
    public async Task FetchSymbolAsync_ValidSymbol_ReturnsData()
    {
        // Arrange
        var symbol = "AAPL";
        var expectedData = new StockData { Symbol = symbol, Price = 150.00m };
        _apiClientMock
            .Setup(x => x.GetDataAsync(symbol))
            .ReturnsAsync(expectedData);

        // Act
        var result = await _sut.FetchSymbolAsync(symbol);

        // Assert
        result.Should().NotBeNull();
        result.Symbol.Should().Be(symbol);
        result.Price.Should().Be(150.00m);

        _apiClientMock.Verify(x => x.GetDataAsync(symbol), Times.Once);
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("  ")]
    public async Task FetchSymbolAsync_InvalidSymbol_ThrowsArgumentException(string invalidSymbol)
    {
        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(() => _sut.FetchSymbolAsync(invalidSymbol));
    }
}
```

### Integration Tests

```csharp
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

public class TwelveDataApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    public TwelveDataApiTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task HealthCheck_ReturnsOk()
    {
        // Act
        var response = await _client.GetAsync("/health/live");

        // Assert
        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain("Healthy");
    }
}
```

---

## Configuration

### Environment Variables

Use double-underscore notation to override nested configuration:

```bash
# appsettings.json: { "Supabase": { "Url": "" } }
Supabase__Url=https://example.supabase.co

# appsettings.json: { "ConnectionStrings": { "DefaultConnection": "" } }
ConnectionStrings__DefaultConnection=postgresql://...
```

### Validating Configuration

```csharp
// In Program.cs
var twelveDataApiKey = builder.Configuration["TwelveData:ApiKey"]
    ?? throw new ConfigurationMissingException("TwelveData:ApiKey");
```

---

## Related Documentation

### Rules
- [Security Best Practices](../security.md)
- [Docker Conventions](./docker.md)
- [TypeScript Conventions](./typescript.md)
- [AI Behavior Guidelines](../ai-behavior.md) - Code review checklist

### Skills
- [Creating New Worker Skill](../../skills/creating-new-worker/SKILL.md) - Creating .NET workers
