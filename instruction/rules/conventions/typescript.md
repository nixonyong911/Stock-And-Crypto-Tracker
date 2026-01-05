# TypeScript Coding Conventions

**Last Updated**: 2026-01-01
**Applies To**: Frontend (Next.js on Vercel), Back-office (Next.js on VM)

---

## Naming Conventions

### General Rules

- Use **camelCase** for: variables, functions, parameters
- Use **PascalCase** for: Types, Interfaces, Classes, React Components, Enums
- Use **SCREAMING_SNAKE_CASE** for: Constants, environment variables
- Prefix interfaces with `I` only when necessary (prefer type aliases)
- Use descriptive names (avoid abbreviations unless widely known)

### Examples

```typescript
// Variables and functions
const userName = "John";
const fetchUserData = async () => { };

// Types and interfaces
type UserData = { id: string; name: string };
interface IApiResponse<T> { data: T; error?: string }

// Components
const UserProfile = () => { };
const DataTable = <T,>({ data }: { data: T[] }) => { };

// Constants
const MAX_RETRY_ATTEMPTS = 3;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

// Enums
enum UserRole {
  Admin = "ADMIN",
  User = "USER",
  Guest = "GUEST"
}
```

---

## Project Structure

### Frontend (`services/frontend/`)
- **Deployed to**: Vercel (production)
- **Framework**: Next.js 15
- **Purpose**: Public-facing stock tracker application

### Back-office (`services/back-office/`)
- **Deployed to**: Azure VM (Docker)
- **Framework**: Next.js 16
- **Purpose**: Admin dashboard for worker management, data monitoring

### Common Patterns

```
app/
├── (routes)/          # App routes
├── api/              # API routes
├── components/       # React components
│   ├── ui/          # shadcn/ui components
│   └── ...          # Feature components
├── lib/             # Utilities, clients
│   ├── supabase/    # Supabase client
│   └── utils.ts     # Helper functions
└── types/           # TypeScript types
```

---

## Type Safety

### Avoid `any`

```typescript
// ❌ BAD - Using any
const fetchData = async (): Promise<any> => {
  const response = await fetch('/api/data');
  return response.json();
};

// ✅ GOOD - Proper typing
type StockData = {
  symbol: string;
  price: number;
  timestamp: Date;
};

const fetchData = async (): Promise<StockData[]> => {
  const response = await fetch('/api/data');
  return response.json();
};
```

### Use Type Guards

```typescript
type SuccessResponse<T> = { data: T; error: null };
type ErrorResponse = { data: null; error: string };
type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

// Type guard
function isSuccess<T>(response: ApiResponse<T>): response is SuccessResponse<T> {
  return response.error === null;
}

// Usage
const response = await fetchStockData();
if (isSuccess(response)) {
  console.log(response.data); // TypeScript knows this is T
} else {
  console.error(response.error); // TypeScript knows this is string
}
```

### Utility Types

```typescript
// Pick specific properties
type UserPreview = Pick<User, 'id' | 'name' | 'email'>;

// Omit properties
type UserWithoutPassword = Omit<User, 'password'>;

// Partial (all properties optional)
type PartialUser = Partial<User>;

// Required (all properties required)
type RequiredUser = Required<PartialUser>;

// Record
type StockPrices = Record<string, number>; // { [symbol: string]: number }

// ReturnType
type FetchResult = ReturnType<typeof fetchStockData>;
```

---

## Error Handling

### Try-Catch Patterns

```typescript
// ❌ BAD - Swallowing errors
try {
  await fetchData();
} catch (error) {
  // Silent failure
}

// ✅ GOOD - Proper error handling
try {
  const data = await fetchStockData(symbol);
  return { data, error: null };
} catch (error) {
  console.error('Failed to fetch stock data:', error);

  // Type-safe error handling
  if (error instanceof Error) {
    return { data: null, error: error.message };
  }

  return { data: null, error: 'Unknown error occurred' };
}
```

### Custom Error Classes

```typescript
class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public endpoint: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ValidationError extends Error {
  constructor(
    message: string,
    public field: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Usage
async function fetchUserData(userId: string) {
  const response = await fetch(`/api/users/${userId}`);

  if (!response.ok) {
    throw new ApiError(
      `Failed to fetch user ${userId}`,
      response.status,
      `/api/users/${userId}`
    );
  }

  return response.json();
}
```

### React Error Boundaries

