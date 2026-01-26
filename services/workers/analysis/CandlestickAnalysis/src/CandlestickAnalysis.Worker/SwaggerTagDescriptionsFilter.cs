using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace CandlestickAnalysis.Worker;

/// <summary>
/// Document filter to add tag descriptions to Swagger UI
/// </summary>
public class SwaggerTagDescriptionsFilter : IDocumentFilter
{
    public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
    {
        swaggerDoc.Tags = new List<OpenApiTag>
        {
            new() { Name = "Analysis", Description = "Candlestick pattern analysis for stocks - trigger analysis, view patterns, and manage backfills" }
        };
    }
}
