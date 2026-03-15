namespace DataFetcher.Worker.Application.Providers.Common;

public interface ITickerManagementService
{
    Task<AddTickerResult> AddTickerAsync(AddTickerRequest request, CancellationToken ct = default);
}

public class AddTickerRequest
{
    public string Symbol { get; set; } = string.Empty;
    public string AssetType { get; set; } = "Stock";
}

public class AddTickerResult
{
    public string ResultCode { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? ErrorCode { get; set; }
    public string? Provider { get; set; }
    public AddTickerData? Data { get; set; }
}

public class AddTickerData
{
    public int Id { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? Exchange { get; set; }
}
