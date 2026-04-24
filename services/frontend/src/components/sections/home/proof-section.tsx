export function ProofSection() {
  return (
    <section id="proof" className="proof sct-section">
      <div className="wrap proof-grid">
        <div className="reveal">
          <div className="digest-phone">
            <TelegramDigest />
          </div>
        </div>
        <div className="reveal">
          <span className="eyebrow" style={{ marginBottom: 20, display: "inline-flex" }}>
            Inside a daily brief
          </span>
          <h2 style={{ marginBottom: 16 }}>
            More than raw alerts.
            <br />
            More grounded than a generic chatbot.
          </h2>
          <p className="lead" style={{ marginBottom: 32 }}>
            Every briefing is assembled from SCT&apos;s own database of daily
            indicators, earnings context, and market news — not a model guessing
            at the open web.
          </p>
          <div className="feature-list">
            <FeatureItem num="01" title="Only your tickers." desc="Track the 10–30 names you actually care about. SCT filters the world down to just those." />
            <FeatureItem num="02" title="Plain-English context." desc="Price moves explained against earnings, flows, and relevant news — not raw percentages without a why." />
            <FeatureItem num="03" title="Grounded in our own data." desc="SCT's AI reads from computed indicators and stored market context — less hallucination, more signal." />
            <FeatureItem num="04" title="Delivered where you are." desc="Right in Telegram. No new app to open, no inbox to dig through, no dashboard to check." />
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureItem({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="feature-item">
      <span className="feature-num">{num}</span>
      <div className="feature-body">
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
    </div>
  );
}

function TelegramDigest() {
  return (
    <>
      <div className="phone-notch" />
      <div className="phone-screen">
        <div className="tg-header">
          <span className="tg-back">‹</span>
          <div className="tg-avatar">S</div>
          <div className="tg-meta">
            <b>SCT Briefings</b>
            <span>bot · online</span>
          </div>
        </div>
        <div className="tg-chat">
          <div className="tg-date">Today · 08:02</div>
          <div className="tg-msg">
            <div className="tg-brief-title">
              <span className="bar" />
              Morning watchlist · 3 things
            </div>
            <div className="tg-row">
              <span className="tk">NVDA</span>
              <span className="note">Momentum continuation, volume +32%</span>
              <span className="pc up">+4.2%</span>
            </div>
            <div className="tg-row">
              <span className="tk">BTC</span>
              <span className="note">Volatility spike, watch $67k level</span>
              <span className="pc dn">−0.8%</span>
            </div>
            <div className="tg-row">
              <span className="tk">TSLA</span>
              <span className="note">Pullback signal, outlook softening</span>
              <span className="pc up">+1.1%</span>
            </div>
            <div className="tg-foot">
              <span>3/12 on watchlist</span>
              <span>08:02</span>
            </div>
          </div>
          <div className="tg-msg">
            <div className="tg-brief-title">
              <span className="bar" />
              Heads-up
            </div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--ink-2)" }}>
              <b style={{ color: "var(--ink)" }}>TSLA</b> delivery numbers drop
              tomorrow before open. Last quarter missed by 2.3%. I&apos;ll brief you
              within 15 min of release — ask me anything in reply.
            </p>
            <div className="tg-foot">
              <span>scheduled</span>
              <span>08:02</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
