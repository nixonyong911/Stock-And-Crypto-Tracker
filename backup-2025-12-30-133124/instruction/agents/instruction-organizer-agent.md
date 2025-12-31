# Instruction Organizer Agent

## Purpose

Process files in `instruction/unfiltered/`, categorize them into appropriate folders, synthesize redundant content, and maintain a clean, Opus 4.5-optimized instruction library.

---

## How to Invoke

In Cursor chat, say:
- "Organize instructions"
- "Process unfiltered instructions"
- Reference this file and ask to run it

---

## Processing Workflow

### Step 1: Scan Unfiltered Folder

Read all files in `instruction/unfiltered/`. If empty, report "No instructions to process" and stop.

### Step 2: For Each File

1. **Read** the file content completely
2. **Classify content type**:
   - **Service-specific**: Tied to one service (twelvedata, coingecko, etc.)
   - **Generic**: Applies to ALL services/workers
3. **Detect topics** - Does file contain multiple categories? (architecture, database, etc.)
4. **Route accordingly**:

   | Content Type | Action |
   |-------------|--------|
   | Service-specific, single topic | Create `<category>/<service>-<category>.md` |
   | Service-specific, multi-topic | Split into multiple `<service>-<category>.md` files |
   | Generic | Create `reference/<descriptive-name>.md` |

5. **Check existing files** - If target file exists, **synthesize** into it
6. **Delete** processed file from `unfiltered/`

### Step 3: Report Summary

After processing all files, report:
- Files processed
- Actions taken (created/synthesized/new folders)
- Any issues encountered

---

## Category Definitions

| Folder | Content Type | Examples |
|--------|--------------|----------|
| `architecture/` | Service-specific deployment, infrastructure, scheduling | TwelveData worker scheduling, CoinGecko API flow |
| `database/` | Service-specific schema, migrations, queries | TwelveData fetch_schedules table |
| `cli/` | CLI commands organized by **tech stack subfolder** | `cli/.net/`, `cli/azure/`, `cli/docker/` |
| `history/` | **Glanceable session logs by tech stack** — what was done, issues, solutions | Azure deployment fixes, .NET migration issues |
| `ai-agent/` | Trading analysis, ML patterns | Candlestick analysis, trading signals |
| `reference/` | **Generic cross-cutting patterns that apply to ALL services** | .env flow, project structure, shared conventions |
| `agents/` | Cursor agent definitions (meta) | Agent instruction files like this one |

**If content doesn't fit**: Propose a new folder name and ask user before creating.

---

## Naming Convention (Critical)

### Service-Specific Files

**Format:** `<service_name>-<subfolder>.md`

| Component | Description | Examples |
|-----------|-------------|----------|
| `service_name` | Specific service/worker | `twelvedata`, `coingecko`, `frontend`, `metrics` |
| `subfolder` | Category folder name | `architecture`, `database`, `cli` |

**Examples:**
- `architecture/twelvedata-architecture.md` - TwelveData worker scheduling
- `database/coingecko-database.md` - CoinGecko-specific schema docs

### Generic Reference Files

**Format:** Descriptive name in `reference/` folder

**Examples:**
- `reference/env-flow.md` - How .env passes from root to all workers
- `reference/project-structure.md` - Overall project layout
- `reference/coding-conventions.md` - Shared code style rules

### Decision Tree

```
Is this content specific to ONE service?
├── YES → Use <service>-<subfolder>.md in category folder
└── NO (applies to ALL services) → Use descriptive name in reference/
```

---

## Content Classification

### Service-Specific Indicators

- Mentions specific API (TwelveData, CoinGecko, etc.)
- Service-specific rate limits or configurations
- Specific worker behavior or scheduling
- Tables/schemas used only by one service

### Generic/Reference Indicators

- Applies to "all workers" or "all services"
- Environment variable flows
- Project-wide conventions
- Shared infrastructure patterns
- Cross-cutting concerns (logging, error handling patterns)

---

## CLI Content Routing

CLI documentation is organized by **tech stack**, not by service. Route CLI content to `cli/<tech-stack>/<descriptive-name>.md`.

### Tech Stack Detection

