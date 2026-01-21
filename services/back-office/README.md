# Stock Tracker Back-Office

A Next.js 16 administration interface for configuring and monitoring the Stock Tracker system.

## Features

### Dashboard
- Worker health status overview
- Quick access to all system components

### Data Fetchers
- **Dynamic worker discovery** - Workers auto-appear from `worker_registry` database
- **Configuration UI** - Enable/disable schedules, modify tickers without code changes
- **Manual triggers** - Fetch buttons for testing
- **Grafana embeds** - Real-time metrics panels

### CLI Testing
- AI agent endpoint testing (Claude, Cursor)
- Direct API interaction for debugging

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4
- **UI Components**: shadcn/ui (Button, Card, Textarea)
- **Icons**: Lucide React
- **Database**: Supabase (PostgreSQL)

## Pages

| Route | Purpose |
|-------|---------|
| `/back-office` | Dashboard with worker health overview |
| `/back-office/cli` | AI CLI testing interface |
| `/back-office/data-fetchers` | List all data-fetcher workers |
| `/back-office/data-fetchers/[worker]` | Individual worker config & monitoring |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase anon key |
| `NEXT_PUBLIC_BASE_PATH` | Base path for routing (default: `/back-office`) |

## Development

```bash
cd services/back-office

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000/back-office](http://localhost:3000/back-office)

## Database Integration

The back-office reads from these Supabase tables:

| Table | Purpose |
|-------|---------|
| `worker_registry` | Dynamic worker discovery & config schema |
| `worker_fetch_schedules` | Schedule configuration with worker_id link (editable) |
| `stock_tickers` | Ticker management (editable) |
| `worker_metrics_daily` | Daily statistics |

### Adding a New Worker

New data-fetcher workers automatically appear in the back-office when added to `worker_registry`:

```sql
INSERT INTO worker_registry (name, display_name, description, service_type, health_endpoint, status_endpoint)
VALUES ('newworker', 'New Worker', 'Description', 'data-fetcher', '/api/newworker/health/live', '/api/newworker/api/fetch/status');
```

## Grafana Integration

Worker pages embed Grafana panels via iframe. Configure panel IDs in `worker_registry.config_schema`:

```json
{
  "grafana_panels": [
    {"name": "Worker Status", "panelId": "1", "dashboardUid": "twelvedata-details"},
    {"name": "Fetch Operations", "panelId": "2", "dashboardUid": "twelvedata-details"}
  ]
}
```

**Note**: Grafana Cloud may require CORS configuration for iframe embedding.

## Project Structure

```
src/
├── app/
│   ├── layout.tsx            # Main layout with sidebar
│   ├── page.tsx              # Dashboard
│   ├── cli/
│   │   └── page.tsx          # CLI testing
│   ├── data-fetchers/
│   │   ├── page.tsx          # Worker list
│   │   └── [worker]/
│   │       └── page.tsx      # Worker config
│   └── api/
│       ├── claude/route.ts   # Claude API proxy
│       └── cursor/route.ts   # Cursor API proxy
├── components/
│   ├── sidebar.tsx           # Collapsible navigation
│   └── ui/                   # shadcn components
└── lib/
    ├── supabase.ts           # Supabase client & types
    └── utils.ts              # Utility functions
```

## Deployment

The back-office is deployed to Vercel with auto-sync from Infisical for environment variables.

## Related Documentation

- [Data-Fetcher & Back-Office Architecture](../../instruction/architecture/data-fetcher-backoffice-integration.md)
- [Data-Fetcher Requirements Runbook](../../instruction/runbooks/data-fetcher-requirements.md)
