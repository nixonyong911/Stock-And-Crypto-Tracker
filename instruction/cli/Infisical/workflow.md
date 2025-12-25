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