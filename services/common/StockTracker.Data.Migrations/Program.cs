using DotNetEnv;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using StockTracker.Data;

namespace StockTracker.Data.Migrations;

/// <summary>
/// CLI tool for managing database migrations.
/// 
/// Usage:
///   dotnet run -- migrate              Apply all pending migrations
///   dotnet run -- migrate-down         Revert the last migration
///   dotnet run -- status               Show migration status
///   
/// For generating migrations, use dotnet ef commands:
///   dotnet ef migrations add MigrationName --project StockTracker.Data.Migrations
///   dotnet ef migrations list --project StockTracker.Data.Migrations
/// 
/// Configuration priority:
///   1. Environment variables
///   2. Root .env.staging file (DATABASE_CONNECTION_STRING)
///   3. appsettings.json (ConnectionStrings:StockTrackerDb)
/// </summary>
public class Program
{
    public static async Task<int> Main(string[] args)
    {
        // Load .env.staging from project root (3 levels up from this project)
        var rootPath = FindRootPath();
        var envStagingPath = Path.Combine(rootPath, ".env.staging");
        
        if (File.Exists(envStagingPath))
        {
            Env.Load(envStagingPath);
            Console.WriteLine($"Loaded: {envStagingPath}");
        }

        var configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        // Try DATABASE_CONNECTION_STRING first (from .env.staging), then fallback to appsettings.json
        var connectionString = Environment.GetEnvironmentVariable("DATABASE_CONNECTION_STRING")
            ?? configuration.GetConnectionString("StockTrackerDb");

        if (string.IsNullOrEmpty(connectionString))
        {
            Console.Error.WriteLine("Error: Connection string not found.");
            Console.Error.WriteLine("Set DATABASE_CONNECTION_STRING in .env.staging or ConnectionStrings:StockTrackerDb in appsettings.json");
            return 1;
        }

        var command = args.Length > 0 ? args[0].ToLower() : "status";

        var optionsBuilder = new DbContextOptionsBuilder<StockTrackerDbContext>();
        optionsBuilder.UseNpgsql(connectionString, b => b.CommandTimeout(120)); // 2 minute timeout

        await using var context = new StockTrackerDbContext(optionsBuilder.Options);

        try
        {
            return command switch
            {
                "migrate" => await MigrateAsync(context),
                "migrate-down" => await MigrateDownAsync(context),
                "status" => await ShowStatusAsync(context),
                _ => ShowHelp()
            };
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error: {ex.Message}");
            return 1;
        }
    }

    private static async Task<int> MigrateAsync(StockTrackerDbContext context)
    {
        Console.WriteLine("Applying pending migrations...");
        
        var pendingMigrations = await context.Database.GetPendingMigrationsAsync();
        var pendingList = pendingMigrations.ToList();
        
        if (pendingList.Count == 0)
        {
            Console.WriteLine("No pending migrations.");
            return 0;
        }

        Console.WriteLine($"Found {pendingList.Count} pending migration(s):");
        foreach (var migration in pendingList)
        {
            Console.WriteLine($"  - {migration}");
        }

        await context.Database.MigrateAsync();
        Console.WriteLine("Migrations applied successfully.");
        return 0;
    }

    private static async Task<int> MigrateDownAsync(StockTrackerDbContext context)
    {
        var appliedMigrations = await context.Database.GetAppliedMigrationsAsync();
        var appliedList = appliedMigrations.ToList();

        if (appliedList.Count <= 1)
        {
            Console.WriteLine("Cannot revert: no migrations to revert or only initial migration exists.");
            Console.WriteLine("Use 'dotnet ef database update <PreviousMigrationName>' for precise control.");
            return 1;
        }

        // Get the second-to-last migration (the one to revert to)
        var targetMigration = appliedList[^2];
        
        Console.WriteLine($"To revert to migration '{targetMigration}', run:");
        Console.WriteLine($"  dotnet ef database update {targetMigration} --project StockTracker.Data.Migrations");
        Console.WriteLine();
        Console.WriteLine("Note: EF Core CLI provides safer rollback with explicit migration targeting.");
        return 0;
    }

    private static async Task<int> ShowStatusAsync(StockTrackerDbContext context)
    {
        Console.WriteLine("Migration Status");
        Console.WriteLine("================");

        var appliedMigrations = await context.Database.GetAppliedMigrationsAsync();
        var pendingMigrations = await context.Database.GetPendingMigrationsAsync();

        Console.WriteLine("\nApplied Migrations:");
        foreach (var migration in appliedMigrations)
        {
            Console.WriteLine($"  [x] {migration}");
        }

        if (!appliedMigrations.Any())
        {
            Console.WriteLine("  (none)");
        }

        Console.WriteLine("\nPending Migrations:");
        foreach (var migration in pendingMigrations)
        {
            Console.WriteLine($"  [ ] {migration}");
        }

        if (!pendingMigrations.Any())
        {
            Console.WriteLine("  (none)");
        }

        return 0;
    }

    private static int ShowHelp()
    {
        Console.WriteLine("StockTracker Database Migration Tool");
        Console.WriteLine();
        Console.WriteLine("Usage: dotnet run -- <command>");
        Console.WriteLine();
        Console.WriteLine("Commands:");
        Console.WriteLine("  migrate        Apply all pending migrations");
        Console.WriteLine("  migrate-down   Revert the last migration");
        Console.WriteLine("  status         Show migration status (default)");
        Console.WriteLine();
        Console.WriteLine("To generate migrations, use dotnet ef:");
        Console.WriteLine("  dotnet ef migrations add <Name> --project StockTracker.Data.Migrations");
        Console.WriteLine("  dotnet ef migrations list --project StockTracker.Data.Migrations");
        return 0;
    }

    /// <summary>
    /// Find the project root by looking for .env.staging or README.md
    /// </summary>
    private static string FindRootPath()
    {
        var current = Directory.GetCurrentDirectory();
        
        // Walk up directory tree looking for .env.staging or README.md (project root markers)
        while (!string.IsNullOrEmpty(current))
        {
            if (File.Exists(Path.Combine(current, ".env.staging")) ||
                File.Exists(Path.Combine(current, "docker-compose.yml")))
            {
                return current;
            }
            
            var parent = Directory.GetParent(current);
            if (parent == null) break;
            current = parent.FullName;
        }
        
        // Fallback: assume we're in services/common/StockTracker.Data.Migrations
        return Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "..", ".."));
    }
}

