using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using TwelveData.Worker.Configuration;
using TwelveData.Worker.Models;
using TwelveData.Worker.Repositories;
using TwelveData.Worker.Services.Verification;

namespace TwelveData.Worker.Services;

public class TickerManagementService : ITickerManagementService
{
    private readonly IAssetVerifierFactory _verifierFactory;
    private readonly IStockTickerRepository _stockTickerRepository;
    private readonly ICryptoTickerRepository _cryptoTickerRepository;
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<TickerManagementService> _logger;

    // Symbol validation regex: alphanumeric, slash, hyphen, dot
    private static readonly Regex SymbolRegex = new(@"^[A-Za-z0-9/\-\.]+$", RegexOptions.Compiled);
    
    // Queue name for deferred ticker additions
    private const string TickerAddQueueName = "ticker-add-queue";

    public TickerManagementService(
        IAssetVerifierFactory verifierFactory,
        IStockTickerRepository stockTickerRepository,
        ICryptoTickerRepository cryptoTickerRepository,
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<TickerManagementService> logger)
    {
        _verifierFactory = verifierFactory;
        _stockTickerRepository = stockTickerRepository;
        _cryptoTickerRepository = cryptoTickerRepository;
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
    }

    public async Task<AddTickerResult> AddTickerAsync(AddTickerRequest request, CancellationToken cancellationToken = default)
    {
        try
        {
            // Step 1: Validate and sanitize input
            var validationError = ValidateSymbol(request.Symbol);
            if (validationError != null)
            {
                return AddTickerResult.ValidationError(validationError);
            }

            var symbol = request.Symbol.ToUpperInvariant().Trim();

            // Step 2: Check if ticker already exists in database
            var existingResult = await CheckExistingTickerAsync(symbol, request.AssetType);
            if (existingResult != null)
            {
                return existingResult;
            }

            // Step 3: Verify symbol exists in Twelve Data
            var verifier = _verifierFactory.GetVerifier(request.AssetType);
            var verificationResult = await verifier.VerifyAsync(symbol, cancellationToken);

            if (!verificationResult.IsValid)
            {
                // Check if it's a rate limit issue (queued)
                if (verificationResult.ErrorMessage?.Contains("rate limit", StringComparison.OrdinalIgnoreCase) == true)
                {
                    // Queue for later processing
                    await QueueTickerAddRequestAsync(request);
                    return AddTickerResult.Queued(symbol);
                }

                if (verificationResult.ErrorMessage?.Contains("not found", StringComparison.OrdinalIgnoreCase) == true)
                {
                    return AddTickerResult.NotFound(symbol, request.AssetType);
                }

                return AddTickerResult.Error(verificationResult.ErrorMessage ?? "Verification failed");
            }

            // Step 4: Create ticker in database
            var tickerData = await CreateTickerAsync(verificationResult);

            _logger.LogInformation(
                "Ticker {Symbol} ({AssetType}) added successfully. ID: {Id}",
                symbol, request.AssetType, tickerData.Id);

            return AddTickerResult.Created(tickerData);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding ticker {Symbol} ({AssetType})", request.Symbol, request.AssetType);
            return AddTickerResult.Error($"Internal error: {ex.Message}");
        }
    }

