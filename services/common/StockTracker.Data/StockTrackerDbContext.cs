using Microsoft.EntityFrameworkCore;
using StockTracker.Data.Entities;

namespace StockTracker.Data;

/// <summary>
/// Central database context for the Stock Tracker application.
/// This DbContext serves as the single source of truth for the database schema.
/// 
/// Workers reference this project for entity definitions but use Dapper for queries.
/// Only the Migrations CLI tool uses EF Core to apply schema changes.
/// </summary>
public class StockTrackerDbContext : DbContext
{
    public StockTrackerDbContext(DbContextOptions<StockTrackerDbContext> options)
        : base(options)
    {
    }

    // Lookup tables
    public DbSet<Universe> Universes => Set<Universe>();
    
    // Ticker tables
    public DbSet<StockTicker> StockTickers => Set<StockTicker>();
    public DbSet<CryptoTicker> CryptoTickers => Set<CryptoTicker>();
    
    // Configuration
    public DbSet<DataSource> DataSources => Set<DataSource>();
    public DbSet<FetchSchedule> FetchSchedules => Set<FetchSchedule>();
    
    // Price tables (10-minute candles)
    public DbSet<StockPrice> StockPrices => Set<StockPrice>();
    public DbSet<CryptoPrice> CryptoPrices => Set<CryptoPrice>();
    
    // AI Hub tables
    public DbSet<AiHubLog> AiHubLogs => Set<AiHubLog>();
    public DbSet<AiHubRateTracking> AiHubRateTrackings => Set<AiHubRateTracking>();
    
    // Analysis tables
    public DbSet<AnalysisStockCandlestickPattern> AnalysisStockCandlestickPatterns => Set<AnalysisStockCandlestickPattern>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Apply all entity configurations from the Configurations folder
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(StockTrackerDbContext).Assembly);
    }
}

