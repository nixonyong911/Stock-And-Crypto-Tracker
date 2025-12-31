# TypeScript Coding Conventions

## Naming

- Use **camelCase** for variables and functions
- Use **PascalCase** for types, interfaces, components

## Supabase Client

Import from the centralized client:
```typescript
import { supabase } from '@/lib/supabase/client'
```

## Project Structure

- Frontend: `services/frontend/` (Next.js on Vercel)
- Back-office: `services/back-office/` (Next.js admin UI)

