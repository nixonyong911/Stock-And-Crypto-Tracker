using System.Data;
using Dapper;

namespace CandlestickAnalysis.Worker.Infrastructure;

/// <summary>
/// Dapper type handler for DateOnly.
/// Required because Dapper doesn't natively support DateOnly (introduced in .NET 6).
/// </summary>
public class DateOnlyTypeHandler : SqlMapper.TypeHandler<DateOnly>
{
    public override DateOnly Parse(object value)
    {
        return value switch
        {
            DateTime dateTime => DateOnly.FromDateTime(dateTime),
            DateOnly dateOnly => dateOnly,
            string str => DateOnly.Parse(str),
            _ => throw new InvalidCastException($"Unable to convert {value?.GetType().Name ?? "null"} to DateOnly")
        };
    }

    public override void SetValue(IDbDataParameter parameter, DateOnly value)
    {
        parameter.DbType = DbType.Date;
        parameter.Value = value.ToDateTime(TimeOnly.MinValue);
    }
}

/// <summary>
/// Dapper type handler for nullable DateOnly.
/// </summary>
public class NullableDateOnlyTypeHandler : SqlMapper.TypeHandler<DateOnly?>
{
    public override DateOnly? Parse(object value)
    {
        if (value == null || value == DBNull.Value)
            return null;

        return value switch
        {
            DateTime dateTime => DateOnly.FromDateTime(dateTime),
            DateOnly dateOnly => dateOnly,
            string str => DateOnly.Parse(str),
            _ => throw new InvalidCastException($"Unable to convert {value?.GetType().Name ?? "null"} to DateOnly?")
        };
    }

    public override void SetValue(IDbDataParameter parameter, DateOnly? value)
    {
        parameter.DbType = DbType.Date;
        parameter.Value = value?.ToDateTime(TimeOnly.MinValue) ?? (object)DBNull.Value;
    }
}

