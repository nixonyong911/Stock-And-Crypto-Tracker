using DataFetcher.Worker.Application.Providers.Common;
using Xunit;

namespace DataFetcher.Worker.Tests.TestInfra;

public abstract class ProviderTestBase<TProvider> where TProvider : IDataProviderContract
{
    protected abstract TProvider CreateProvider();

    [Fact] public abstract Task HealthCheck_ReturnsResult();
    [Fact] public abstract Task TransientError_RetriesCorrectly();
    [Fact] public abstract Task PermanentError_SkipsGracefully();
    [Fact] public abstract Task Timeout_HandledWithoutCrash();
    [Fact] public abstract Task Cancellation_StopsProcessing();
    [Fact] public abstract Task PartialFailure_WritesAvailableData();
}
