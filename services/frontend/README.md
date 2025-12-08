# Frontend Service

Next.js 15 application with Server Components for displaying stock and cryptocurrency data.

## Overview

This service is part of the Stock and Crypto Tracker microservices architecture. It provides a web interface for viewing market data stored in the PostgreSQL database.

## Features

- Server-side rendering with Next.js App Router
- Direct database access via Server Components
- Real-time data display (on page refresh)
- Modern, trading terminal-inspired UI
- Docker containerization support

## Technology Stack

- **Framework**: Next.js 15 (App Router)
- **React**: 19
- **Database Client**: pg (node-postgres)
- **Styling**: CSS Modules with custom properties
- **Typography**: JetBrains Mono (code), Space Grotesk (UI)

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `NODE_ENV` | Environment (development/production) | No |

### Database URL Format

```
postgresql://username:password@host:port/database
```

Example:
```
DATABASE_URL=postgresql://stocktracker:password@postgres:5432/stocktracker
```

## Project Structure

```
frontend/
├── Dockerfile              # Docker build configuration
├── README.md               # This file
├── next.config.js          # Next.js configuration
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript configuration
└── src/
    ├── app/
    │   ├── globals.css     # Global styles
    │   ├── layout.tsx      # Root layout
    │   ├── page.module.css # Home page styles
    │   └── page.tsx        # Home page component
    ├── components/
    │   ├── Header.tsx      # Header component
    │   ├── StockList.tsx   # Stock prices table
    │   ├── CryptoList.tsx  # Crypto prices table
    │   ├── FetchStatus.tsx # Data source status
    │   └── LoadingCard.tsx # Loading skeleton
    ├── lib/
    │   └── db.ts           # Database connection
    └── types/
        └── index.ts        # TypeScript interfaces
```

## Development

### Prerequisites

- Node.js 20+
- PostgreSQL database (or use Docker Compose)

### Running Locally

1. Start the database:
   ```bash
   # From project root
   docker-compose up postgres -d
   ```

2. Install dependencies:
   ```bash
   cd services/frontend
   npm install
   ```

3. Set environment variables:
   ```bash
   # Create .env.local
   echo "DATABASE_URL=postgresql://stocktracker:stocktracker_pass@localhost:5432/stocktracker" > .env.local
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:3000

### Running with Docker

```bash
# From project root
docker-compose up frontend
```

### Building for Production

```bash
npm run build
npm start
```

## Components

### StockList

Displays the latest stock prices from the `latest_stock_prices` database view.

### CryptoList

Displays the latest cryptocurrency prices from the `latest_crypto_prices` database view.

### FetchStatus

Shows recent data fetch operations from the `fetch_logs` table, useful for monitoring data freshness.

## Database Views Used

The frontend queries these database views:

- `latest_stock_prices` - Most recent price for each stock
- `latest_crypto_prices` - Most recent price for each cryptocurrency

And these tables:

- `fetch_logs` - Data fetching operation history

## Styling

The UI uses a dark theme inspired by trading terminals:

- **Colors**: Dark backgrounds with cyan/blue accents
- **Typography**: Monospace for numbers, sans-serif for labels
- **Effects**: Subtle glows, gradients, and animations

CSS custom properties are defined in `globals.css` for easy theming.

## Adding New Features

### Adding a New Data View

1. Create a new component in `src/components/`
2. Add database query using `query()` from `@/lib/db`
3. Import and use in `src/app/page.tsx`
4. Add corresponding CSS module

### Adding New Pages

1. Create a new folder in `src/app/` with the route name
2. Add `page.tsx` for the route component
3. Optionally add `layout.tsx` for route-specific layout

## Troubleshooting

### Common Issues

1. **Database connection error**
   - Verify `DATABASE_URL` is correct
   - Ensure PostgreSQL is running
   - Check network connectivity (localhost vs docker hostname)

2. **Empty data tables**
   - Ensure data fetcher services are running
   - Check `fetch_logs` for errors
   - Verify database initialization completed

3. **Build errors in Docker**
   - Clear Docker build cache: `docker-compose build --no-cache frontend`
   - Ensure all dependencies are in `package.json`

## Performance Considerations

- Server Components fetch data on each request
- Database connection pooling is handled by the `pg` library
- Consider adding caching for high-traffic deployments

## License

MIT License

