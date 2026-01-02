# Security Best Practices

**Category**: Development Guidelines
**Priority**: Critical
**Last Updated**: 2026-01-01

---

## Overview

Security must be a primary consideration in all code changes. This document provides essential security patterns and practices for the Stock and Crypto Tracker project.

---

## 1. Secret Management

### 1.1 Never Commit Secrets

**Rules:**
- ❌ NEVER commit real credentials, API keys, passwords, or tokens to version control
- ❌ NEVER use real values in `.env.example` files - use placeholders only
- ✅ Store all secrets in Infisical Cloud (production)
- ✅ Use local `.env` files for development (git-ignored)

**Example - Bad:**
```bash
# .env.example
DATABASE_URL=postgresql://user:RealPassword123@db.example.com:5432/db
```

**Example - Good:**
```bash
# .env.example
DATABASE_URL=postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres
```

### 1.2 Never Log Secrets

**Rules:**
- ❌ NEVER log full connection strings, tokens, or API keys
- ✅ Mask secrets in logs and error messages
- ✅ Use `[REDACTED]` or `***` for sensitive values

**Example - C#:**
```csharp
// Bad
_logger.LogInformation($"Connecting to {connectionString}");

// Good
_logger.LogInformation($"Connecting to database: {GetMaskedConnectionString(connectionString)}");

private string GetMaskedConnectionString(string connStr)
{
    // Mask password in connection string
    return Regex.Replace(connStr, @"Password=[^;]+", "Password=***");
}
```

**Example - TypeScript:**
```typescript
// Bad
console.log(`API Key: ${apiKey}`);

// Good
console.log(`API Key: ${apiKey.substring(0, 8)}...***`);
```

### 1.3 Environment-Based Configuration

**Rules:**
- ✅ Use environment variables for all configuration
- ✅ Validate required env vars at startup
- ✅ Fail fast if critical secrets are missing

**Example - C#:**
```csharp
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Database connection string not configured");
```

**Example - TypeScript:**
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
}
```

---

## 2. Input Validation

### 2.1 SQL Injection Prevention

**Rules:**
- ✅ ALWAYS use parameterized queries (Dapper, EF Core, Supabase)
- ❌ NEVER concatenate user input into SQL strings
- ✅ Validate and sanitize all user inputs

**Example - C# with Dapper:**
```csharp
// Bad - Vulnerable to SQL injection
var symbol = request.Symbol;
var sql = $"SELECT * FROM stocks WHERE symbol = '{symbol}'";
var result = await connection.QueryAsync(sql);

// Good - Parameterized query
var sql = "SELECT * FROM stocks WHERE symbol = @Symbol";
var result = await connection.QueryAsync(sql, new { Symbol = request.Symbol });
```

**Example - TypeScript with Supabase:**
```typescript
// Bad - Building raw SQL (avoid if possible)
const symbol = userInput;
const { data } = await supabase.rpc('raw_sql', { query: `SELECT * FROM stocks WHERE symbol = '${symbol}'` });

// Good - Using Supabase query builder
const { data } = await supabase
  .from('stocks')
  .select('*')
  .eq('symbol', userInput);
```

### 2.2 XSS Prevention

**Rules:**
- ✅ Sanitize all user-generated content before rendering
- ✅ Use framework-provided escaping (React auto-escapes)
- ❌ NEVER use `dangerouslySetInnerHTML` without sanitization
- ✅ Set proper Content-Security-Policy headers

**Example - React:**
```typescript
// Bad - Vulnerable to XSS
function DisplayName({ name }: { name: string }) {
  return <div dangerouslySetInnerHTML={{ __html: name }} />;
}

// Good - React auto-escapes
function DisplayName({ name }: { name: string }) {
  return <div>{name}</div>;
}

// If HTML needed - use sanitizer
import DOMPurify from 'dompurify';