    public async Task<ToggleTickerResult> ToggleTickerAsync(int tickerId, AssetType assetType, CancellationToken cancellationToken = default)
    {
        try
        {
            switch (assetType)
            {
                case AssetType.Stock:
                case AssetType.Etf:
                {
                    var ticker = await _stockTickerRepository.GetByIdAsync(tickerId);
                    if (ticker == null)
                    {
                        return ToggleTickerResult.NotFound(tickerId);
                    }

                    var updated = await _stockTickerRepository.UpdateActiveStatusAsync(tickerId, !ticker.IsActive);
                    if (updated == null)
                    {
                        return ToggleTickerResult.Error(tickerId, "Failed to update ticker");
                    }

                    _logger.LogInformation(
                        "Ticker {Id} ({Symbol}) toggled to {Status}",
                        tickerId, ticker.Symbol, updated.IsActive ? "active" : "inactive");

                    return ToggleTickerResult.Toggled(tickerId, updated.IsActive);
                }

                case AssetType.Crypto:
                {
                    var ticker = await _cryptoTickerRepository.GetByIdAsync(tickerId);
                    if (ticker == null)
                    {
                        return ToggleTickerResult.NotFound(tickerId);
                    }

                    var updated = await _cryptoTickerRepository.UpdateActiveStatusAsync(tickerId, !ticker.IsActive);
                    if (updated == null)
                    {
                        return ToggleTickerResult.Error(tickerId, "Failed to update ticker");
                    }

                    _logger.LogInformation(
                        "Crypto ticker {Id} ({Symbol}) toggled to {Status}",
                        tickerId, ticker.Symbol, updated.IsActive ? "active" : "inactive");

                    return ToggleTickerResult.Toggled(tickerId, updated.IsActive);
                }

                default:
                    return ToggleTickerResult.Error(tickerId, $"Unsupported asset type: {assetType}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error toggling ticker {TickerId} ({AssetType})", tickerId, assetType);
            return ToggleTickerResult.Error(tickerId, $"Internal error: {ex.Message}");
        }
    }

    public async Task<IEnumerable<TickerResultData>> GetTickersAsync(AssetType assetType, bool? isActive = null, CancellationToken cancellationToken = default)
    {
        switch (assetType)
        {
            case AssetType.Stock:
            case AssetType.Etf:
            {
                var tickers = isActive == true 
                    ? await _stockTickerRepository.GetActiveTickersAsync()
                    : await _stockTickerRepository.GetAllTickersAsync();

                if (isActive == false)
                {
                    tickers = tickers.Where(t => !t.IsActive);
                }

                return tickers.Select(t => new TickerResultData
                {
                    Id = t.Id,
                    Symbol = t.Symbol,
                    Name = t.Name,
                    Exchange = t.Exchange,
                    Currency = t.Currency,
                    AssetType = assetType,
                    IsActive = t.IsActive
                });
            }

            case AssetType.Crypto:
            {
                var tickers = isActive == true 
                    ? await _cryptoTickerRepository.GetActiveTickersAsync()
                    : await _cryptoTickerRepository.GetAllTickersAsync();

                if (isActive == false)
                {
                    tickers = tickers.Where(t => !t.IsActive);
                }

                return tickers.Select(t => new TickerResultData
                {
                    Id = t.Id,
                    Symbol = t.Symbol,
                    Name = t.Name,
                    AssetType = AssetType.Crypto,
                    IsActive = t.IsActive
                });
            }

            default:
                return Enumerable.Empty<TickerResultData>();
        }
    }

    private static string? ValidateSymbol(string symbol)
    {
        if (string.IsNullOrWhiteSpace(symbol))
        {
            return "Symbol is required";
        }

        if (symbol.Length > 20)
        {
            return "Symbol cannot exceed 20 characters";
        }

        if (!SymbolRegex.IsMatch(symbol))
        {
            return "Symbol can only contain letters, numbers, slash, hyphen, and dot";
        }

        return null;
    }

    private async Task<AddTickerResult?> CheckExistingTickerAsync(string symbol, AssetType assetType)
    {
        switch (assetType)
        {
            case AssetType.Stock:
            case AssetType.Etf:
            {
                var existing = await _stockTickerRepository.GetBySymbolAsync(symbol);
                if (existing != null)
                {
                    if (existing.IsActive)
                    {
                        return AddTickerResult.AlreadyExists(new TickerResultData
                        {
                            Id = existing.Id,
                            Symbol = existing.Symbol,
                            Name = existing.Name,
                            Exchange = existing.Exchange,
                            Currency = existing.Currency,
                            AssetType = assetType,
                            IsActive = true
                        });
                    }

                    // Re-enable disabled ticker
                    var updated = await _stockTickerRepository.UpdateActiveStatusAsync(existing.Id, true);
                    return AddTickerResult.Enabled(new TickerResultData
                    {
                        Id = updated!.Id,
                        Symbol = updated.Symbol,
                        Name = updated.Name,
                        Exchange = updated.Exchange,
                        Currency = updated.Currency,
                        AssetType = assetType,
                        IsActive = true
                    });
                }
                break;
            }

            case AssetType.Crypto:
            {
                var existing = await _cryptoTickerRepository.GetBySymbolAsync(symbol);
                if (existing != null)
                {
                    if (existing.IsActive)
                    {
                        return AddTickerResult.AlreadyExists(new TickerResultData
                        {
                            Id = existing.Id,
                            Symbol = existing.Symbol,
                            Name = existing.Name,
                            AssetType = AssetType.Crypto,
                            IsActive = true
                        });
                    }

                    // Re-enable disabled ticker
                    var updated = await _cryptoTickerRepository.UpdateActiveStatusAsync(existing.Id, true);
                    return AddTickerResult.Enabled(new TickerResultData
                    {
                        Id = updated!.Id,
                        Symbol = updated.Symbol,
                        Name = updated.Name,
                        AssetType = AssetType.Crypto,
                        IsActive = true
                    });
                }
                break;
            }
        }

        return null; // Ticker doesn't exist
    }

    private async Task<TickerResultData> CreateTickerAsync(VerificationResult verification)
    {
        switch (verification.AssetType)
        {
            case AssetType.Stock:
            case AssetType.Etf:
            {
                var ticker = await _stockTickerRepository.CreateTickerAsync(
                    verification.Symbol,
                    verification.Name,
                    verification.Exchange,
                    verification.Currency ?? "USD");

                return new TickerResultData
                {
                    Id = ticker.Id,
                    Symbol = ticker.Symbol,
                    Name = ticker.Name,
                    Exchange = ticker.Exchange,
                    Currency = ticker.Currency,
                    AssetType = verification.AssetType,
                    IsActive = true
                };
            }

            case AssetType.Crypto:
            {
                var ticker = await _cryptoTickerRepository.CreateTickerAsync(
                    verification.Symbol,
                    verification.Name);

                return new TickerResultData
                {
                    Id = ticker.Id,
                    Symbol = ticker.Symbol,
                    Name = ticker.Name,
                    AssetType = AssetType.Crypto,
                    IsActive = true
                };
            }

            default:
                throw new ArgumentException($"Unsupported asset type: {verification.AssetType}");
        }
    }

    private Task QueueTickerAddRequestAsync(AddTickerRequest request)
    {
        return Task.Run(() =>
        {
            try
            {
                var factory = new ConnectionFactory
                {
                    HostName = _rabbitSettings.HostName,
                    UserName = _rabbitSettings.UserName,
                    Password = _rabbitSettings.Password,
                    Port = _rabbitSettings.Port
                };

                using var connection = factory.CreateConnection();
                using var channel = connection.CreateModel();

                channel.QueueDeclare(
                    queue: TickerAddQueueName,
                    durable: true,
                    exclusive: false,
                    autoDelete: false,
                    arguments: null);

                var message = JsonSerializer.Serialize(new
                {
                    Symbol = request.Symbol,
                    AssetType = request.AssetType.ToString(),
                    QueuedAt = DateTime.UtcNow
                });

                var body = Encoding.UTF8.GetBytes(message);

                var properties = channel.CreateBasicProperties();
                properties.Persistent = true;

                channel.BasicPublish(
                    exchange: "",
                    routingKey: TickerAddQueueName,
                    basicProperties: properties,
                    body: body);

                _logger.LogInformation(
                    "Queued ticker add request for {Symbol} ({AssetType})",
                    request.Symbol, request.AssetType);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to queue ticker add request for {Symbol}", request.Symbol);
                throw;
            }
        });
    }
}
