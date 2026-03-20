using DataFetcher.Worker.Application.Providers.Common;
using DataFetcher.Worker.Application.Providers.Indicators;

namespace DataFetcher.Worker.Application.Validation;

public class IndicatorComplianceValidator
{
    public ValidationResult Validate(
        IIndicatorRegistry registry,
        IEnumerable<Domain.Common.Entities.FetchSchedule> schedules)
    {
        var errors = new List<string>();
        var definitions = registry.GetAllDefinitions();

        if (definitions.Count == 0)
        {
            errors.Add("No IIndicatorDefinition implementations registered. At least one indicator must be defined.");
            return new ValidationResult(false, errors);
        }

        var scheduleNames = new HashSet<string>(
            schedules.Where(s => s.IsEnabled).Select(s => s.Name),
            StringComparer.OrdinalIgnoreCase);

        foreach (var indicator in definitions)
        {
            var config = indicator.GetScheduleConfig();

            if (string.IsNullOrWhiteSpace(config.ScheduleName))
            {
                errors.Add(
                    $"Indicator '{indicator.IndicatorName}' has empty ScheduleName");
                continue;
            }

            if (!scheduleNames.Contains(config.ScheduleName))
                errors.Add(
                    $"Indicator '{indicator.IndicatorName}' references schedule " +
                    $"'{config.ScheduleName}' which does not exist or is disabled in worker_fetch_schedules");

            if (indicator.OutputColumns.Length == 0)
                errors.Add(
                    $"Indicator '{indicator.IndicatorName}' declares zero OutputColumns");

            foreach (var dep in config.DependsOn)
            {
                if (!definitions.Any(i =>
                    string.Equals(i.IndicatorName, dep, StringComparison.OrdinalIgnoreCase)))
                    errors.Add(
                        $"Indicator '{indicator.IndicatorName}' depends on " +
                        $"'{dep}' which is not registered");
            }
        }

        var allColumns = definitions
            .SelectMany(d => d.OutputColumns)
            .GroupBy(c => c, StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() > 1)
            .ToList();

        foreach (var dup in allColumns)
            errors.Add(
                $"Output column '{dup.Key}' is declared by multiple indicators");

        return new ValidationResult(errors.Count == 0, errors);
    }
}

public class ProviderComplianceValidator
{
    private readonly ILogger<ProviderComplianceValidator> _logger;

    public ProviderComplianceValidator(ILogger<ProviderComplianceValidator> logger)
    {
        _logger = logger;
    }

    public async Task<ValidationResult> ValidateAsync(
        IEnumerable<IDataProviderContract> providers,
        CancellationToken ct)
    {
        var errors = new List<string>();

        foreach (var provider in providers)
        {
            var config = provider.GetResilienceConfig();

            if (config.MaxRetries <= 0)
                errors.Add($"Provider '{provider.ProviderName}' has MaxRetries <= 0");

            if (config.RequestTimeout <= TimeSpan.Zero)
                errors.Add($"Provider '{provider.ProviderName}' has zero/negative RequestTimeout");

            try
            {
                var health = await provider.HealthCheckAsync(ct);
                if (!health.Healthy)
                    _logger.LogWarning(
                        "Provider '{Name}' health check failed: {Error} (non-blocking)",
                        provider.ProviderName, health.Error);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Provider '{Name}' health check threw exception (non-blocking)",
                    provider.ProviderName);
            }
        }

        return new ValidationResult(errors.Count == 0, errors);
    }
}

public record ValidationResult(bool IsValid, IReadOnlyList<string> Errors);
