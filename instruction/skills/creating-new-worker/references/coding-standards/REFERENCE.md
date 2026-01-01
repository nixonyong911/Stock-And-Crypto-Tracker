# Coding Standards Reference

## Security Requirements

| Rule | Implementation |
|------|----------------|
| No secrets in code | Use `IConfiguration`, env vars |
| Parameterized queries | Dapper `@Parameter` syntax |
| Input validation | Validate at controller entry |
| Mask secrets in logs | Never log API keys, passwords |

## Fault Tolerance

### Retry Pattern (Polly)
```csharp
services.AddHttpClient<IApiClient, ApiClient>()
    .AddTransientHttpErrorPolicy(p => p
        .WaitAndRetryAsync(3, attempt => 
            TimeSpan.FromSeconds(Math.Pow(2, attempt))));
```

### Timeout Configuration
```csharp
var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
```

### Graceful Degradation
```csharp
try {
    return await FetchFromApi();
} catch (HttpRequestException) {
    _logger.LogWarning("API unavailable, using cached data");
    return await GetCachedData();
}
```

## C# Conventions Summary

- **Naming**: PascalCase classes/methods, _camelCase private fields
- **Async**: Use `async/await`, pass `CancellationToken`
- **Logging**: Structured logging with `ILogger<T>`
- **DI**: Constructor injection, validate null args

## Related Rules (Full Details)

- [Security Best Practices](../../../../rules/security.md)
- [C# Conventions](../../../../rules/conventions/csharp.md)
- [Docker Conventions](../../../../rules/conventions/docker.md)

