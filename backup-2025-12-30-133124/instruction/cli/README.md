# CLI Commands Reference

CLI documentation organized by **tech stack**.

## Folder Structure

```
cli/
├── .net/           # .NET CLI (dotnet, ef, nuget)
├── azure/          # Azure CLI (az commands)
├── docker/         # Docker CLI (docker, docker-compose)
├── github/         # GitHub CLI (gh commands)
├── grafana/        # Grafana Cloud CLI (grafanactl)
├── oracle/         # Oracle Cloud CLI (oci)
├── powershell/     # PowerShell profile functions
├── vercel/         # Vercel CLI
└── README.md
```

## Documentation Style

Keep CLI docs **straightforward** — commands only, no explanations needed.

- Use code blocks with comments for context
- Group related commands under clear headings
- Include configuration snippets where relevant

---

## Tech Stack Documents

| Tech Stack | Document | Description |
|------------|----------|-------------|
| .NET | [ef-migrations.md](.net/ef-migrations.md) | EF Core database migrations |
| Azure | [container-apps.md](azure/container-apps.md) | Azure Container Apps management |
| Docker | [docker-compose.md](docker/docker-compose.md) | Local development with Docker |
| GitHub | [actions.md](github/actions.md) | GitHub Actions workflow commands |
| Grafana | [commands.md](grafana/commands.md) | Grafana Cloud CLI (grafanactl) |
| PowerShell | [profile-functions.md](powershell/profile-functions.md) | Custom shell functions |
| Vercel | [deploy.md](vercel/deploy.md) | Frontend deployment |
