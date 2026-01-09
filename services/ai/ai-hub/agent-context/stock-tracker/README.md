# Stock Tracker AI Agent Context

This folder contains instructions, rules, skills, and knowledge for the AI agent that powers the Telegram stock analysis bot.

## Structure

- `rules/` - Behavioral rules and response guidelines
- `skills/` - How to use available tools (MCP, analysis queries)
- `knowledge/` - Domain knowledge (candlestick patterns, market terms)

## Purpose

When cursor-agent runs from this directory, it reads these files to understand:
1. What topics it should help with (stocks, crypto, patterns)
2. How to use the MCP analysis tools
3. Financial terminology and pattern interpretations

## MCP Tools Available

The agent has access to `analysis_mcp` server with these tools:
- `analysis_get_stock` - Query stock analysis by symbol and date range
- `analysis_list_patterns` - List detected patterns for a date
- `analysis_get_bullish` - Get bullish stocks for a date
- `analysis_get_bearish` - Get bearish stocks for a date
- `analysis_get_statistics` - Get pattern statistics over N days
