# Cursor Agent CLI

AI-powered coding agent from [cursor.com/cli](https://cursor.com/cli).

---

## Installation

```bash
curl https://cursor.com/install -fsSL | bash
```

**Location:** `~/.local/bin/cursor-agent`

---

## Interactive Mode

```bash
# Start interactive session
cursor-agent

# Start with specific model
cursor-agent --model sonnet-4
cursor-agent --model gpt-5
cursor-agent --model opus-4
```

---

## Non-Interactive Mode (Scripts)

```bash
# Print response and exit
cursor-agent -p "Review this code and suggest improvements"

# With specific output format
cursor-agent -p --output-format text "Fix the bug in main.py"
cursor-agent -p --output-format json "List all functions"
cursor-agent -p --output-format stream-json "Analyze this file"

# Stream partial output
cursor-agent -p --output-format stream-json --stream-partial-output "Generate code"
```

---

## Session Management

```bash
# Resume last session
cursor-agent --resume

# Resume specific session
cursor-agent --resume <chatId>
```

---

## Authentication

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
# simple-code-review.sh

cursor-agent -p --output-format text \
  "Review the recent code changes and provide feedback on:
   - Code quality and readability
   - Potential bugs or issues
   - Security considerations
   Write results to review.txt"
```

---

## Version & Help

```bash
cursor-agent --version
cursor-agent --help
```