function DisplayContent({ html }: { html: string }) {
  const sanitized = DOMPurify.sanitize(html);
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

### 2.3 Input Validation Patterns

**Rules:**
- ✅ Whitelist allowed values when possible
- ✅ Validate data types, lengths, formats
- ✅ Use validation libraries (Zod, Joi, FluentValidation)
- ❌ NEVER trust client-side validation alone

**Example - TypeScript with Zod:**
```typescript
import { z } from 'zod';

const StockSymbolSchema = z.object({
  symbol: z.string().regex(/^[A-Z]{1,5}$/), // 1-5 uppercase letters
  quantity: z.number().int().positive().max(10000),
});

// Validate request
const result = StockSymbolSchema.safeParse(request.body);
if (!result.success) {
  return res.status(400).json({ error: result.error });
}
```

**Example - C# with FluentValidation:**
```csharp
public class StockRequestValidator : AbstractValidator<StockRequest>
{
    public StockRequestValidator()
    {
        RuleFor(x => x.Symbol)
            .NotEmpty()
            .Matches(@"^[A-Z]{1,5}$")
            .WithMessage("Symbol must be 1-5 uppercase letters");

        RuleFor(x => x.Quantity)
            .GreaterThan(0)
            .LessThanOrEqualTo(10000);
    }
}
```

---

## 3. Authentication & Authorization

### 3.1 Authentication Patterns

**Rules:**
- ✅ Use Supabase Auth for user authentication
- ✅ Validate JWT tokens on every API request
- ✅ Check token expiration
- ❌ NEVER trust client-provided user IDs without verification

**Example - Next.js API Route:**
```typescript
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  // Get auth token from header
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify token
  const { data: { user }, error } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );

  if (error || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // User is authenticated
  return Response.json({ userId: user.id });
}
```

### 3.2 Authorization Patterns

**Rules:**
- ✅ Implement Row-Level Security (RLS) in Supabase
- ✅ Verify user permissions before data access
- ✅ Use principle of least privilege
- ❌ NEVER rely on client-side authorization checks alone

**Example - Supabase RLS Policy:**
```sql
-- Users can only see their own portfolio
CREATE POLICY "Users can view own portfolio"
ON portfolios FOR SELECT
USING (auth.uid() = user_id);

-- Users can only update their own data
CREATE POLICY "Users can update own portfolio"
ON portfolios FOR UPDATE
USING (auth.uid() = user_id);
```

---

## 4. Timing Attack Prevention

### 4.1 Constant-Time Comparison

**Rules:**
- ✅ Use constant-time comparison for secrets/tokens
- ❌ NEVER use `==` or `===` for comparing secrets
- ✅ Use `crypto.timingSafeEqual()` in Node.js
- ✅ Use `CryptographicOperations.FixedTimeEquals()` in C#

**Example - TypeScript:**
```typescript
import crypto from 'crypto';

function verifyApiKey(provided: string, expected: string): boolean {
  // Bad - vulnerable to timing attacks
  // return provided === expected;

  // Good - constant time comparison
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');

  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}
```

**Example - C#:**
```csharp
using System.Security.Cryptography;

public bool VerifyApiKey(string provided, string expected)
{
    // Bad - vulnerable to timing attacks
    // return provided == expected;

    // Good - constant time comparison
    var providedBytes = Encoding.UTF8.GetBytes(provided);
    var expectedBytes = Encoding.UTF8.GetBytes(expected);

    return CryptographicOperations.FixedTimeEquals(providedBytes, expectedBytes);
}
```

---

## 5. Rate Limiting & DoS Prevention

### 5.1 API Rate Limiting

**Rules:**
- ✅ Implement rate limiting on all public APIs
- ✅ Use different limits for authenticated vs. anonymous users
- ✅ Return proper HTTP 429 status codes
- ✅ Include retry-after headers

**Example - Next.js with Upstash:**
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 requests per 10 seconds
});

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? 'anonymous';
  const { success, limit, reset, remaining } = await ratelimit.limit(ip);

  if (!success) {
    return Response.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        },
      }
    );
  }

  // Process request
}
```

### 5.2 Request Size Limits

**Rules:**
- ✅ Limit request body size
- ✅ Set timeouts on external API calls
- ✅ Limit pagination results

**Example - Next.js Config:**
```javascript
// next.config.js
module.exports = {
  api: {
    bodyParser: {
      sizeLimit: '1mb', // Limit request body size
    },
  },
};
```

---

## 6. CORS Configuration

### 6.1 Proper CORS Setup

**Rules:**
- ✅ Explicitly whitelist allowed origins
- ❌ NEVER use `*` in production
- ✅ Set appropriate allowed methods and headers
- ✅ Use credentials carefully

**Example - Caddy (VM Deployment):**
```
# deployment/vm/Caddyfile
https://nxserver.malaysiawest.cloudapp.azure.com {
  header {
    Access-Control-Allow-Origin "https://your-frontend.vercel.app"
    Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    Access-Control-Allow-Headers "Content-Type, Authorization"
    Access-Control-Max-Age "3600"
  }
}
```

**Example - Next.js API Route:**
```typescript
export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://your-frontend.vercel.app',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
```

---

## 7. OWASP Top 10 Reminders

### Critical Vulnerabilities to Prevent:

1. **Broken Access Control**: Always verify user permissions
2. **Cryptographic Failures**: Use HTTPS, encrypt sensitive data at rest
3. **Injection**: Use parameterized queries, validate inputs
4. **Insecure Design**: Follow security-by-design principles
5. **Security Misconfiguration**: Secure defaults, disable debug in production
6. **Vulnerable Components**: Keep dependencies updated
7. **Authentication Failures**: Use MFA, secure session management
8. **Data Integrity Failures**: Verify data sources, use checksums
9. **Logging Failures**: Log security events, protect logs
10. **SSRF**: Validate and sanitize URLs, use allowlists

**Resources:**
- [OWASP Top 10 2021](https://owasp.org/www-project-top-ten/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)

---

## 8. Dependency Security

### 8.1 Dependency Management

**Rules:**
- ✅ Regularly update dependencies
- ✅ Run security audits (`npm audit`, `dotnet list package --vulnerable`)
- ✅ Use Dependabot or Renovate for automated updates
- ✅ Review security advisories

**Commands:**
```bash
# Node.js
npm audit
npm audit fix

