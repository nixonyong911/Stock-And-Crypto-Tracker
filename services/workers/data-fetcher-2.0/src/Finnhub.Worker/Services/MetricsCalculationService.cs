using Finnhub.Worker.Domain.Models;

namespace Finnhub.Worker.Services;

/// <summary>
/// Service for calculating derived financial metrics.
/// </summary>
public class MetricsCalculationService
{
    private readonly ILogger<MetricsCalculationService> _logger;

    public MetricsCalculationService(ILogger<MetricsCalculationService> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Calculates FCF Yield: Free Cash Flow / Market Cap.
    /// </summary>
    public decimal? CalculateFcfYield(decimal? freeCashFlow, decimal? marketCap)
    {
        if (!freeCashFlow.HasValue || !marketCap.HasValue || marketCap.Value == 0)
            return null;

        return (freeCashFlow.Value / marketCap.Value) * 100; // Return as percentage
    }

    /// <summary>
    /// Calculates PEG Ratio: P/E Ratio / EPS Growth Rate.
    /// </summary>
    public decimal? CalculatePegRatio(decimal? peRatio, decimal? epsGrowthYoy)
    {
        if (!peRatio.HasValue || !epsGrowthYoy.HasValue || epsGrowthYoy.Value == 0)
            return null;

        return peRatio.Value / epsGrowthYoy.Value;
    }

    /// <summary>
    /// Calculates Year-over-Year growth rate.
    /// </summary>
    public decimal? CalculateYoyGrowth(decimal? currentValue, decimal? previousYearValue)
    {
        if (!currentValue.HasValue || !previousYearValue.HasValue || previousYearValue.Value == 0)
            return null;

        return ((currentValue.Value - previousYearValue.Value) / Math.Abs(previousYearValue.Value)) * 100;
    }

    /// <summary>
    /// Calculates Interest Coverage: EBIT / Interest Expense.
    /// </summary>
    public decimal? CalculateInterestCoverage(decimal? ebit, decimal? interestExpense)
    {
        if (!ebit.HasValue || !interestExpense.HasValue || interestExpense.Value == 0)
            return null;

        return ebit.Value / Math.Abs(interestExpense.Value);
    }

    /// <summary>
    /// Determines the fiscal quarter from a date.
    /// </summary>
    public string GetFiscalQuarter(int month)
    {
        return month switch
        {
            >= 1 and <= 3 => "Q1",
            >= 4 and <= 6 => "Q2",
            >= 7 and <= 9 => "Q3",
            _ => "Q4"
        };
    }

    /// <summary>
    /// Extracts a metric value from the Finnhub metrics dictionary.
    /// </summary>
    public decimal? ExtractMetric(Dictionary<string, object?>? metrics, string key)
    {
        if (metrics == null || !metrics.TryGetValue(key, out var value) || value == null)
            return null;

        try
        {
            if (value is System.Text.Json.JsonElement jsonElement)
            {
                if (jsonElement.ValueKind == System.Text.Json.JsonValueKind.Number)
                {
                    return jsonElement.GetDecimal();
                }
                return null;
            }

            return Convert.ToDecimal(value);
        }
        catch
        {
            _logger.LogDebug("Could not convert metric {Key} value {Value} to decimal", key, value);
            return null;
        }
    }

    /// <summary>
    /// Extracts a financial item value from reported financials.
    /// </summary>
    public decimal? ExtractFinancialItem(List<FinancialItem>? items, params string[] concepts)
    {
        if (items == null) return null;

        foreach (var concept in concepts)
        {
            var item = items.FirstOrDefault(i =>
                i.Concept?.Equals(concept, StringComparison.OrdinalIgnoreCase) == true);
            if (item?.Value != null)
            {
                var value = ConvertToDecimal(item.Value);
                if (value.HasValue)
                    return value;
            }
        }

        return null;
    }

    private decimal? ConvertToDecimal(object? value)
    {
        if (value == null) return null;

        try
        {
            if (value is System.Text.Json.JsonElement jsonElement)
            {
                if (jsonElement.ValueKind == System.Text.Json.JsonValueKind.Number)
                {
                    return jsonElement.GetDecimal();
                }
                // Skip string values like "N/A"
                return null;
            }

            if (value is decimal d) return d;
            if (value is double dbl) return (decimal)dbl;
            if (value is long l) return l;
            if (value is int i) return i;
            if (value is string s && decimal.TryParse(s, out var parsed)) return parsed;

            return Convert.ToDecimal(value);
        }
        catch
        {
            return null;
        }
    }
}
