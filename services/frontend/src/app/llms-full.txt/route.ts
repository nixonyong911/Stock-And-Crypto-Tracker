import { NextResponse } from "next/server";
import { COMMANDS } from "@/data/commands";

function buildCommandReference(): string {
  const lines: string[] = ["## Bot command reference", ""];
  for (const cmd of COMMANDS) {
    lines.push(`### ${cmd.name}`);
    lines.push(`Syntax: \`${cmd.syntax}\``);
    lines.push(cmd.description);
    if (cmd.examples.length > 0) {
      lines.push("Examples:");
      for (const ex of cmd.examples) {
        lines.push(`  - \`${ex.input}\` — ${ex.description}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

const preamble = `# Stock And Crypto Tracker — Full Reference

> Personalized daily market briefings for your stock and crypto watchlist, in plain English, delivered on Telegram.

Stock And Crypto Tracker is a SaaS product that monitors stocks, ETFs, and cryptocurrencies for individual investors. Users add their tickers to a watchlist and receive concise, AI-curated briefings covering what happened, what to watch, horizon, confidence, and risk—explained without jargon. Updates are delivered directly to the user's Telegram account.

## Product details

- Type: SaaS, Telegram bot
- Audience: Retail investors, busy professionals who follow stocks and/or crypto
- Delivery channel: Telegram (messaging app)
- Languages: English, Chinese (Simplified)
- Founded: 2025

## Key pages

- Homepage: https://stockandcryptotracker.com/en
- Pricing: https://stockandcryptotracker.com/en/pricing
- FAQ: https://stockandcryptotracker.com/en/faq
- Smart Digest feature: https://stockandcryptotracker.com/en/smart-digest
- Technical indicators: https://stockandcryptotracker.com/en/indicators
- Bot documentation: https://stockandcryptotracker.com/en/docs
- Blog: https://stockandcryptotracker.com/en/blog
- About: https://stockandcryptotracker.com/en/about
- Contact: https://stockandcryptotracker.com/en/contact

## Pricing

- Free plan: $0/month — stock coverage, delayed alerts, educational insights, Telegram access.
- Pro plan: $19.99/month — stocks + crypto, signal type and confidence labels, priority processing, full Telegram access. Includes a 7-day free trial (no card required).
- Annual plan available at approximately 30% discount.

## How it works

1. Add your watchlist — tell us which stocks and crypto you follow.
2. We watch the market for you — price action, setups, and narrative are tracked automatically.
3. You get a short, clear update — what's happening, what to watch, horizon, confidence, risk.
4. It shows up in Telegram — no extra app, just open Telegram.

## What a briefing looks like

Each briefing includes:
- Ticker and asset name
- Signal direction (Bullish / Bearish / Neutral)
- Horizon (e.g. Swing 3-6 weeks, Day trade, Long-term)
- Confidence level (Low / Medium / Medium-High / High)
- Risk level (Low / Medium / High)
- "What's happening" — plain-English summary of recent price action
- "What to watch" — upcoming catalysts, levels, or events
- "News factor" — relevant headlines driving the move
- Educational disclaimer: "Educational market analysis, not financial advice."

## Smart Digest

Smart Digest is the Pro feature that sends an AI-curated daily summary for the user's entire watchlist. Instead of individual alerts, it groups and prioritizes the most important developments so users can catch up in under two minutes.

## Technical indicators covered

The platform monitors and explains standard technical indicators including RSI, MACD, Bollinger Bands, moving averages (SMA/EMA), volume analysis, support/resistance levels, and candlestick patterns. Indicators are explained in plain English alongside each briefing when relevant.

## Frequently asked questions

Q: What is Stock And Crypto Tracker?
A: A Telegram bot that sends you personalized daily briefings for the stocks and crypto on your watchlist — plain English summaries, not raw data.

Q: How much does it cost?
A: Free plan covers stocks with delayed alerts. Pro plan is $19.99/month (7-day free trial, no card required) and adds crypto, priority processing, and Smart Digest.

Q: Do I need to install an app?
A: No. Updates are delivered via Telegram, which you likely already have. No separate app to install.

Q: Is this financial advice?
A: No. All analysis is educational. Users should apply their own risk management and make their own decisions.

Q: How do I get started?
A: Open https://t.me/StockAndCryptoAdvisorBot on Telegram, pair your account, and add your watchlist.

## Contact

- Telegram bot: https://t.me/StockAndCryptoAdvisorBot
- Email: contact@stockandcryptotracker.com
- Website: https://stockandcryptotracker.com

`;

export async function GET() {
  const commandRef = buildCommandReference();
  const full = preamble + commandRef;

  return new NextResponse(full.trim(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
