# Claude Code CLI

AI-powered coding agent from Anthropic.

---

## Installation

```bash
# Via npm (requires Node.js)
npm install -g @anthropic-ai/claude-code
```

**Location:** `/usr/bin/claude`

---

## Interactive Mode

```bash
# Start interactive session
claude

# Start in debug mode
claude --debug

# With verbose output
claude --verbose
```

---

## Non-Interactive Mode (Scripts)

```bash
# Print response and exit
claude -p "Explain this function"

# Output formats
claude -p --output-format text "Describe this code"
claude -p --output-format json "List all imports"
claude -p --output-format stream-json "Generate code"

# Include partial messages while streaming
claude -p --output-format stream-json --include-partial-messages "Analyze"
```

---

## Session Management

```bash
# Continue most recent conversation
claude --continue
claude -c

# Resume by session ID or search
claude --resume
claude --resume <session-id>
claude -r "search term"
```

---

## Tool & Permission Control

```bash
# Allow specific tools only
claude --allowed-tools "Bash(git:*) Edit Read"

# Disallow specific tools
claude --disallowed-tools "Bash Edit"

# Specify available tools (print mode only)
claude -p --tools "Bash,Edit,Read" "list files"
claude -p --tools "" "no tools available"
claude -p --tools "default" "all tools"

# Permission modes
claude --permission-mode default
claude --permission-mode acceptEdits
claude --permission-mode plan
claude --permission-mode delegate
```

---

## System Prompts

```bash
# Override system prompt
claude --system-prompt "You are a Python expert"

# Append to default system prompt
claude --append-system-prompt "Focus on security"
```

---

## Budget Control

```bash
# Set max spend (print mode only)
claude -p --max-budget-usd 5 "Large task"
```

---

## MCP Integration

```bash
# Load MCP server config
claude --mcp-config mcp-servers.json

# Enable MCP debug logging
claude --debug "mcp"
```

---

## Dangerous/Sandbox Modes

```bash
# Skip all permission checks (sandboxed environments only)
claude --dangerously-skip-permissions

# Enable skip option without default
claude --allow-dangerously-skip-permissions
```

---

## Version & Help

```bash
claude --version
claude --help
```

