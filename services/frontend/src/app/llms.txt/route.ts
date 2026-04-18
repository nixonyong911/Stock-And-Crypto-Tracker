import { NextResponse } from "next/server";

const content = `# Stock And Crypto Tracker

> Personalized daily market briefings for your stock and crypto watchlist, in plain English, delivered on Telegram.

Stock And Crypto Tracker is a SaaS product that monitors stocks, ETFs, and cryptocurrencies for individual investors. Users add their tickers to a watchlist and receive concise, AI-curated briefings covering what happened, what to watch, horizon, confidence, and risk—explained without jargon. Updates are delivered directly to the user's Telegram account.

## Key pages

- Homepage: https://stockandcryptotracker.com/en
- Pricing: https://stockandcryptotracker.com/en/pricing
- FAQ: https://stockandcryptotracker.com/en/faq
- Smart Digest feature: https://stockandcryptotracker.com/en/smart-digest
- Technical indicators: https://stockandcryptotracker.com/en/indicators
- Bot documentation: https://stockandcryptotracker.com/en/docs
- Blog: https://stockandcryptotracker.com/en/blog
- Ticker analysis (example): https://stockandcryptotracker.com/en/ticker/AAPL
- About: https://stockandcryptotracker.com/en/about
- Contact: https://stockandcryptotracker.com/en/contact

## Pricing

- Free plan: $0/month — stock coverage, delayed alerts, educational insights, Telegram access.
- Pro plan: $19.99/month — stocks + crypto, signal type and confidence labels, priority processing, full Telegram access. Includes a 7-day free trial (no card required).
- Annual plan available at ~30% discount.

## How it works

1. Add your watchlist — tell us which stocks and crypto you follow.
2. We watch the market for you — price action, setups, and narrative are tracked automatically.
3. You get a short, clear update — what's happening, what to watch, horizon, confidence, risk.
4. It shows up in Telegram — no extra app, just open Telegram.

## Contact

- Telegram bot: https://t.me/StockAndCryptoAdvisorBot
- Email: contact@stockandcryptotracker.com
- Website: https://stockandcryptotracker.com

## Optional

- Full documentation: https://stockandcryptotracker.com/llms-full.txt
`;

export async function GET() {
  return new NextResponse(content.trim(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
