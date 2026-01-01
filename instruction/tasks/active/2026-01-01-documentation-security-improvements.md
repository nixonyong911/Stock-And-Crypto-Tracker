# Documentation & Security Improvements

**Created**: 2026-01-01
**Priority**: High
**Status**: 🟡 Active

---

## Overview

Address critical security issues and documentation inconsistencies identified during rules/skills audit.

---

## Phase 1: Critical Security Issues (URGENT)

### 1.1 Fix Exposed Secrets in .env.example
- [ ] Rotate all exposed credentials:
  - [ ] Regenerate Supabase secret key in dashboard
  - [ ] Change database password in Supabase
  - [ ] Update all keys in Infisical Cloud
- [ ] Replace .env.example with safe placeholders:
  - [ ] `NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co`
  - [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_your-key-here`
  - [ ] `SUPABASE_SECRET_DEFAULT_KEY=sb_secret_your-key-here`
  - [ ] `DATABASE_URL=postgresql://postgres:your-password@your-host:5432/postgres`
- [ ] Verify no real secrets in any committed files
- [ ] Update Infisical sync to GitHub/Vercel with new credentials

**Why Critical**: Real secrets exposed in public .env.example file

---

### 1.2 Create Security Best Practices Rule
- [ ] Create `instruction/rules/security.md` with:
  - [ ] Input validation patterns (SQL injection, XSS prevention)
  - [ ] Authentication/authorization patterns
  - [ ] Timing attack prevention (use `secrets.compare_digest()`)
  - [ ] Secret handling rules (never log, mask in errors)
  - [ ] OWASP Top 10 reminders
  - [ ] Rate limiting patterns
  - [ ] CORS configuration guidelines
- [ ] Reference from `core-context.md`

**Why Critical**: No centralized security guidelines exist

---

## Phase 2: Infrastructure & Configuration

### 2.1 Centralize Infrastructure Values
- [ ] Create `instruction/reference/infrastructure-config.md` with:
  - [ ] VM IP address: `20.17.176.1`
  - [ ] VM FQDN: `nxserver.malaysiawest.cloudapp.azure.com`
  - [ ] Deploy path: `/opt/stocktracker`
  - [ ] SSH key path reference
  - [ ] Service ports mapping
- [ ] Update all references to point to this config:
  - [ ] `rules/vm-operations.md`
  - [ ] `skills/cli-*/SKILL.md`
  - [ ] `.github/workflows/deploy-vm.yml` (add comment reference)

**Why Important**: Hardcoded values in multiple files make updates error-prone

---

### 2.2 Fix Status Inconsistencies
- [ ] Verify actual service status on VM:
  - [ ] Check if Metrics service is running
  - [ ] Check if AI Hub is running
  - [ ] Check deployment/vm/docker-compose.yml
- [ ] Update `KNOWLEDGE.md` Active Components table with accurate status
- [ ] Update `core-context.md` if services have changed

**Why Important**: Incorrect status leads to wrong assumptions

---

## Phase 3: Documentation Quality

### 3.1 Fix Broken References
- [ ] Verify all file path references are valid:
  - [ ] Check `instruction/cli/caddy/worker-endpoints.md` exists
  - [ ] Update references in `conventions/docker.md`
  - [ ] Update references in `rules/cicd-deployment.md`
- [ ] Create missing files if needed, or update references to correct paths
- [ ] Run validation: `find instruction/ -name "*.md" -exec grep -l "cli/caddy" {} \;`

**Why Important**: Broken links confuse AI agents and developers

---

### 3.2 Expand Coding Conventions
- [ ] Enhance `conventions/csharp.md`:
  - [ ] Error handling patterns (try-catch, custom exceptions)
  - [ ] Logging patterns (structured logging with Serilog)
  - [ ] Testing standards (unit tests, integration tests)
  - [ ] Async/await best practices
  - [ ] Dependency injection patterns
- [ ] Enhance `conventions/typescript.md`:
  - [ ] Error handling (try-catch, error boundaries)
  - [ ] Logging patterns (console.log vs structured logging)
  - [ ] Testing standards (Jest, React Testing Library)
  - [ ] Next.js specific patterns (SSR, SSG, API routes)
  - [ ] State management patterns
- [ ] Enhance `conventions/docker.md`:
  - [ ] Multi-stage builds
  - [ ] Layer caching strategies
  - [ ] Security: non-root users, minimal base images
  - [ ] Health check patterns

**Why Important**: Minimal conventions lead to inconsistent code quality

---

### 3.3 Document Task Organization
- [ ] Update `rules/task-management.md` to document subdirectories:
  - [ ] When to use subdirectories (`tasks/active/{category}/`)
  - [ ] Allowed categories: `.net`, `AI`, `oracle`, etc.
  - [ ] When to keep tasks at root level
- [ ] Add examples for both approaches

**Why Important**: Current structure unclear about subdirectory usage

---

## Phase 4: Skill Optimization

### 4.1 Break Down Large Skills
- [ ] Evaluate `skill-creator/SKILL.md` (367 lines):
  - [ ] Consider splitting: skill creation vs. skill maintenance
  - [ ] Extract common patterns to a reference doc
- [ ] Evaluate `data-fetcher/SKILL.md` (285 lines):
  - [ ] Consider splitting: planning vs. implementation vs. testing
  - [ ] Extract templates to separate files
- [ ] Keep each skill under 200 lines when possible

**Why Important**: Large skills harder for AI to process efficiently

---

### 4.2 Fix Docker Context Documentation
- [ ] Review `conventions/docker.md` example:
  - [ ] Clarify `./repo/services` vs actual VM path
  - [ ] Add note about local vs. VM context differences
  - [ ] Update example to match actual docker-compose.yml

**Why Important**: Path confusion for developers

---

## Phase 5: Governance & Policies

### 5.1 Create Deprecation Policy
- [ ] Create `rules/deprecation-policy.md`:
  - [ ] When to archive vs. delete content
  - [ ] File naming: `YYYY-MM-DD-original-name.md`
  - [ ] Required deprecation header format
  - [ ] Retention policy (e.g., 6 months)
  - [ ] How to reference archived content
- [ ] Update `archived/README.md` with policy link

**Why Important**: No clear guidance on archiving

---

### 5.2 Enhance AI Behavior Guidelines
- [ ] Expand `rules/ai-behavior.md`:
  - [ ] Code review checklist (security, performance, maintainability)
  - [ ] Testing expectations (when to write tests)
  - [ ] Documentation standards (when to update docs)
  - [ ] Communication tone (technical but friendly)
  - [ ] Error handling (how to report failures)

**Why Important**: Current rules too narrow (only plan generation)

---

### 5.3 Add Cross-References
- [ ] Add "Related Rules" section to each skill
- [ ] Add "Related Skills" section to each rule
- [ ] Ensure bidirectional linking
- [ ] Create a dependency graph document

**Why Important**: Improves discoverability

---

## Phase 6: Validation & Cleanup

### 6.1 Verify CI/CD Documentation Accuracy
- [ ] Compare `.github/workflows/deploy-vm.yml` with `rules/cicd-deployment.md`
- [ ] Document all Phase 1-3 optimizations
- [ ] Verify build cache strategy documented
- [ ] Verify health check strategy documented

**Why Important**: Ensure docs match implementation

---

### 6.2 Clean Up Archived Content
- [ ] Review all `archived/` files
- [ ] Add date stamps if missing
- [ ] Add deprecation headers
- [ ] Remove or clearly mark Container Apps references
- [ ] Update `archived/README.md` with index

**Why Important**: Reduce confusion from old content

---

### 6.3 Final Audit
- [ ] Run link checker on all instruction/ files
- [ ] Verify all code examples compile/run
- [ ] Check for duplicate content across files
- [ ] Spell check all documentation
- [ ] Ensure consistent formatting (markdown)

---

## Success Criteria

- ✅ No real secrets in any committed files
- ✅ Security best practices documented
- ✅ Infrastructure values centralized
- ✅ All file references valid
- ✅ Coding conventions comprehensive
- ✅ KNOWLEDGE.md accurate
- ✅ All skills under 200 lines
- ✅ Clear deprecation policy
- ✅ Enhanced AI behavior guidelines

---

## Timeline Estimate

- **Phase 1**: URGENT - Complete within 24 hours
- **Phase 2-3**: 2-3 days
- **Phase 4-6**: 3-5 days
- **Total**: ~1 week

---

## Notes

- Phase 1 (security) is CRITICAL and should be completed immediately
- Phases can be parallelized if multiple people working
- After Phase 1, invoke `rules-keeper` to update affected rules
- After all phases, invoke `knowledge-keeper` to extract learnings
