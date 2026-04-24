"use client";

import { useState, useRef, useLayoutEffect } from "react";
import { Link } from "@/lib/i18n/routing";

export function NewPricingSection() {
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const isAnnual = cycle === "annual";
  const proPrice = isAnnual ? "167.99" : "19.99";
  const proPer = isAnnual ? "/year" : "/month";

  const mRef = useRef<HTMLButtonElement>(null);
  const aRef = useRef<HTMLButtonElement>(null);
  const [thumb, setThumb] = useState({ left: 4, width: 0 });

  useLayoutEffect(() => {
    const el = isAnnual ? aRef.current : mRef.current;
    if (!el) return;
    setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [isAnnual]);

  return (
    <section
      id="pricing"
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
          style={{ alignItems: "center", textAlign: "center", margin: "0 auto 32px" }}
        >
          <span className="eyebrow">Pricing</span>
          <h2 style={{ textWrap: "balance" }}>Simple pricing. No lock-in.</h2>
          <p style={{ margin: "0 auto" }}>
            Start free. Upgrade when the briefings have earned your trust.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="reveal" style={{ display: "flex", justifyContent: "center" }}>
          <div className="billing-toggle" role="tablist">
            <div className="bt-thumb" style={{ left: thumb.left, width: thumb.width }} />
            <button ref={mRef} data-on={!isAnnual ? "1" : "0"} onClick={() => setCycle("monthly")}>
              Monthly
            </button>
            <button ref={aRef} data-on={isAnnual ? "1" : "0"} onClick={() => setCycle("annual")}>
              Annual <span className="save-chip">Save 30%</span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="price-grid reveal" style={{ margin: "0 auto" }}>
          {/* Free */}
          <div className="price-card">
            <div>
              <div className="price-name">Free</div>
              <p className="price-desc" style={{ marginTop: 6 }}>
                Get a feel for SCT — set it up and read a week of briefings.
              </p>
            </div>
            <div className="price-amt">
              <span className="cur">$</span>
              <span className="amt">0</span>
            </div>
            <ul className="price-list">
              <li><span className="c">✓</span>Stock coverage</li>
              <li><span className="c">✓</span>Delayed alerts</li>
              <li><span className="c">✓</span>Educational insights</li>
              <li><span className="c">✓</span>Telegram access</li>
            </ul>
            <div className="btn-pair">
              <Link href="/pricing" className="sct-btn sct-btn-ghost" style={{ justifyContent: "center" }}>
                <span style={{ opacity: 0.7 }}>✈</span> Start Free
              </Link>
            </div>
          </div>

          {/* Pro */}
          <div className="price-card pro">
            <div>
              <div className="price-name">Pro</div>
              <p className="price-desc" style={{ marginTop: 6 }}>
                Full coverage, signals, and priority processing.
              </p>
            </div>
            <div className="price-amt">
              <span className="cur">$</span>
              <span className="amt">{proPrice}</span>
              <span className="per">{proPer}</span>
            </div>
            {isAnnual && (
              <div className="price-sub">$14.00/month · Save $72/year</div>
            )}
            <div className="trial-banner">
              <b>7-day free trial</b>
              <span className="sep">·</span>
              <span>No card required</span>
            </div>
            <ul className="price-list">
              <li><span className="c">✓</span>Stocks + crypto coverage</li>
              <li><span className="c">✓</span>Signal type &amp; confidence labels</li>
              <li><span className="c">✓</span>Priority processing</li>
              <li><span className="c">✓</span>Full Telegram access</li>
            </ul>
            <div className="btn-pair">
              <Link href="/pricing" className="sct-btn" style={{ justifyContent: "center" }}>
                Start 7-Day Free Trial
              </Link>
              <Link href="/pricing" className="sct-btn sct-btn-ghost" style={{ justifyContent: "center" }}>
                Subscribe Now
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
