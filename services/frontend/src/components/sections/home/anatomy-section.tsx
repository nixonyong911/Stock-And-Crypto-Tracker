export function AnatomySection() {
  return (
    <section id="anatomy" className="sct-section">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">Smart digest</span>
          <h2>The brief, not the noise.</h2>
          <p>
            A structured read for every name on your watchlist — what&apos;s
            happening, what to watch, and why it matters. Delivered in Telegram,
            ready to act on.
          </p>
        </div>

        <div className="anatomy reveal">
          {/* Brief card */}
          <div className="anatomy-card">
            {/* Card header */}
            <div className="ana-card-head">
              <div className="ana-card-head-left">
                <span className="ana-tk-plain">AAPL</span>
                <span className="ana-pill-watch">
                  <span className="d" />
                  Watch zone
                </span>
              </div>
              <div className="ana-card-head-right">
                <span className="ana-status-dot" />
                <span className="ana-updated">Updated 7:32 AM ET</span>
              </div>
            </div>

            {/* Price row */}
            <div className="ana-price-row">
              <span className="ana-price-big">$270.95</span>
              <span className="ana-price-delta">
                <span aria-hidden="true">▲</span> 0.42%
              </span>
              <span className="ana-price-today">Today</span>
            </div>

            {/* What's happening */}
            <div className="ana-block">
              <span className="ana-block-label">What&apos;s happening</span>
              <p className="ana-block-text">
                Pullback into the prior breakout zone after a three-week run.
                Momentum is cooling, but the trend structure is still intact and
                buyers stepped in at yesterday&apos;s close.
              </p>
            </div>

            {/* What to watch — highlighted */}
            <div className="ana-watch-block">
              <span className="ana-block-label ana-block-label-accent">
                <span className="ana-clock-icon" aria-hidden="true">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>
                What to watch
              </span>
              <p className="ana-block-text">
                Hold above <span className="ana-lvl">256.8</span> keeps the setup
                constructive. A daily close below opens room toward{" "}
                <span className="ana-lvl">248</span>.
              </p>
            </div>

            {/* 4-column metadata */}
            <div className="ana-meta-grid">
              <div className="ana-meta-cell">
                <span className="ana-meta-label">Confidence</span>
                <span className="ana-meta-value">
                  High
                  <span className="ana-bars" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
              </div>
              <div className="ana-meta-cell">
                <span className="ana-meta-label">Horizon</span>
                <span className="ana-meta-value">Swing · 1–3w</span>
              </div>
              <div className="ana-meta-cell">
                <span className="ana-meta-label">Bias</span>
                <span className="ana-meta-value">Neutral-bull</span>
              </div>
              <div className="ana-meta-cell">
                <span className="ana-meta-label">Key level</span>
                <span className="ana-meta-value">256.8</span>
              </div>
            </div>

            {/* Context */}
            <div className="ana-block ana-block-context">
              <span className="ana-block-label">Context</span>
              <p className="ana-block-text">
                Stronger services guidance at last week&apos;s analyst day;
                mega-cap tech is catching a bid as rate-cut odds firm.
              </p>
              <div className="ana-tags">
                <span className="ana-tag">Earnings cadence</span>
                <span className="ana-tag">Sector rotation</span>
              </div>
            </div>

            {/* Footer */}
            <div className="ana-card-foot">
              <div className="ana-reply-cta">
                <span className="ana-reply-check" aria-hidden="true">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                Reply for more
              </div>
              <span className="ana-slash-cmd">/watchlist</span>
            </div>
          </div>

          {/* Right-side explainer */}
          <div className="ana-aside">
            <h3 className="ana-aside-title">
              Built to make the next move obvious.
            </h3>
            <p className="ana-aside-lead">
              Every brief tells you the same three things — fast, in plain
              English, before you open another tab.
            </p>

            <ul className="ana-points">
              <AnatomyPoint title="Clear stance first.">
                See whether SCT reads strength, weakness, or a wait-and-watch
                setup.
              </AnatomyPoint>
              <AnatomyPoint title="Reason, not just noise.">
                Get the main driver behind the move without opening charts,
                headlines, and five tabs.
              </AnatomyPoint>
              <AnatomyPoint title="A level to watch next.">
                Know what matters next so the brief feels actionable, not
                random.
              </AnatomyPoint>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function AnatomyPoint({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="ana-point">
      <span className="ana-point-dot" aria-hidden="true" />
      <div>
        <h4>{title}</h4>
        <p>{children}</p>
      </div>
    </li>
  );
}