| Tech Stack | Folder | Detection Keywords |
|------------|--------|-------------------|
| .NET | `cli/.net/` | `dotnet`, `ef`, `nuget`, `.csproj`, `migrations` |
| AI | `cli/AI/` | `claude`, `claude-code`, `cursor-agent`, `anthropic`, `AI agent`, `coding agent` |
| Azure | `cli/azure/` | `az `, `az.`, `Azure CLI`, `containerapp`, `acr` |
| Caddy | `cli/caddy/` | `caddy`, `Caddyfile`, `reverse_proxy`, `tls` |
| Docker | `cli/docker/` | `docker`, `docker-compose`, `Dockerfile` |
| GitHub | `cli/github/` | `gh `, `gh.`, `GitHub CLI`, `workflow`, `actions` |
| Infisical | `cli/infisical/` | `infisical`, `infisical run`, `infisical secrets`, `.infisical.json` |
| Oracle | `cli/oracle/` | `oci`, `Oracle Cloud`, `oracle` |
| PowerShell | `cli/powershell/` | `function`, `PowerShell_profile`, `.ps1`, `$HOME\Documents\WindowsPowerShell` |
| Vercel | `cli/vercel/` | `vercel`, `Vercel CLI` |

### CLI Routing Decision Tree

```
Is content CLI-related?
├── YES → Identify tech stack from keywords
│   ├── Tech stack identified → Route to cli/<tech-stack>/<descriptive-name>.md
│   └── Unknown tech stack → Ask user OR create new folder
└── NO → Use standard category routing
```

### Creating New Tech Stack Folders

If CLI content belongs to a tech stack not listed above:
1. Propose folder name to user (lowercase, no spaces)
2. Create folder in `cli/` upon approval
3. Add new tech stack to this detection table

### Caddy Worker Endpoints Registry (Special File)

`cli/caddy/` contains a **unique registry file**: `worker-endpoints.md`

This file maps worker/service names to their public URLs for quick reference to GUIs and APIs.

**File:** `cli/caddy/worker-endpoints.md`

**Format:**

```markdown
# Worker Endpoints

| Worker | URL |
|--------|-----|
| n8n | https://nxserver.malaysiawest.cloudapp.azure.com/ |
| grafana | https://nxserver.malaysiawest.cloudapp.azure.com/grafana |
| prometheus | https://nxserver.malaysiawest.cloudapp.azure.com/prometheus |
```

**Rules:**

- **One row per worker** — worker name and its public URL
- **Alphabetical order** — sort workers A-Z for easy scanning
- **Always update** — when adding new Caddy reverse proxy routes, add entry here
- **No duplicates** — each worker appears once
- **Use exact URLs** — include trailing slash if required by the service

**When to Update:**

| Trigger | Action |
|---------|--------|
| New Caddyfile route added | Add worker to `worker-endpoints.md` |
| Worker URL changed | Update URL in `worker-endpoints.md` |
| Worker removed | Remove entry from `worker-endpoints.md` |

**Detection:** If content mentions "worker URL", "endpoint", "GUI link", or "service URL" with Caddy context → Update `cli/caddy/worker-endpoints.md`

---

## History Content Routing

History documentation tracks **completed tasks/sessions** — what was done, issues encountered, solutions applied. Organized by **tech stack** (same as CLI).

### When to Route to History

```
Is content about a COMPLETED task/session with issues/solutions?
├── YES → Identify tech stack → Route to history/<tech-stack>/
└── NO → Use standard category routing (cli/, architecture/, etc.)
```

### Tech Stack Detection

Reuse the same tech stack folders as CLI:

| Tech Stack | Folder |
|------------|--------|
| .NET | `history/.net/` |
| AI | `history/AI/` |
| Azure | `history/azure/` |
| Caddy | `history/caddy/` |
| Docker | `history/docker/` |
| GitHub | `history/github/` |
| Infisical | `history/infisical/` |
| Oracle | `history/oracle/` |
| PowerShell | `history/powershell/` |
| Vercel | `history/vercel/` |

### Naming Convention

**Format:** `YYYY-MM-DD-<descriptive-slug>.md`

**Examples:**
- `history/azure/2025-12-20-container-apps-deployment-fix.md`
- `history/.net/2025-12-18-ef-migration-connection-issue.md`
- `history/docker/2025-12-15-compose-env-variable-fix.md`

---

## CLI Documentation Tone

CLI docs must be **straightforward** — commands only, minimal explanation.

### Format

```markdown
## <What It Does>

```powershell
# comment for context if needed
<command>
```
```

### Style Rules

