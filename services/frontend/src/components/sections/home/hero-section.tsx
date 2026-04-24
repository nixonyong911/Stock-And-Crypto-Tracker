"use client";

import { Link } from "@/lib/i18n/routing";

function OrbitTiles() {
  return (
    <div className="hero-tiles">
      <div className="orbit-tile t1 up"><span className="t">NVDA</span><span className="p">+4.2%</span></div>
      <div className="orbit-tile t2 dn"><span className="t">BTC</span><span className="p">−0.8%</span></div>
      <div className="orbit-tile t3 up"><span className="t">AAPL</span><span className="p">+1.1%</span></div>
      <div className="orbit-tile t4 up"><span className="t">ETH</span><span className="p">+6.4%</span></div>
    </div>
  );
}

function InsightFloat() {
  return (
    <div className="insight-float">
      <div className="ifh">
        <span className="lbl">Context card</span>
        <span className="chip">GROUNDED</span>
      </div>
      <div className="ift">Why NVDA moved 4.2% today</div>
      <div className="ifb">
        Momentum continuation on data-center strength; analyst outlook revised upward.
        Not just a price alert — what changed, why, and what to watch next.
      </div>
    </div>
  );
}

export function NewHeroSection() {
  return (
    <header className="sct-hero">
      <div className="wrap hero-grid">
        <div className="hero-copy reveal in">
          <span className="eyebrow">Built for busy investors</span>
          <h1>
            Stay on top
            <br />
            <em>without staring at charts.</em>
          </h1>
          <p className="hero-sub">
            Get one calm Telegram briefing for the stocks and crypto you follow
            — instead of refreshing CNBC, Discord, and five dashboards before
            coffee.
          </p>
          <div className="hero-cta">
            <Link href="/pricing" className="sct-btn">
              Start Free <span style={{ opacity: 0.6, marginLeft: 2 }}>→</span>
            </Link>
            <a href="#proof" className="sct-btn sct-btn-ghost">
              See a real briefing
            </a>
          </div>
          <div className="hero-micro">
            <span><span className="check">✓</span> Free while you set it up</span>
            <span className="dot" />
            <span><span className="check">✓</span> No credit card</span>
            <span className="dot" />
            <span><span className="check">✓</span> Works in 60 seconds</span>
          </div>
        </div>

        <div className="hero-visual" data-variant="orbit">
          <div className="hero-backdrop" />
          <div className="hero-grid-bg" />
          <InsightFloat />
          <OrbitTiles />
        </div>
      </div>
    </header>
  );
}
