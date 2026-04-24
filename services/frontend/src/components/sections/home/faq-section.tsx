"use client";

import { useState } from "react";
import { Link } from "@/lib/i18n/routing";

const FAQ_ITEMS = [
  {
    q: "How is this different from ChatGPT or a generic AI?",
    a: "SCT already knows your watchlist and pulls from its own daily market data — indicators, earnings, news. You don't have to prompt it or paste context. It just briefs you on what changed for your tickers.",
  },
  {
    q: "Which tickers can I track?",
    a: "Any US-listed stock, ETF, or major cryptocurrency. If it has a ticker on a major exchange, you can add it.",
  },
  {
    q: "How often do briefings arrive?",
    a: "Every morning before the market opens. Pro users also get midday and close-of-day updates. You can reply to any briefing to ask follow-ups whenever you want.",
  },
  {
    q: "Does SCT access my brokerage or portfolio?",
    a: "No. SCT is completely read-only. It only knows the tickers you add — no balances, no positions, no order history, no brokerage connection.",
  },
  {
    q: "Can I ask follow-up questions?",
    a: "Yes — reply to any briefing right inside Telegram. SCT answers using the same watchlist context it used to write the brief, not a web search.",
  },
  {
    q: "What happens after the 7-day trial?",
    a: "You keep your account and watchlist. If you don't subscribe, Pro features pause and you stay on the Free plan with daily briefings.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. One tap in Telegram or your dashboard. No lock-in, no fees, no calls.",
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
