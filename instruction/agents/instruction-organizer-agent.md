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
   - **Service-specific**: Tied to one service (twelvedata, alphavantage, etc.)
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
| `architecture/` | Service-specific deployment, infrastructure, scheduling | TwelveData worker scheduling, AlphaVantage API flow |
| `database/` | Service-specific schema, migrations, queries | TwelveData fetch_schedules table |
| `cli/` | Service-specific commands, scripts | EF migration commands for specific service |
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
| `service_name` | Specific service/worker | `twelvedata`, `alphavantage`, `frontend`, `metrics` |
| `subfolder` | Category folder name | `architecture`, `database`, `cli` |

**Examples:**
- `architecture/twelvedata-architecture.md` - TwelveData worker scheduling
- `database/alphavantage-database.md` - AlphaVantage-specific schema docs

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

- Mentions specific API (TwelveData, AlphaVantage, etc.)
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

- [ ] Content classified (service-specific vs generic)
- [ ] If service-specific: service identified
- [ ] Topics detected and categorized
- [ ] If multi-topic: split into separate files
- [ ] Correct naming applied:
  - Service-specific: `<service>-<category>.md`
  - Generic: `reference/<descriptive-name>.md`
- [ ] Existing files checked (synthesize if exists)
- [ ] Output is Opus 4.5 optimized

---

## Constraints

- Never delete from `unfiltered/` until content is successfully placed
- Never create duplicate information across files
- Always maintain existing document structure when synthesizing
- Ask user before creating new category folders
- Preserve code examples and configuration snippets exactly

