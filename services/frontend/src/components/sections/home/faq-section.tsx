"use client";

import { useState } from "react";
import { Link } from "@/lib/i18n/routing";

const FAQ_ITEMS = [
  {
    q: "How is this different from generic ChatGPT?",
    a: "SCT is grounded in its own market data and your specific watchlist. A generic chatbot guesses from stale web text; SCT briefs from computed daily indicators, earnings context, and recent news already cross-referenced for your tickers.",
  },
  {
    q: "Which tickers can I track?",
    a: "US stocks, ETFs, and major cryptocurrencies. If it has a widely-tracked ticker — think AAPL, NVDA, TSLA, SPY, BTC, ETH, SOL — you can add it to your watchlist.",
  },
  {
    q: "How often do briefings arrive?",
    a: "Once every morning, before market open. Pro users also get midday check-ins and a close summary. You can reply to any brief at any time to ask follow-ups.",
  },
  {
    q: "Does SCT connect to my brokerage?",
    a: "No. SCT is read-only and never touches your accounts. It sees the tickers you add and nothing else — no balances, no positions, no order history.",
  },
  {
    q: "Can I ask follow-up questions?",
    a: "Yes. Just reply to any briefing in Telegram. SCT answers from the same grounded context it used to write the brief — not a generic search.",
  },
  {
    q: "What happens after the 7-day trial?",
    a: "You keep your account either way. Pro features pause if you don't subscribe; the Free plan keeps running with a smaller watchlist and daily briefings.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No lock-in, no phone calls, no cancellation fees. One tap inside the dashboard or in Telegram.",
  },
];

export function HomeFaqSection() {
  const [open, setOpen] = useState(0);

  return (
    <section
      id="faq"
      className="sct-section"
      style={{
        background: "var(--bg-sunken)",
        borderTop: "1px solid var(--line)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div className="wrap">
        <div
          className="section-head reveal"
          style={{ margin: "0 auto 48px", alignItems: "center", textAlign: "center" }}
        >
          <span className="eyebrow">FAQ</span>
          <h2>Questions, calmly answered.</h2>
        </div>

        <div className="sct-faq reveal">
          {FAQ_ITEMS.map((it, i) => (
            <div className="faq-item" key={i} data-open={open === i ? "1" : "0"}>
              <button
                className="faq-q"
                onClick={() => setOpen(open === i ? -1 : i)}
                aria-expanded={open === i}
              >
                <span>{it.q}</span>
                <span className="faq-caret" aria-hidden="true">+</span>
              </button>
              <div className="faq-a">
                <div><p>{it.a}</p></div>
              </div>
            </div>
          ))}
        </div>

        <div className="reveal" style={{ textAlign: "center", marginTop: 32 }}>
          <Link
            href="/faq"
            className="sct-btn sct-btn-ghost sct-btn-sm"
            style={{ margin: "0 auto" }}
          >
            See all FAQs →
          </Link>
        </div>
      </div>
    </section>
  );
}
