namespace DataFetcher.Worker.Application.Scheduling;

public interface IJobDependencyResolver
{
    IReadOnlyList<IScheduledJob> GetExecutionOrder(IEnumerable<IScheduledJob> jobs);
}

public class JobDependencyResolver : IJobDependencyResolver
{
    public IReadOnlyList<IScheduledJob> GetExecutionOrder(IEnumerable<IScheduledJob> jobs)
    {
        var jobList = jobs.ToList();
        if (jobList.Count == 0)
            return Array.Empty<IScheduledJob>();

        var jobsByName = new Dictionary<string, IScheduledJob>(StringComparer.OrdinalIgnoreCase);
        foreach (var job in jobList)
        {
            if (!jobsByName.TryAdd(job.Name, job))
                throw new InvalidOperationException($"Duplicate job name: '{job.Name}'");
        }

        // Validate all dependencies reference known jobs
        foreach (var job in jobList)
        {
            foreach (var dep in job.DependsOn)
            {
                if (!jobsByName.ContainsKey(dep))
                    throw new InvalidOperationException(
                        $"Job '{job.Name}' depends on '{dep}' which is not registered");
            }
        }

        // Kahn's algorithm: BFS-based topological sort
        var inDegree = jobList.ToDictionary(j => j.Name, _ => 0, StringComparer.OrdinalIgnoreCase);
        var dependents = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

        foreach (var job in jobList)
        {
            dependents[job.Name] = new List<string>();
        }

        foreach (var job in jobList)
        {
            foreach (var dep in job.DependsOn)
            {
                inDegree[job.Name]++;
                dependents[dep].Add(job.Name);
            }
        }

        var queue = new Queue<string>();
        foreach (var job in jobList)
        {
            if (inDegree[job.Name] == 0)
                queue.Enqueue(job.Name);
        }

        var result = new List<IScheduledJob>();

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            result.Add(jobsByName[current]);

            foreach (var dependent in dependents[current])
            {
                inDegree[dependent]--;
                if (inDegree[dependent] == 0)
                    queue.Enqueue(dependent);
            }
        }

        if (result.Count != jobList.Count)
        {
            var cycleJobs = jobList
                .Where(j => !result.Contains(j))
                .Select(j => j.Name);
            throw new InvalidOperationException(
                $"Circular dependency detected involving: {string.Join(", ", cycleJobs)}");
        }

        return result;
    }
}
