using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace TwelveData.Worker;

/// <summary>
/// Document filter to add tag descriptions to Swagger UI
/// </summary>
public class SwaggerTagDescriptionsFilter : IDocumentFilter
{
    public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
    {
        swaggerDoc.Tags = new List<OpenApiTag>
        {
            new() { Name = "Fetch", Description = "Endpoints for fetching stock and crypto price data from TwelveData API" },
            new() { Name = "Ticker", Description = "Manage stock, ETF, and crypto tickers with rate-limited verification" },
            new() { Name = "TwelveData.Worker", Description = "Service info and root endpoint" }
        };
    }
}
