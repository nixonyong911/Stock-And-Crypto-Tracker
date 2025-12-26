using Postgrest.Attributes;
using Postgrest.Models;

namespace StockTracker.Common.Supabase.Models;

/// <summary>
/// Test model for verifying Supabase connection
/// Maps to the 'test' table in Supabase
/// </summary>
[Table("test")]
public class TestModel : BaseModel
{
    [PrimaryKey("id")]
    public Guid Id { get; set; }

    [Column("message")]
    public string Message { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }
}


















