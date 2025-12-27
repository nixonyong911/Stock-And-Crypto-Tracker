# Cursor CLI Sub-Agents Setup

**Created**: December 28, 2025  
**Status**: Not Started

## Overview

Enable Claude Code-style sub-agents natively in Cursor by leveraging the `cursor-agent` CLI in non-interactive mode. The main Cursor agent will orchestrate specialized sub-agents (Build, QA, Review, Security) that work concurrently and verify each other's work.

---

## Background

This approach was discovered as a Cursor-native solution to achieve multi-agent workflows without needing Claude Code. Key insight:

> The main agent in Cursor IDE can spawn sub-agents by running `cursor-agent` CLI in non-interactive mode. Each sub-agent has its own context window and can modify files (with `--force` flag). Results return as text for the main agent to parse and synthesize.

**Reference**: [Cursor CLI Docs](https://cursor.com/docs/cli)

---

## Pending Items

### 1. Verify Cursor CLI Installation

- [ ] Check if `cursor-agent` is installed: `cursor-agent --version`
- [ ] If not installed, run: `curl https://cursor.com/install -fsS | bash`
- [ ] Add to PATH if needed (PowerShell profile)
- [ ] Authenticate: `cursor-agent login`
- [ ] Verify auth: `cursor-agent status`

### 2. Create Sub-Agent Command Files

Create specialized commands in `.cursor/commands/`:

- [ ] Create `.cursor/commands/build-agent.md` - Feature implementation agent
- [ ] Create `.cursor/commands/qa-agent.md` - Validation and testing agent
- [ ] Create `.cursor/commands/review-agent.md` - Code quality review agent
- [ ] Create `.cursor/commands/security-agent.md` - Security audit agent

### 3. Add Orchestration Rules

- [ ] Add sub-agent orchestration rules to Cursor User Settings (not `.cursorrules`)
- [ ] Document CLI invocation patterns:
  - Read-only: `cursor-agent -p "/[agent] [CONTEXT]" --output-format text`
  - Write: `cursor-agent -p "/[agent] [TASK]" --force --output-format text`
  - With model: `cursor-agent -p "/[agent] [TASK]" --model sonnet-4 --output-format text`

### 4. Test the Workflow

- [ ] Test CLI works: `cursor-agent -p "What is 2+2?" --output-format text`
- [ ] Test a command: `cursor-agent -p "/review-agent Review recent changes" --output-format text`
- [ ] Test full workflow with a small feature request

---

## Command File Templates

### Build Agent (`.cursor/commands/build-agent.md`)

```markdown
# Build Agent - Feature Implementation

You are a senior software engineer implementing features.

## Constraints
- Follow .cursorrules coding conventions
- Do NOT run tests - leave that to QA agent
- Do NOT review your own code - leave that to Review agent

## Output Format
- FILES_CREATED: [list]
- FILES_MODIFIED: [list]
- CHANGES_SUMMARY: [description]
- READY_FOR_QA: true/false
```

### QA Agent (`.cursor/commands/qa-agent.md`)

```markdown
# QA Agent - Validation Specialist

You are a QA engineer validating implementations.

## Validation Checklist
1. Requirements Match
2. Tests Pass (dotnet test / npm test)
3. Build Succeeds
4. CI/CD Compatible

## Output Format
- REQUIREMENTS_MET: true/false
- TEST_RESULTS: [details]
- VERDICT: APPROVED / NEEDS_FIXES
```

### Review Agent (`.cursor/commands/review-agent.md`)

```markdown
# Review Agent - Code Quality Specialist

You are a senior code reviewer.

## Review Checklist
1. Code Quality
2. Security
3. Performance
4. Conventions (.cursorrules)

## Output Format
- CRITICAL: [must fix]
- WARNINGS: [should fix]
- VERDICT: APPROVED / CHANGES_REQUESTED
```

### Security Agent (`.cursor/commands/security-agent.md`)

```markdown
# Security Agent - Security Audit Specialist

You are a security engineer.

## Security Checklist
1. No hardcoded secrets
2. Parameterized queries
3. Proper auth checks
4. RLS policies

## Output Format
- CRITICAL_VULNERABILITIES: [list]
- VERDICT: SECURE / NEEDS_REMEDIATION
```

---

## Orchestration Rules (for Cursor User Settings)

```markdown
## Sub-Agent Orchestration

When asked to use sub-agents, dispatch parallel sub-agents using Cursor CLI:

### CLI Invocation Pattern
- Read-only: `cursor-agent -p "/[agent] [CONTEXT]" --output-format text`
- Write: `cursor-agent -p "/[agent] [TASK]" --force --output-format text`

### Rules
1. Keep prompts concise
2. Use --force for modifications
3. Parse results for VERDICT
4. Run independent agents in parallel
5. Chain dependent agents sequentially
```

---

## Architecture Diagram

```
Cursor IDE (Main Agent)
       │
       ├── User Rules (orchestration instructions)
       │
       └── Spawns CLI Sub-Agents ──┬── cursor-agent -p "/build-agent ..." --force
                                   ├── cursor-agent -p "/qa-agent ..."
                                   ├── cursor-agent -p "/review-agent ..."
                                   └── cursor-agent -p "/security-agent ..."
                                   │
                                   └── Results return as text → Main agent synthesizes
```

---

## Key Flags Reference

| Flag | Purpose |
|------|---------|
| `-p` | Non-interactive mode (print to console) |
| `--force` (`-f`) | Allow file modifications without prompts |
| `--output-format text` | Return plain text (vs JSON) |
| `--model <model>` | Specify model (sonnet-4, opus, haiku) |

---

## Related Documents

- [Cursor CLI Docs](https://cursor.com/docs/cli)
- [Claude Code Subagents](https://code.claude.com/docs/en/sub-agents) (inspiration)
- [Existing finish-task command](.cursor/commands/finish-task.md)

