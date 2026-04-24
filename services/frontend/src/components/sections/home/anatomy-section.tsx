export function AnatomySection() {
  return (
    <section id="anatomy" className="sct-section">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">Anatomy of a briefing</span>
          <h2>Every brief, the same shape.</h2>
          <p>
            Scan it in 30 seconds. Act on it if you want to. Ignore it if
            nothing matters today — most mornings, that&apos;s the point.
          </p>
        </div>

        <div className="anatomy reveal">
          {/* Sample briefing card */}
          <div className="anatomy-card">
            <div className="ana-head">
              <div className="ana-head-left">
                <span className="bar" />
                <h4>Morning watchlist · 3 things</h4>
              </div>
              <span className="date">TUE · APR 21 · 07:30 ET</span>
            </div>

            <AnatomyLine
              ticker="AAPL"
              signal="Momentum · continuation"
              text={
                <>
                  Third straight close above the 50-day.{" "}
                  <span className="hl">Services revenue guide revised up</span>{" "}
                  at the Morgan Stanley conference yesterday — that&apos;s what&apos;s
                  carrying the tape, not the hardware cycle.
                </>
              }
              price="$212.48"
              delta="+1.4% · 5d +4.9%"
              deltaUp
              watch="Watching $215 into close."
              annot="Watchlist only"
            />

            <AnatomyLine
              ticker="BTC"
              signal="Volatility · range-bound"
              text={
                <>
                  Overnight{" "}
                  <span className="hl">3.1% wick on thinning volume</span> —
                  spot ETF flows flat for a third day. Nothing structural has
                  changed; $67k is still the line that matters.
                </>
              }
              price="$68,420"
              delta="−0.6% · 5d −2.1%"
              deltaUp={false}
              watch="Support: $67.0k."
              annot="What changed"
            />

            <AnatomyLine
              ticker="TSLA"
              signal="Event · pre-earnings"
              neutral
              text={
                <>
                  Pulling back into{" "}
                  <span className="hl">Q1 deliveries Thursday pre-open</span>.
                  Consensus 449k. You&apos;ll get a follow-up brief within 15
                  minutes of the print — no need to set an alarm.
                </>
              }
              price="$168.29"
              delta="−2.1% · 5d −6.4%"
              deltaUp={false}
              watch="Event: Apr 23, 06:30 ET."
              annot="What to watch next"
            />

            <div className="ana-footer">
              <span>3 of 14 tickers on your watchlist surfaced today</span>
              <span className="ana-reply">↵ Reply to ask anything</span>
            </div>
          </div>

          {/* Legend */}
          <ul className="ana-legend">
            <LegendItem num="01" title="Only your tickers, ranked." tag="Watchlist-first">
              3–5 names that genuinely matter today — not a dump of everything
              that moved. Most mornings, this is shorter than you expect, and
              that&apos;s the point.
            </LegendItem>
            <LegendItem num="02" title="Named signal, not just a number." tag="Typed signals">
              Momentum, pullback, volatility, earnings, sentiment shift — each
              line is tagged so you know <em>why</em> it&apos;s in the brief before
              you read the reason.
            </LegendItem>
            <LegendItem num="03" title="Plain-English reason." tag="Grounded in sources">
              What changed, why it moved, and which level or event to watch
              next. Price and delta are there if you want them — but the
              sentence is what you remember.
            </LegendItem>
            <LegendItem num="04" title="Ask in reply." tag="Telegram-native">
              Reply to the message — &ldquo;more on TSLA&rdquo;, &ldquo;chart
              BTC 4h&rdquo;, &ldquo;summarize AAPL earnings call&rdquo;. SCT
              answers inline, from the same context, no app switch.
            </LegendItem>
          </ul>
        </div>
      </div>
    </section>
  );
}

function AnatomyLine({
  ticker,
  signal,
  neutral,
  text,
  price,
  delta,
  deltaUp,
  watch,
  annot,
}: {
  ticker: string;
  signal: string;
  neutral?: boolean;
  text: React.ReactNode;
  price: string;
  delta: string;
  deltaUp: boolean;
  watch: string;
  annot: string;
}) {
  return (
    <div className="ana-line">
      <span className="ana-tk">{ticker}</span>
      <div className="ana-body">
        <span className={`ana-signal${neutral ? " neutral" : ""}`}>
          <span className="d" />
          {signal}
        </span>
        <p className="ana-text">{text}</p>
        <div className="ana-meta">
          <span>{price}</span>
          <span className={`delta${deltaUp ? "" : " dn"}`}>{delta}</span>
          <span>{watch}</span>
        </div>
      </div>
      <span className="ana-annot right">{annot}</span>
    </div>
  );
}

function LegendItem({
  num,
  title,
  tag,
  children,
}: {
  num: string;
  title: string;
  tag: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <span className="ana-num">{num}</span>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
        <span className="tag">{tag}</span>
      </div>
    </li>
  );
}
