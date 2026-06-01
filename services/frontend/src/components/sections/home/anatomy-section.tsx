export function AnatomySection() {
  return (
    <section id="anatomy" className="sct-section">
      <div className="wrap">
        <div className="anatomy reveal">
          {/* Brief card */}
          <div className="anatomy-card">
            {/* Eyebrow bar: Smart Digest left, Confidence right */}
            <div className="ana-eyebrow-bar">
              <span className="ana-eyebrow-label ana-eyebrow-brand">Smart Digest</span>
              <span className="ana-conf">
                <span className="ana-bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="ana-conf-value">High</span>
              </span>
            </div>

            {/* Ticker row */}
            <div className="ana-ticker-row">
              <span className="ana-tk-plain">AAPL</span>
              <span className="ana-pill-watch">
                <span className="d" />
                Watch zone
              </span>
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

            {/* What to watch — analyst mix */}
            <div className="ana-watch-block">
              <div className="ana-watch-head">
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
                <span className="ana-mix-tag">Analyst mix · 41 firms</span>
              </div>
              <p className="ana-block-text ana-mix-headline">
                <span className="ana-mix-pct">58%</span> of coverage rates AAPL a
                buy — leaning bullish, but not a crowded trade.
              </p>
              <div className="ana-mix-bar" aria-hidden="true">
                <span className="ana-mix-seg ana-mix-buy" style={{ width: "58%" }} />
                <span className="ana-mix-seg ana-mix-hold" style={{ width: "30%" }} />
                <span className="ana-mix-seg ana-mix-sell" style={{ width: "12%" }} />
              </div>
              <div className="ana-mix-legend">
                <span className="ana-mix-leg">
                  <span className="ana-mix-dot ana-mix-buy" />
                  Buy 58%
                </span>
                <span className="ana-mix-leg">
                  <span className="ana-mix-dot ana-mix-hold" />
                  Hold 30%
                </span>
                <span className="ana-mix-leg">
                  <span className="ana-mix-dot ana-mix-sell" />
                  Sell 12%
                </span>
              </div>
            </div>

            {/* Context */}
            <div className="ana-block ana-block-context">
              <span className="ana-block-label">Context</span>
              <p className="ana-block-text">
                Stronger services guidance at last week&apos;s analyst day;
                mega-cap tech is catching a bid as rate-cut odds firm.
              </p>
            </div>

            {/* Footer */}
            <div className="ana-card-foot">
              <span className="ana-foot-updated">Updated May 9, 7:32 AM ET</span>
              <span className="ana-foot-cmd">/watchlist</span>
            </div>
          </div>

          {/* Right-side: title + subtitle + points */}
          <div className="ana-aside">
            <span className="eyebrow">Smart digest</span>
            <h2 className="ana-aside-title">The brief, not the noise.</h2>
            <p className="lead ana-aside-lead">
              Built to make the next move obvious — with a clear stance, the
              reason behind the move, and the one level to watch next.
            </p>

            <ul className="ana-points">
              <AnatomyPoint num="01" title="Clear stance first.">
                See whether SCT reads strength, weakness, or a wait-and-watch
                setup.
              </AnatomyPoint>
              <AnatomyPoint num="02" title="Reason, not just noise.">
                Get the main driver behind the move without opening charts,
                headlines, and five tabs.
              </AnatomyPoint>
              <AnatomyPoint num="03" title="Where the Street stands.">
                See how Wall Street&apos;s analyst coverage splits across buy,
                hold, and sell — at a glance.
              </AnatomyPoint>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function AnatomyPoint({
  num,
  title,
  children,
}: {
  num: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="ana-point">
      <span className="ana-point-num">{num}</span>
      <div>
        <h4>{title}</h4>
        <p>{children}</p>
      </div>
    </li>
  );
}