```typescript
'use client';

import { Component, ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Send to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <h2 className="text-red-800 font-semibold">Something went wrong</h2>
          <p className="text-red-600">{this.state.error?.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

---

## Logging Patterns

### Development vs Production

```typescript
// lib/logger.ts
const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    if (isDev) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },

  info: (message: string, ...args: unknown[]) => {
    console.info(`[INFO] ${message}`, ...args);
  },

  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },

  error: (message: string, error?: Error, ...args: unknown[]) => {
    console.error(`[ERROR] ${message}`, error, ...args);
    // In production, send to error tracking service
    if (!isDev && typeof window !== 'undefined') {
      // Send to Sentry, LogRocket, etc.
    }
  },
};

// Usage
logger.debug('Fetching user data', { userId: '123' });
logger.error('Failed to load data', error);
```

### What NOT to Log

```typescript
// ❌ BAD - Logging sensitive data
console.log('User credentials:', { email, password });
console.log('API Key:', process.env.NEXT_PUBLIC_API_KEY);

// ✅ GOOD - Redact sensitive information
console.log('User authenticated:', { email, passwordProvided: !!password });
console.log('API configured:', { hasApiKey: !!process.env.NEXT_PUBLIC_API_KEY });
```

---

## Next.js Specific Patterns

### Server vs Client Components

```typescript
// ✅ Server Component (default in App Router)
// Can fetch data directly, access secrets
import { supabase } from '@/lib/supabase/server';

export default async function StockList() {
  const { data: stocks } = await supabase
    .from('stocks')
    .select('*')
    .limit(10);

  return (
    <div>
      {stocks?.map(stock => (
        <div key={stock.id}>{stock.symbol}</div>
      ))}
    </div>
  );
}

// ✅ Client Component (interactive)
// Use 'use client' directive
'use client';

import { useState } from 'react';

export default function StockSearch() {
  const [query, setQuery] = useState('');

  return (
    <input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search stocks..."
    />
  );
}
```

### API Routes

```typescript
// app/api/stocks/[symbol]/route.ts
import { NextRequest, NextResponse } from 'next/server';

type Params = {
  symbol: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { symbol } = params;

    // Validate input
    if (!symbol || symbol.length > 5) {
      return NextResponse.json(
        { error: 'Invalid symbol' },
        { status: 400 }
      );
    }

    // Fetch data
    const data = await fetchStockData(symbol);

    return NextResponse.json({ data });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Process request
  // Return response
}
```

### Data Fetching Patterns

```typescript
// Server-side fetch (in Server Component)
async function getStockData(symbol: string) {
  const res = await fetch(`https://api.example.com/stocks/${symbol}`, {
    next: { revalidate: 60 } // Cache for 60 seconds
  });

  if (!res.ok) {
    throw new Error('Failed to fetch stock data');
  }

  return res.json();
}

// Client-side fetch (in Client Component)
'use client';

import { useEffect, useState } from 'react';

function useStockData(symbol: string) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/stocks/${symbol}`);
        const json = await response.json();
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [symbol]);

  return { data, loading, error };
}
```

### Environment Variables

```typescript
// ✅ Public variables (exposed to browser)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// ✅ Server-only variables (NOT exposed to browser)
const supabaseSecret = process.env.SUPABASE_SECRET_KEY; // Only in Server Components/API Routes

// Type-safe env vars
type Env = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
  DATABASE_URL: string;
};

// Validate on startup
function validateEnv(): Env {
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ] as const;

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  return process.env as unknown as Env;
}
```

---

## State Management

### React Context (Simple State)

```typescript
'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark';

type ThemeContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
```

### Zustand (Complex State)

```typescript
import { create } from 'zustand';

type Stock = {
  symbol: string;
  price: number;
};

type StockStore = {
  stocks: Stock[];
  loading: boolean;
  error: string | null;
  fetchStocks: () => Promise<void>;
  addStock: (stock: Stock) => void;
  removeStock: (symbol: string) => void;
};

export const useStockStore = create<StockStore>((set, get) => ({
  stocks: [],
  loading: false,
  error: null,

  fetchStocks: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch('/api/stocks');
      const data = await response.json();
      set({ stocks: data, loading: false });
    } catch (error) {
      set({ error: 'Failed to fetch stocks', loading: false });
    }
  },

  addStock: (stock) => {
    set({ stocks: [...get().stocks, stock] });
  },

  removeStock: (symbol) => {
    set({ stocks: get().stocks.filter(s => s.symbol !== symbol) });
  },
}));
```