# .NET
dotnet list package --vulnerable
dotnet add package <package-name> --version <safe-version>
```

---

## 9. Production Security Checklist

Before deploying to production, verify:

- [ ] No secrets in source code or `.env.example`
- [ ] All secrets stored in Infisical Cloud
- [ ] HTTPS enabled (Caddy auto-HTTPS)
- [ ] Input validation on all endpoints
- [ ] Rate limiting configured
- [ ] CORS properly configured (no `*`)
- [ ] Authentication required on protected routes
- [ ] RLS policies enabled in Supabase
- [ ] Error messages don't leak sensitive info
- [ ] Logging doesn't include secrets
- [ ] Dependencies up to date
- [ ] Security headers configured (CSP, HSTS, etc.)

---

## 10. Security Incident Response

### If a Secret is Compromised:

1. **Immediate Actions:**
   - Rotate the compromised credential immediately
   - Review access logs for unauthorized usage
   - Update Infisical Cloud with new secret
   - Update GitHub Secrets if needed
   - Redeploy affected services

2. **Investigation:**
   - Identify how the secret was exposed
   - Check git history for exposure
   - Audit all systems that used the secret

3. **Prevention:**
   - Update this security guide if needed
   - Add git pre-commit hooks to prevent future exposure
   - Review and improve secret management practices

---

## Related Documentation

### Rules
- [Secrets Management (Infisical)](./secrets-infisical.md)
- [CI/CD Deployment](./cicd-deployment.md)
- [Core Context](./core-context.md)
- [C# Conventions](./conventions/csharp.md) - See error handling and validation sections
- [TypeScript Conventions](./conventions/typescript.md) - See type safety and error handling

### Skills
- [Worker Requirements](../skills/worker-requirements/SKILL.md) - Worker creation with security best practices
- [CLI Infisical Skill](../skills/cli/References/infisical/REFERENCE.md) - Managing secrets via CLI

---

## Questions?

If you're unsure about security implications of a change:
1. Check this guide
2. Review OWASP guidelines
3. Ask for security review before merging
4. When in doubt, prefer safer approach
