export function NewHowItWorksSection() {
  return (
    <section id="how" className="sct-section" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">How it works</span>
          <h2>Sixty seconds to your first briefing.</h2>
        </div>
        <div className="how-grid reveal">
          <Step n="Step 01" title="Create an account." desc="Email only. No card, no onboarding maze." />
          <Step n="Step 02" title="Link Telegram." desc="One tap — SCT opens a private chat with you." />
          <Step n="Step 03" title="Add your watchlist." desc="Stocks, crypto, ETFs. Up to 30 tickers." />
          <Step n="Step 04" title="Read your morning brief." desc="Delivered daily, right where you already are." />
        </div>
      </div>
    </section>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="how-step">
      <span className="n">{n}</span>
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  );
}
