export function AnatomySection() {
  return (
    <section id="anatomy" className="sct-section">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">Anatomy of a briefing</span>
          <h2>Every brief, the same shape.</h2>
          <p>
            Built to be scanned in seconds, but useful enough to act on.
          </p>
        </div>

        <div className="anatomy reveal">
          {/* Single morning brief card */}
          <div className="anatomy-card">
            <div className="ana-head">
              <div className="ana-head-left">
                <span className="bar" />
                <h4>Morning brief · AAPL</h4>
              </div>
              <span className="date">TUE · APR 21 · 07:30 ET</span>
            </div>

            {/* Ticker + price */}
            <div className="ana-ticker-row">
              <span className="ana-tk">AAPL</span>
              <span className="ana-price">$212.48</span>
              <span className="delta">+1.4%</span>
              <span className="ana-sep">·</span>
              <span className="ana-5d">5d +4.9%</span>
            </div>

            {/* Signal tag */}
            <div className="ana-signal">
              <span className="d" />
              AAPL — Momentum Continuation
            </div>

            {/* Headline */}
            <h3 className="ana-headline">
              Services revenue outlook revised upward.
            </h3>

            {/* Narrative */}
            <p className="ana-text">
              Price is <span className="hl">holding above the recent breakout zone</span>{" "}
              while services guidance remains stronger than expected. Follow-through
              looks constructive, but watch whether volume stays supportive through
              the next session.
            </p>

            {/* 2×2 metadata grid */}
            <div className="ana-grid">
              <div className="ana-grid-cell">
                <span className="ana-grid-label">Signal</span>
                <span className="ana-grid-value">Momentum continuation</span>
              </div>
              <div className="ana-grid-cell">
                <span className="ana-grid-label">Confidence</span>
                <span className="ana-grid-value">
                  <span className="ana-dot filled" />
                  <span className="ana-dot filled" />
                  <span className="ana-dot" />
                  Medium
                </span>
              </div>
              <div className="ana-grid-cell">
                <span className="ana-grid-label">Risk</span>
                <span className="ana-grid-value">Moderate</span>
              </div>
              <div className="ana-grid-cell">
                <span className="ana-grid-label">Watch next</span>
                <span className="ana-grid-value">
                  Volume follow-through · sector reaction
                </span>
              </div>
            </div>

            {/* Reply suggestions */}
            <div className="ana-reply-section">
              <div className="ana-reply-header">
                <span className="ana-reply-icon">➤</span>
                <span className="ana-reply-label">Reply in Telegram to ask</span>
              </div>
              <div className="ana-reply-pill">What would invalidate this setup?</div>
              <div className="ana-reply-pill">How does this compare to MSFT?</div>
              <div className="ana-reply-pill">Is this still attractive after the move?</div>
            </div>
          </div>

          {/* Legend */}
          <ul className="ana-legend">
            <LegendItem num="01" title="Only your tickers.">
              You are not getting the whole market dumped on you — only the names
              you chose to follow.
            </LegendItem>
            <LegendItem num="02" title="Named signal type.">
              Each brief tells you what kind of setup SCT sees, so you are not
              guessing what the alert means.
            </LegendItem>
            <LegendItem num="03" title="Plain-English reason.">
              Instead of raw numbers, you get a short explanation of what changed
              and why it matters.
            </LegendItem>
            <LegendItem num="04" title="Ask in reply.">
              If you want more detail, just ask inside Telegram instead of opening
              another tool or dashboard.
            </LegendItem>
          </ul>
        </div>
      </div>
    </section>
  );
}

function LegendItem({
  num,
  title,
  children,
}: {
  num: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <span className="ana-num">{num}</span>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </li>
  );
}
