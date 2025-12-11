using DotNetEnv;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace StockTracker.Data.Migrations;

/// <summary>
/// Factory for creating DbContext at design time (used by dotnet ef commands).
/// This allows EF Core tools to create the DbContext without running the full application.
/// Loads configuration from .env.staging at project root.
/// </summary>
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<StockTrackerDbContext>
{
    public StockTrackerDbContext CreateDbContext(string[] args)
    {
        // Load .env.staging from project root
        var rootPath = FindRootPath();
        var envStagingPath = Path.Combine(rootPath, ".env.staging");
        
        if (File.Exists(envStagingPath))
        {
            Env.Load(envStagingPath);
        }

        var configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        // Try DATABASE_CONNECTION_STRING first (from .env.staging), then fallback
        var connectionString = Environment.GetEnvironmentVariable("DATABASE_CONNECTION_STRING")
            ?? configuration.GetConnectionString("StockTrackerDb");

        var optionsBuilder = new DbContextOptionsBuilder<StockTrackerDbContext>();
        optionsBuilder.UseNpgsql(connectionString, b => 
        {
            b.MigrationsAssembly("StockTracker.Data.Migrations");
            b.CommandTimeout(120); // 2 minute timeout for migrations
        });

        return new StockTrackerDbContext(optionsBuilder.Options);
    }

    private static string FindRootPath()
    {
        var current = Directory.GetCurrentDirectory();
        
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
        
        return Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "..", ".."));
    }
}

