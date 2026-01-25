using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace TwelveData.Worker.Models;

/// <summary>
/// Request to add a new ticker
/// </summary>
public class AddTickerRequest
{
    /// <summary>
    /// The ticker symbol (e.g., "AAPL", "SPY", "BTC/USD")
    /// </summary>
    [Required]
    [StringLength(20, MinimumLength = 1)]
    [RegularExpression(@"^[A-Za-z0-9/\-\.]+$", ErrorMessage = "Symbol can only contain letters, numbers, slash, hyphen, and dot")]
    public string Symbol { get; set; } = string.Empty;
    
    /// <summary>
    /// The asset type: stock, etf, or crypto
    /// </summary>
    [Required]
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public AssetType AssetType { get; set; }
}

/// <summary>
/// Result of adding a ticker
/// </summary>
public class AddTickerResult
{
    public bool Success { get; init; }
    public string? Message { get; init; }
    public TickerResultData? Data { get; init; }
    public string? ErrorCode { get; init; }
    
    public static AddTickerResult Created(TickerResultData data) => new()
    {
        Success = true,
        Message = "Ticker added successfully",
        Data = data
    };
    
    public static AddTickerResult Enabled(TickerResultData data) => new()
    {
        Success = true,
        Message = "Ticker re-enabled successfully",
        Data = data
    };
    
    public static AddTickerResult AlreadyExists(TickerResultData data) => new()
    {
        Success = true,
        Message = "Ticker already exists and is active",
        Data = data
    };
    
    public static AddTickerResult Queued(string symbol) => new()
    {
        Success = true,
        Message = "Request queued for processing (daily rate limit reached)",
        ErrorCode = "QUEUED",
        Data = new TickerResultData { Symbol = symbol }
    };
    
    public static AddTickerResult NotFound(string symbol, AssetType assetType) => new()
    {
        Success = false,
        Message = $"Symbol '{symbol}' not found in Twelve Data {assetType} catalog",
        ErrorCode = "NOT_FOUND"
    };
    
    public static AddTickerResult ValidationError(string message) => new()
    {
        Success = false,
        Message = message,
        ErrorCode = "VALIDATION_ERROR"
    };
    
    public static AddTickerResult Error(string message, string errorCode = "ERROR") => new()
    {
        Success = false,
        Message = message,
        ErrorCode = errorCode
    };
}

public class TickerResultData
{
    public int? Id { get; init; }
    public string Symbol { get; init; } = string.Empty;
    public string? Name { get; init; }
    public string? Exchange { get; init; }
    public string? Currency { get; init; }
    public AssetType? AssetType { get; init; }
    public bool? IsActive { get; init; }
}

/// <summary>
/// Result of toggling a ticker's active status
/// </summary>
public class ToggleTickerResult
{
    public bool Success { get; init; }
    public string? Message { get; init; }
    public int TickerId { get; init; }
    public bool IsActive { get; init; }
    public string? ErrorCode { get; init; }
    
    public static ToggleTickerResult Toggled(int tickerId, bool isActive) => new()
    {
        Success = true,
        Message = isActive ? "Ticker enabled" : "Ticker disabled",
        TickerId = tickerId,
        IsActive = isActive
    };
    
    public static ToggleTickerResult NotFound(int tickerId) => new()
    {
        Success = false,
        Message = $"Ticker with ID {tickerId} not found",
        TickerId = tickerId,
        ErrorCode = "NOT_FOUND"
    };
    
    public static ToggleTickerResult Error(int tickerId, string message) => new()
    {
        Success = false,
        Message = message,
        TickerId = tickerId,
        ErrorCode = "ERROR"
    };
}
