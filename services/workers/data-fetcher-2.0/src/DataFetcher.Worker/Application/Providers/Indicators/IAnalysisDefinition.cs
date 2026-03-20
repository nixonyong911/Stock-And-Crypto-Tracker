namespace DataFetcher.Worker.Application.Providers.Indicators;

public interface IAnalysisDefinition
{
    string AnalysisName { get; }
    string[] ReadsFromTables { get; }
    string WritesToTable { get; }
    string[] DependsOnIndicators { get; }
}
