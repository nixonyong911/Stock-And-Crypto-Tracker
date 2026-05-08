export function AnatomySection() {
  return (
    <section id="anatomy" className="sct-section">
      <div className="wrap">
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

            {/* Confidence (single-line meta band) */}
            <div className="ana-meta-line">
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
              <AnatomyPoint num="03" title="A level to watch next.">
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
