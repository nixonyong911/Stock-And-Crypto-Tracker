# AI CLI Skill

## Overview

AI-powered coding agent CLIs for automated code review, generation, and project tasks.

---

## Claude Code CLI

### Installation

```bash
npm install -g @anthropic-ai/claude-code
```

**Location:** `/usr/bin/claude`

### Interactive Mode

```bash
# Start interactive session
claude

# Start with debug mode
claude --debug
```

### Non-Interactive Mode (Scripts)

```bash
# Print response and exit
claude -p "Explain this function"

# Output formats
claude -p --output-format text "Describe this code"
claude -p --output-format json "List all imports"
claude -p --output-format stream-json "Generate code"
```

### Session Management

```bash
# Continue most recent conversation
claude --continue
claude -c

# Resume by session ID
claude --resume <session-id>
```

### Tool Control

```bash
# Allow specific tools only
claude --allowed-tools "Bash(git:*) Edit Read"

# Permission modes
claude --permission-mode default
claude --permission-mode acceptEdits
claude --permission-mode plan
```

### System Prompts

```bash
# Override system prompt
claude --system-prompt "You are a Python expert"

# Append to default
claude --append-system-prompt "Focus on security"
```

---

## Cursor Agent CLI

### Installation

```bash
curl https://cursor.com/install -fsSL | bash
```

**Location:** `~/.local/bin/cursor-agent`

### Interactive Mode

```bash
# Start interactive session
cursor-agent

# Start with specific model
cursor-agent --model sonnet-4
cursor-agent --model opus-4
```

### Non-Interactive Mode (Scripts)

```bash
# Print response and exit
cursor-agent -p "Review this code and suggest improvements"

# Output formats
cursor-agent -p --output-format text "Fix the bug in main.py"
cursor-agent -p --output-format json "List all functions"
```

### Session Management

```bash
# Resume last session
cursor-agent --resume

# Resume specific session
cursor-agent --resume <chatId>
```

### Authentication

```bash
# Via environment variable
export CURSOR_API_KEY="your-api-key"
cursor-agent

# Via command line
cursor-agent --api-key "your-api-key"
```

---

## Script Integration Example

```bash
#!/bin/bash
# code-review.sh

cursor-agent -p --output-format text \
  "Review the recent code changes and provide feedback on:
   - Code quality and readability
   - Potential bugs or issues
   - Security considerations
   Write results to review.txt"
```

---

## Related

- [powershell](../powershell/REFERENCE.md) - PowerShell cursor-agent function

