# Archived Documentation

> **Note for AI Agents**: All documentation in this directory is **retired/deprecated**. 
> Do not use these files as reference for current implementation.
> They are kept for historical reference only.

## Contents

| File | Description | Archived Date |
|------|-------------|---------------|
| [container-apps-cli.md](container-apps-cli.md) | Azure Container Apps CLI commands | Dec 27, 2025 |
| [adding-worker-to-azure-cicd.md](adding-worker-to-azure-cicd.md) | Guide for adding workers to Container Apps CI/CD | Dec 27, 2025 |
| [2025-12-26-twelvedata-worker-migration-to-vm.md](2025-12-26-twelvedata-worker-migration-to-vm.md) | TwelveData migration notes | Dec 26, 2025 |
| [2025-12-27-full-vm-migration-from-container-apps.md](2025-12-27-full-vm-migration-from-container-apps.md) | Full VM migration history | Dec 27, 2025 |

## Why Archived

These documents were retired because:
- **Azure Container Apps** is no longer used - migrated to Azure VM
- **ACR (Azure Container Registry)** is no longer used - Docker builds directly on VM
- **Azure CLI deployment** replaced with SSH-based deployment

## Current Architecture

The project now uses:
- **Azure VM** for backend services (not Azure Container Apps)
- **GitHub Actions → SSH** for deployment (not ACR/Container Apps)
- **Infisical** for secrets management (not manual GitHub Secrets)

## Current Documentation

See active documentation at:
- [VM Deployment Architecture](../architecture/vm-deployment-architecture.md)
- [Infrastructure Reference](../architecture/infrastructure-reference.md)
- [Infisical Secrets Management](../architecture/infisical-secrets-management.md)
