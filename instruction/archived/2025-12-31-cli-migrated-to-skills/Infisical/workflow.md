Adding a new secret?
│
├── Is it for the frontend (Vercel)?
│   └── YES → Add to Infisical with NEXT_PUBLIC_ prefix → Auto-syncs to Vercel ✅
│
├── Is it for a backend worker on Azure?
│   └── YES → Add to Infisical → Auto-syncs to GitHub
│             → ALSO update deploy-azure.yml to pass it to the container
│
└── Is it for local development only?
    └── YES → Add to Infisical → Use `infisical run` to access it ✅

---

## Local Development Commands

### Run Services with Secrets
```powershell
# Build and start all services with secrets injected
infisical run --env=prod -- docker-compose up -d --build

# Start services without rebuild
infisical run --env=prod -- docker-compose up -d

# View logs
docker-compose logs -f
```

### View Secrets
```powershell
# List all secrets (masked)
infisical secrets --env=prod
```