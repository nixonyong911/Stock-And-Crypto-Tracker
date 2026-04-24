"use client";

import { SmartCtaLink } from "@/components/ui/smart-cta-link";

export function NewFinalCtaSection() {
  return (
    <section id="cta" className="finale">
      <div className="finale-bg" />
      <div className="wrap reveal">
        <span className="eyebrow" style={{ marginBottom: 24, display: "inline-flex" }}>
          Ready?
        </span>
        <h2>
          Less noise. Fewer tabs.
          <br />A watchlist that briefs{" "}
          <em style={{ color: "var(--ink-3)", fontStyle: "normal" }}>you.</em>
        </h2>
        <p>
          Link Telegram, add your tickers, and read your first briefing tomorrow
          morning.
        </p>
        <div className="finale-cta">
          <SmartCtaLink className="sct-btn">
            Start Free — sign up
          </SmartCtaLink>
          <a href="#proof" className="sct-btn sct-btn-ghost">
            See an example brief
          </a>
        </div>
      </div>
    </section>
  );
}
