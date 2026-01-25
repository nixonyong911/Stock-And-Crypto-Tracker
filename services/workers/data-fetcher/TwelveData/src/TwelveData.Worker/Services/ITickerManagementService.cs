using TwelveData.Worker.Models;

namespace TwelveData.Worker.Services;

/// <summary>
/// Service for managing ticker CRUD operations with verification
/// </summary>
public interface ITickerManagementService
{
    /// <summary>
    /// Adds a new ticker after verifying it exists in Twelve Data
    /// </summary>
    Task<AddTickerResult> AddTickerAsync(AddTickerRequest request, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Toggles the active status of a ticker
    /// </summary>
    Task<ToggleTickerResult> ToggleTickerAsync(int tickerId, AssetType assetType, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Gets all tickers of a specific asset type
    /// </summary>
    Task<IEnumerable<TickerResultData>> GetTickersAsync(AssetType assetType, bool? isActive = null, CancellationToken cancellationToken = default);
}