---

## Supabase Integration

### Client Setup

```typescript
// lib/supabase/client.ts (Client Components)
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export const supabase = createClientComponentClient();

// lib/supabase/server.ts (Server Components)
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const supabase = createServerComponentClient({ cookies });
```

### Type-Safe Queries

```typescript
// Define database types
export type Database = {
  public: {
    Tables: {
      stocks: {
        Row: {
          id: string;
          symbol: string;
          price: number;
          created_at: string;
        };
        Insert: {
          symbol: string;
          price: number;
        };
        Update: {
          price?: number;
        };
      };
    };
  };
};

// Use typed client
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';

const supabase = createClientComponentClient<Database>();

// Type-safe query
const { data } = await supabase
  .from('stocks')
  .select('*')
  .eq('symbol', 'AAPL')
  .single();

// data is typed as Database['public']['Tables']['stocks']['Row']
```

---

## Testing Standards

### Unit Tests with Jest

```typescript
// components/StockCard.test.tsx
import { render, screen } from '@testing-library/react';
import StockCard from './StockCard';

describe('StockCard', () => {
  it('renders stock symbol and price', () => {
    render(<StockCard symbol="AAPL" price={150.25} />);

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('$150.25')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<StockCard symbol="AAPL" price={null} loading />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
```

### React Testing Library Patterns

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('StockSearch', () => {
  it('updates search query on input', async () => {
    const user = userEvent.setup();
    render(<StockSearch />);

    const input = screen.getByPlaceholderText('Search stocks...');
    await user.type(input, 'AAPL');

    expect(input).toHaveValue('AAPL');
  });

  it('fetches data on submit', async () => {
    const mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [{ symbol: 'AAPL' }] })
      })
    );
    global.fetch = mockFetch as any;

    render(<StockSearch />);

    const button = screen.getByRole('button', { name: /search/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/stocks?q=AAPL');
    });
  });
});
```

### Test Organization

```
__tests__/
├── components/
│   ├── StockCard.test.tsx
│   └── StockList.test.tsx
├── lib/
│   └── utils.test.ts
└── api/
    └── stocks.test.ts
```

---

## Performance Optimization

### Memoization

```typescript
import { useMemo, useCallback } from 'react';

function StockList({ stocks }: { stocks: Stock[] }) {
  // Memoize expensive calculations
  const sortedStocks = useMemo(() => {
    return stocks.sort((a, b) => b.price - a.price);
  }, [stocks]);

  // Memoize callbacks
  const handleStockClick = useCallback((symbol: string) => {
    console.log('Clicked:', symbol);
  }, []);

  return (
    <div>
      {sortedStocks.map(stock => (
        <StockCard
          key={stock.symbol}
          stock={stock}
          onClick={handleStockClick}
        />
      ))}
    </div>
  );
}
```

### Dynamic Imports

```typescript
// Lazy load heavy components
import dynamic from 'next/dynamic';

const StockChart = dynamic(() => import('@/components/StockChart'), {
  loading: () => <div>Loading chart...</div>,
  ssr: false, // Disable server-side rendering if needed
});

export default function StockPage() {
  return (
    <div>
      <h1>Stock Analysis</h1>
      <StockChart symbol="AAPL" />
    </div>
  );
}
```

---

## Code Organization Best Practices

### File Naming

- Components: `PascalCase.tsx` (e.g., `StockCard.tsx`)
- Utilities: `camelCase.ts` (e.g., `formatPrice.ts`)
- Types: `types.ts` or `*.types.ts`
- Tests: `*.test.tsx` or `*.spec.tsx`

### Export Patterns

```typescript
// ✅ Named exports (preferred for utilities)
export const formatPrice = (price: number) => { };
export const calculateChange = (current: number, previous: number) => { };

// ✅ Default exports (for components)
export default function StockCard() { }

// ❌ Avoid mixing default and named exports for components
```

### Barrel Exports

```typescript
// components/index.ts
export { default as StockCard } from './StockCard';
export { default as StockList } from './StockList';
export { default as StockChart } from './StockChart';

// Usage
import { StockCard, StockList } from '@/components';
```

---

## Related Documentation

- [Security Best Practices](../security.md)
- [C# Conventions](./csharp.md)
- [Docker Conventions](./docker.md)






