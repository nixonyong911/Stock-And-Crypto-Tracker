namespace DataFetcher.Worker.Application.Providers.Pipeline;

public static class TopologicalSortHelper
{
    /// <summary>
    /// Groups compute steps into execution phases based on dependency order.
    /// Steps within the same phase have no mutual dependencies and can run concurrently.
    /// </summary>
    public static IReadOnlyList<IReadOnlyList<IComputeStep>> Sort(IReadOnlyList<IComputeStep> steps)
    {
        if (steps.Count == 0)
            return Array.Empty<IReadOnlyList<IComputeStep>>();

        var byName = steps.ToDictionary(s => s.StepName, StringComparer.OrdinalIgnoreCase);
        var depth = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        int GetDepth(IComputeStep step)
        {
            if (depth.TryGetValue(step.StepName, out var cached))
                return cached;

            depth[step.StepName] = -1; // cycle sentinel

            var maxParent = 0;
            foreach (var dep in step.DependsOn)
            {
                if (byName.TryGetValue(dep, out var parent))
                {
                    var parentDepth = GetDepth(parent);
                    if (parentDepth < 0)
                        throw new InvalidOperationException(
                            $"Circular dependency detected involving '{step.StepName}' and '{dep}'");
                    maxParent = Math.Max(maxParent, parentDepth + 1);
                }
            }

            depth[step.StepName] = maxParent;
            return maxParent;
        }

        foreach (var step in steps)
            GetDepth(step);

        return steps
            .GroupBy(s => depth[s.StepName])
            .OrderBy(g => g.Key)
            .Select(g => (IReadOnlyList<IComputeStep>)g.OrderBy(s => s.Priority).ToList().AsReadOnly())
            .ToList()
            .AsReadOnly();
    }
}
