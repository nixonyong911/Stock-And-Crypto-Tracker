# Database Setup Reference

## 1. Create Entity Class

`services/common/StockTracker.Data/Entities/YourEntity.cs`:
```csharp
public class YourEntity
{
    public Guid Id { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
```

## 2. Register in DbContext

`StockTrackerDbContext.cs`:
```csharp
public DbSet<YourEntity> YourEntities => Set<YourEntity>();
```

## 3. Create Configuration

`Configurations/YourEntityConfiguration.cs`:
```csharp
public class YourEntityConfiguration : IEntityTypeConfiguration<YourEntity>
{
    public void Configure(EntityTypeBuilder<YourEntity> builder)
    {
        builder.ToTable("your_entities");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.CreatedAt).HasColumnName("created_at");
    }
}
```

## 4. Apply Migration via Supabase MCP

Use `apply_migration` (NOT EF Core):
```sql
CREATE TABLE your_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_your_entities_symbol ON your_entities(symbol);
```

## Related: [Database Schema](../../../../database/schema.md)
