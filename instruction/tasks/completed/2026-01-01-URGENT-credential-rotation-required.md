# 🚨 URGENT: Credential Rotation Required

**Created**: 2026-01-01
**Priority**: CRITICAL
**Status**: 🔴 Action Required Immediately

---

## Critical Security Issue

Real production credentials were found committed in `.env.example` file. This file was in the git repository and potentially exposed.

---

## Exposed Credentials (NOW REMOVED FROM FILE)

The following credentials were found in `.env.example` and have been replaced with placeholders:

> NOTE: The actual values below have been REDACTED from this file. They remain
> in Infisical (`SUPABASE_PROJECT_REF`, `SUPABASE_MIRROR_URL`) and, until history
> is purged, in git history. Treat them as compromised and rotate.

### 1. Supabase Credentials
- **Supabase Project URL**: `https://<SUPABASE_PROJECT_REF>.supabase.co`
- **Publishable Key**: `sb_publishable_***REDACTED***`
- **Secret Key**: `sb_secret_***REDACTED***`

### 2. Database Password
- **Password**: `***REDACTED***`
- **Host**: `db.<SUPABASE_PROJECT_REF>.supabase.co`
- **Pooler**: `aws-1-us-east-2.pooler.supabase.com`

---

## Required Actions (MUST DO IMMEDIATELY)

### Step 1: Rotate Supabase Credentials

1. **Go to Supabase Dashboard**: https://app.supabase.com/project/<SUPABASE_PROJECT_REF>/settings/api

2. **Regenerate Service Role Key**:
   - Navigate to: Settings → API → Service role
   - Click "Reset" to generate a new secret key
   - Copy the new key

3. **Change Database Password**:
   - Navigate to: Settings → Database → Connection string
   - Click "Change password"
   - Generate a strong password (or use Supabase's auto-generated one)
   - Save the new password securely

### Step 2: Update Infisical Cloud

1. **Log in to Infisical**: https://app.infisical.com

2. **Update the following secrets** in the `prod` environment:
   ```
   SUPABASE_SECRET_DEFAULT_KEY=<new-service-role-key>
   DATABASE_URL=postgresql://postgres:<new-password>@db.<project-ref>.supabase.co:5432/postgres
   DATABASE_CONNECTION_STRING=User Id=postgres.<project-ref>;Password=<new-password>;Server=aws-1-us-east-2.pooler.supabase.com;Port=6543;Database=postgres
   ```

### Step 3: Update GitHub Secrets

1. **Go to GitHub Repository Settings**:
   - Navigate to: Settings → Secrets and variables → Actions

2. **Update these secrets**:
   ```
   SUPABASE_SECRET_KEY=<new-service-role-key>
   DATABASE_URL=<new-database-url>
   DATABASE_CONNECTION_STRING=<new-connection-string>
   ```

### Step 4: Update Vercel Environment Variables

1. **Go to Vercel Dashboard**: https://vercel.com/nixonyong911/stock-tracker/settings/environment-variables

2. **Update these environment variables**:
   ```
   SUPABASE_SECRET_DEFAULT_KEY=<new-service-role-key>
   DATABASE_URL=<new-database-url>
   ```

3. **Redeploy the frontend**:
   - Vercel should auto-redeploy on environment variable change
   - Or manually trigger: Deployments → Redeploy

### Step 5: Redeploy VM Services

After updating Infisical, redeploy all VM services to pick up new credentials:

```bash
# SSH to VM
ssh-azure

# Pull latest secrets and restart services
cd /opt/stocktracker
infisical export --env=prod > .env
docker compose restart

# Verify services are running with new credentials
docker ps
docker logs twelvedata
docker logs metrics
docker logs back-office
```

### Step 6: Verify Services

Test that all services are working with new credentials:

1. **TwelveData Worker**:
   - Check: https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger
   - Test an endpoint

2. **Metrics Service**:
   - Check: https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/swagger
   - Test health endpoint

3. **Back-office**:
   - Check: https://nxserver.malaysiawest.cloudapp.azure.com/back-office
   - Verify data loading from Supabase

4. **Frontend (Vercel)**:
   - Check: https://your-frontend.vercel.app
   - Verify authentication and data fetching

---

## Investigation Needed

### Check Git History

Check if `.env.example` with real secrets was pushed to remote:

```bash
# Search git history for the exposed password (value redacted; use your own copy)
git log -p --all -S '<exposed-db-password>'

# Search for Supabase secret key
git log -p --all -S 'sb_secret_<redacted>'
```

**If found in git history**:
- The secrets were exposed in the repository
- Consider the database potentially compromised
- Review database audit logs for suspicious activity
- Consider rotating ALL credentials, not just these

### Check Access Logs

In Supabase Dashboard:
1. Navigate to: Logs → API
2. Look for suspicious activity
3. Check for unexpected IP addresses
4. Review recent database queries

---

## Prevention Measures (COMPLETED)

✅ **Fixed `.env.example`**: Replaced real credentials with placeholders
✅ **Created Security Guide**: `instruction/rules/security.md` with best practices
✅ **Updated Core Context**: Added security reminder in `core-context.md`

### Future Prevention:

- [ ] Add git pre-commit hook to detect secrets
- [ ] Use `git-secrets` or `gitleaks` in CI/CD
- [ ] Regular security audits of committed files
- [ ] Team training on secret management

---

## Timeline

- **2026-01-01**: Issue discovered and `.env.example` fixed
- **ASAP**: Rotate all credentials (Steps 1-6 above)
- **Within 24h**: Complete verification and investigation
- **Within 1 week**: Implement prevention measures

---

## Status Checklist

### Critical (Do Now):
- [ ] Regenerate Supabase service role key
- [ ] Change database password
- [ ] Update Infisical Cloud
- [ ] Update GitHub Secrets
- [ ] Update Vercel environment variables
- [ ] Redeploy VM services
- [ ] Verify all services working

### Investigation:
- [ ] Check git history for secret exposure
- [ ] Review Supabase access logs
- [ ] Document findings

### Prevention:
- [ ] Install git-secrets or gitleaks
- [ ] Add pre-commit hooks
- [ ] Schedule quarterly security audits

---

## References

- [Security Best Practices](../rules/security.md)
- [Infisical Documentation](../architecture/infisical-secrets-setup.md)
- [Supabase Security](https://supabase.com/docs/guides/platform/security)

---

## Notes

- **DO NOT** share the old credentials with anyone
- **DO NOT** reuse the old password
- **DO** use strong, randomly generated passwords
- **DO** store new credentials ONLY in Infisical
- **DO** verify this document is completed before marking as done

---

**This is a critical security issue. Complete all steps immediately.**
