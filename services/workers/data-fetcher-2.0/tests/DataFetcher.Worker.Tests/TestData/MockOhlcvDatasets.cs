using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Tests.TestData;

/// <summary>
/// Deterministic OHLCV datasets for golden-reference and parity testing.
/// Each dataset uses a fixed seed so results are reproducible across runs.
/// </summary>
internal static class MockOhlcvDatasets
{
    private static readonly DateTime BaseDate = new(2025, 1, 1);

    public static List<OhlcvBar> TrendingUp { get; } = GenerateTrendingUp();
    public static List<OhlcvBar> TrendingDown { get; } = GenerateTrendingDown();
    public static List<OhlcvBar> Volatile { get; } = GenerateVolatile();
    public static List<OhlcvBar> Flat { get; } = GenerateFlat();
    public static List<OhlcvBar> MicroPriceCrypto { get; } = GenerateMicroPriceCrypto();

    public static List<decimal> GetCloses(List<OhlcvBar> bars) => bars.Select(b => b.Close).ToList();

    public static List<OhlcvBar> GetByName(string name) => name switch
    {
        nameof(TrendingUp) => TrendingUp,
        nameof(TrendingDown) => TrendingDown,
        nameof(Volatile) => Volatile,
        nameof(Flat) => Flat,
        nameof(MicroPriceCrypto) => MicroPriceCrypto,
        _ => throw new ArgumentException($"Unknown dataset: {name}")
    };

    /// <summary>60 bars, ~$100 → ~$160 with moderate noise. Seed=100.</summary>
    private static List<OhlcvBar> GenerateTrendingUp()
    {
        var rng = new Random(100);
        var bars = new List<OhlcvBar>(60);
        decimal price = 100m;

        for (int i = 0; i < 60; i++)
        {
            decimal drift = 1.0m;
            decimal noise = (decimal)(rng.NextDouble() * 2 - 1) * 1.5m;
            decimal close = price + drift + noise;
            close = Math.Max(close, 1m);

            decimal open = price;
            decimal high = Math.Max(open, close) + (decimal)rng.NextDouble() * 2m;
            decimal low = Math.Min(open, close) - (decimal)rng.NextDouble() * 1.5m;
            low = Math.Max(low, 0.01m);
            long volume = 500_000 + rng.Next(0, 500_000);

            bars.Add(new OhlcvBar
            {
                Open = Math.Round(open, 4),
                High = Math.Round(high, 4),
                Low = Math.Round(low, 4),
                Close = Math.Round(close, 4),
                Volume = volume,
                Date = BaseDate.AddDays(i)
            });

            price = close;
        }

        return bars;
    }

    /// <summary>60 bars, ~$160 → ~$100 with moderate noise. Seed=200.</summary>
    private static List<OhlcvBar> GenerateTrendingDown()
    {
        var rng = new Random(200);
        var bars = new List<OhlcvBar>(60);
        decimal price = 160m;

        for (int i = 0; i < 60; i++)
        {
            decimal drift = -1.0m;
            decimal noise = (decimal)(rng.NextDouble() * 2 - 1) * 1.5m;
            decimal close = price + drift + noise;
            close = Math.Max(close, 1m);

            decimal open = price;
            decimal high = Math.Max(open, close) + (decimal)rng.NextDouble() * 2m;
            decimal low = Math.Min(open, close) - (decimal)rng.NextDouble() * 1.5m;
            low = Math.Max(low, 0.01m);
            long volume = 500_000 + rng.Next(0, 500_000);

            bars.Add(new OhlcvBar
            {
                Open = Math.Round(open, 4),
                High = Math.Round(high, 4),
                Low = Math.Round(low, 4),
                Close = Math.Round(close, 4),
                Volume = volume,
                Date = BaseDate.AddDays(i)
            });

            price = close;
        }

        return bars;
    }

    /// <summary>60 bars, high volatility +/-8% swings around $100. Seed=300.</summary>
    private static List<OhlcvBar> GenerateVolatile()
    {
        var rng = new Random(300);
        var bars = new List<OhlcvBar>(60);
        decimal price = 100m;

        for (int i = 0; i < 60; i++)
        {
            decimal swing = price * 0.08m * (decimal)(rng.NextDouble() * 2 - 1);
            decimal close = price + swing;
            close = Math.Max(close, 1m);

            decimal open = price;
            decimal high = Math.Max(open, close) + Math.Abs(swing) * 0.3m * (decimal)rng.NextDouble();
            decimal low = Math.Min(open, close) - Math.Abs(swing) * 0.3m * (decimal)rng.NextDouble();
            low = Math.Max(low, 0.01m);
            long volume = 1_000_000 + rng.Next(0, 2_000_000);

            bars.Add(new OhlcvBar
            {
                Open = Math.Round(open, 4),
                High = Math.Round(high, 4),
                Low = Math.Round(low, 4),
                Close = Math.Round(close, 4),
                Volume = volume,
                Date = BaseDate.AddDays(i)
            });

            price = close;
        }

        return bars;
    }

    /// <summary>60 bars, tight range $50 +/- $0.50. Seed=400.</summary>
    private static List<OhlcvBar> GenerateFlat()
    {
        var rng = new Random(400);
        var bars = new List<OhlcvBar>(60);
        decimal price = 50m;

        for (int i = 0; i < 60; i++)
        {
            decimal noise = (decimal)(rng.NextDouble() * 2 - 1) * 0.50m;
            decimal close = 50m + noise;

            decimal open = price;
            decimal high = Math.Max(open, close) + (decimal)rng.NextDouble() * 0.30m;
            decimal low = Math.Min(open, close) - (decimal)rng.NextDouble() * 0.30m;
            low = Math.Max(low, 0.01m);
            long volume = 200_000 + rng.Next(0, 100_000);

            bars.Add(new OhlcvBar
            {
                Open = Math.Round(open, 4),
                High = Math.Round(high, 4),
                Low = Math.Round(low, 4),
                Close = Math.Round(close, 4),
                Volume = volume,
                Date = BaseDate.AddDays(i)
            });

            price = close;
        }

        return bars;
    }

    /// <summary>60 bars, SHIB-like micro price ~$0.00002 with tiny moves. Seed=500.</summary>
    private static List<OhlcvBar> GenerateMicroPriceCrypto()
    {
        var rng = new Random(500);
        var bars = new List<OhlcvBar>(60);
        decimal price = 0.00002000m;

        for (int i = 0; i < 60; i++)
        {
            decimal noise = price * 0.03m * (decimal)(rng.NextDouble() * 2 - 1);
            decimal close = price + noise;
            close = Math.Max(close, 0.00000001m);

            decimal open = price;
            decimal high = Math.Max(open, close) + price * 0.01m * (decimal)rng.NextDouble();
            decimal low = Math.Min(open, close) - price * 0.01m * (decimal)rng.NextDouble();
            low = Math.Max(low, 0.00000001m);
            long volume = 50_000_000_000L + (long)(rng.NextDouble() * 20_000_000_000L);

            bars.Add(new OhlcvBar
            {
                Open = Math.Round(open, 10),
                High = Math.Round(high, 10),
                Low = Math.Round(low, 10),
                Close = Math.Round(close, 10),
                Volume = volume,
                Date = BaseDate.AddDays(i)
            });

            price = close;
        }

        return bars;
    }
}
