# C# (.NET) Coding Conventions

## Naming

- Use **PascalCase** for properties, methods, classes
- Entity classes in `StockTracker.Data.Entities`
- EF configurations map to **snake_case** columns

## Data Access

- Use **Dapper** for queries (performance)
- Use **EF Core only for migrations** (schema management)

## Project Structure

| Project | Purpose |
|---------|---------|
| `StockTracker.Data` | EF Core entities & DbContext |
| `StockTracker.Data.Migrations` | Migration CLI tool |
| `StockTracker.Common` | Shared utilities, metrics client |

## Configuration

Environment variables override `appsettings.json` using double-underscore notation:
- `Supabase__Url` → `{ "Supabase": { "Url": "" } }`
- `ConnectionStrings__DefaultConnection` → `{ "ConnectionStrings": { "DefaultConnection": "" } }`



