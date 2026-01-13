# Form Patterns

## Schema Validation (Zod)

```typescript
// lib/validations/auth.ts
import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export type LoginInput = z.infer<typeof loginSchema>
```

## Server Action Pattern

```typescript
// app/actions/auth.ts
'use server'

import { z } from 'zod'
import { loginSchema } from '@/lib/validations/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type ActionState = {
  error?: string
  fieldErrors?: Record<string, string[]>
}

export async function loginAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const raw = Object.fromEntries(formData)
  const parsed = loginSchema.safeParse(raw)

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return { error: 'errors.unauthorized' }
  }

  redirect('/dashboard')
}
```

## Form Component

```typescript
// components/features/auth/LoginForm.tsx
'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { loginAction } from '@/app/actions/auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function LoginForm() {
  const t = useTranslations()
  const [state, formAction, pending] = useActionState(loginAction, {})

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Input name="email" type="email" placeholder="Email" />
        {state.fieldErrors?.email && (
          <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
        )}
      </div>

      <div>
        <Input name="password" type="password" placeholder="Password" />
        {state.fieldErrors?.password && (
          <p className="text-sm text-destructive">{state.fieldErrors.password[0]}</p>
        )}
      </div>

      {state.error && (
        <p className="text-sm text-destructive">{t(state.error)}</p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? t('common.loading') : t('common.login')}
      </Button>
    </form>
  )
}
```

## React Hook Form (Alternative)

```typescript
// components/features/auth/LoginFormRHF.tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginInput } from '@/lib/validations/auth'

export function LoginFormRHF() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginInput) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    // handle response
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}

      <input {...register('password')} type="password" />
      {errors.password && <span>{errors.password.message}</span>}

      <button disabled={isSubmitting}>Submit</button>
    </form>
  )
}
```

## Pattern Summary

| Approach | Use When |
|----------|----------|
| Server Action + `useActionState` | Progressive enhancement, SSR forms |
| React Hook Form | Complex client-side validation, dynamic fields |
| Controlled inputs | Simple forms, real-time validation |