- **Commands only** — no lengthy explanations
- **Inline comments** for context (e.g., `# Navigate to project`)
- **Group related commands** under clear headings
- **No prose paragraphs** between code blocks unless absolutely necessary
- **Configuration snippets** where relevant (connection strings, env vars)

### Example

```markdown
## Apply Migrations

```powershell
# Navigate to the migrations project
cd services/common/StockTracker.Data.Migrations

# Check migration status
dotnet run -- status

# Apply pending migrations
dotnet run -- migrate
```
```

---

## History Documentation Tone

**Goal**: Glanceable at a glance. Saves AI context memory.

### Length Constraints

| Section | Max Length |
|---------|------------|
| Total file | 50 lines (excluding code blocks) |
| Context | 1-2 lines |
| Issue/Solution | 3-5 bullets each |
| Outcome | 1-2 lines |

### Template

```markdown
# <Short Title>

**Context**: One-liner describing the task.

## Issue
- Problem 1
- Problem 2

## Solution
- Fix 1
- Fix 2

## Key Commands
```bash
<only critical commands>
```

**Outcome**: Verification or final state.
```

### Style Rules

| Rule | Why |
|------|-----|
| No prose paragraphs | AI scans bullets faster |
| Max 5 bullets per section | Prevents bloat |
| Only critical commands | Skip trivial `cd`, `ls` |
| One-liner outcome | Quick confirmation |
| Skip obvious context | AI infers from folder/filename |

---

## Synthesis Rules (Critical)

When merging overlapping content, **synthesize intelligently** — do NOT simply concatenate.

### Process

1. **Extract unique concepts** from both documents
2. **Identify overlapping sections** — consolidate into single authoritative version
3. **Resolve conflicts** — prefer more specific/detailed/recent information
4. **Restructure** the combined content logically
5. **Remove all duplication** — no repeated information

### Output Format (Opus 4.5 Optimized)

Write synthesized instructions in this style:

- **Direct imperatives**: "Use X", "Do Y when Z", "Never do W"
- **Bullet points** over prose paragraphs
- **Tables** for structured data (configs, mappings, commands)
- **Code blocks** with proper language tags
- **Clear hierarchy**: Overview → Configuration → Usage → Examples
- **Explicit conditions**: "If X, then Y. Otherwise, Z."
- **Concrete examples** over abstract descriptions

### Example Synthesis

**Input 1:**
```
Database connections use Dapper. Connection string is in .env.staging.
```

**Input 2:**
```
Connection string format: Host=xxx;Port=5432...
Use Dapper for queries, not EF Core.
```

**Synthesized Output:**
```markdown
## Database Access

### Connection
- Location: `.env.staging` → `DATABASE_CONNECTION_STRING`
- Format: `Host=xxx;Port=5432;Database=postgres;Username=postgres;Password=xxx`

### Query Pattern
- Use **Dapper** for all runtime queries
- Use **EF Core** only for migrations (never runtime)
```

---

## Execution Checklist

Before deleting any file from `unfiltered/`:

- [ ] Content classified (service-specific vs generic vs CLI vs history)
- [ ] If service-specific: service identified
- [ ] If CLI: tech stack identified, routed to `cli/<tech-stack>/`
- [ ] If Caddy with worker URLs: update `cli/caddy/worker-endpoints.md`
- [ ] If history: tech stack identified, routed to `history/<tech-stack>/`
- [ ] If history: date prefix applied (YYYY-MM-DD)
- [ ] If history: follows Issue → Solution → Outcome structure
- [ ] If history: max 50 lines (glanceable, saves context memory)
- [ ] Topics detected and categorized
- [ ] If multi-topic: split into separate files
- [ ] Correct naming applied:
  - Service-specific: `<service>-<category>.md`
  - CLI: `cli/<tech-stack>/<descriptive-name>.md`
  - History: `history/<tech-stack>/YYYY-MM-DD-<slug>.md`
  - Generic: `reference/<descriptive-name>.md`
- [ ] Existing files checked (synthesize if exists)
- [ ] Output is Opus 4.5 optimized (or CLI tone for CLI docs, or History tone for history)

---

## Constraints

- Never delete from `unfiltered/` until content is successfully placed
- Never create duplicate information across files
- Always maintain existing document structure when synthesizing
- Ask user before creating new category folders
- Preserve code examples and configuration snippets exactly

