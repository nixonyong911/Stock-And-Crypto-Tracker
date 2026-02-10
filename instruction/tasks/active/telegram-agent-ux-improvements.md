# Telegram Agent UX Improvements

**Status:** Pending
**Priority:** Medium
**Created:** 2026-01-11

## Overview

Improve the Telegram AI agent user experience with progress indicators and session management.

## Features

### 1. Progress Indicator

**Goal:** User knows AI is working (doesn't need to be real AI output)

**Options:**
- **Option A (Consumer-side):** Back-office/Telegram bot shows "Processing..." while waiting
- **Option B (AI Hub streaming):** Use `--stream-partial-output` with `stream-json` format

**Implementation Notes:**
- cursor-agent supports: `--output-format stream-json --stream-partial-output`
- This streams partial output as individual text deltas
- Requires AI Hub to use `StreamingResponse` and consumers to handle SSE

### 2. Session/Caching with --resume

**Goal:** Maintain conversation context without re-initializing each message

**cursor-agent flag:** `--resume [chatId]`

**Proposed Flow:**
1. Telegram `/start` command creates new session (generate UUID)
2. Store `chatId` in `telegram_sessions` table
3. Subsequent messages use: `cursor-agent -p "msg" --resume <chatId> --model sonnet-4.5 --approve-mcps --force`
4. Session expires with Telegram session (7 days) or `/logout`

**Database Changes:**
- Add `cursor_chat_id` column to `telegram_sessions` table

**AI Hub Changes:**
- Accept optional `session_id` parameter in request body
- Pass to cursor-agent via `--resume` flag

**Example Request:**
```json
{
  "message": "what are bullish stocks today?",
  "session_id": "abc123-uuid"
}
```

**Example Command:**
```bash
cursor-agent -p "what are bullish stocks today?" --resume abc123-uuid --model sonnet-4.5 --approve-mcps --force
```

**Benefits:**
- Faster responses (no re-initialization)
- Conversation context maintained
- More natural chat experience

## Implementation Order

1. Progress indicator (simpler, immediate UX win)
2. Session management (more complex, bigger impact)

## Files to Modify

### Progress Indicator (Option B - Streaming)
- `services/ai/gateway/` - Add streaming endpoint
- `services/social-media/telegram-2.0/src/services/gateway-client.ts` - Add streaming support
- `services/social-media/telegram-2.0/src/composers/messages.ts` - Handle streaming response

### Session Management
- `services/ai/gateway/` - Add `session_id` / `--resume` flag support
- `services/social-media/telegram-2.0/src/composers/start.ts` - Generate session on `/start`
- Database migration for `cursor_chat_id` column

## References

- cursor-agent help: `cursor-agent --help`
- Supported flags: `--resume [chatId]`, `--stream-partial-output`, `--output-format stream-json`
- Current endpoint: `/cli/telegram-agent-test/cursor/sonnet-4.5`
