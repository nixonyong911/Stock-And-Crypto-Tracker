# Testing Strategy

## Setup

### Vitest (Unit Tests)

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

```typescript
// vitest.setup.ts
import '@testing-library/jest-dom/vitest'
```

### Playwright (E2E)

```bash
npm install -D @playwright/test
npx playwright install
```

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

## File Structure

```
services/frontend/
├── src/
│   └── __tests__/           # Unit tests (mirror src structure)
│       ├── components/
│       ├── hooks/
│       └── lib/
├── e2e/                     # Playwright E2E tests
│   ├── auth.spec.ts
│   └── dashboard.spec.ts
├── vitest.config.ts
└── playwright.config.ts
```

## Unit Test Patterns

### Component Test

```typescript
// src/__tests__/components/ui/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('Button', () => {
  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click me</Button>)

    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
```

### Hook Test

```typescript
// src/__tests__/hooks/use-stocks-query.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useStocksQuery } from '@/hooks/use-stocks-query'

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
)

describe('useStocksQuery', () => {
  it('fetches stocks', async () => {
    const { result } = renderHook(() => useStocksQuery(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeDefined()
  })
})
```

### Mocking Supabase

```typescript
// src/__tests__/lib/supabase/stocks.test.ts
import { vi } from 'vitest'
import { getStocks } from '@/lib/supabase/stocks'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    from: () => ({
      select: vi.fn().mockResolvedValue({
        data: [{ stock_id: '1', symbol: 'AAPL', price: 150 }],
        error: null,
      }),
    }),
  }),
}))

describe('getStocks', () => {
  it('returns stocks on success', async () => {
    const result = await getStocks()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0].symbol).toBe('AAPL')
    }
  })
})
```

## E2E Test Patterns

### Auth Flow

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test('login redirects to dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.fill('[name="email"]', 'test@example.com')
  await page.fill('[name="password"]', 'password')
  await page.click('button[type="submit"]')

  await expect(page).toHaveURL('/dashboard')
})

test('protected route redirects to login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL('/login')
})
```

### Visual Regression

```typescript
// e2e/visual.spec.ts
import { test, expect } from '@playwright/test'

test('dashboard matches snapshot', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveScreenshot('dashboard.png')
})
```

## Commands

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

## CI Integration

```yaml
# .github/workflows/test.yml
- run: npm run test -- --coverage
- run: npx playwright install --with-deps
- run: npm run test:e2e
```
