# Delegate Output Folder

Centralized storage for delegated task outputs.

## Purpose

Sub-agents write results here. Master agent reads to check completion and make decisions.

## Structure

```
instruction/delegate/
└── <task-name>/
    └── output.md
```

## Usage

**Sub-agent (writing):**
```
Write results to instruction/delegate/<task-name>/output.md
```

**Master agent (reading):**
```
Read instruction/delegate/<task-name>/output.md to check results
```

## Cleanup

Delete task folders after results are consumed and no longer needed.

