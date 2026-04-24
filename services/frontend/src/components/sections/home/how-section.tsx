export function NewHowItWorksSection() {
  return (
    <section id="how" className="sct-section" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">From signup to first briefing</span>
          <h2>60 seconds to your first useful setup.</h2>
          <p>No onboarding maze. No learning curve. You&apos;ll know quickly if it fits.</p>
        </div>
        <div className="how-grid reveal">
          <Step n="01" title="Sign up free." desc="Email only. No card, no quiz, no setup wizard." />
          <Step n="02" title="Link Telegram." desc="One tap — SCT opens a private chat with you." />
          <Step n="03" title="Add the tickers you care about." desc="Stocks, crypto, ETFs — type them in and you're done." />
          <Step n="04" title="Wake up to your first real briefing." desc="Tomorrow morning: a short, plain-English summary of what changed on your watchlist overnight." />
          <Step n="05" title="Ask a follow-up, right there." desc="Reply to any briefing in Telegram — no context-switching, no new tab." />
        </div>
        <div className="how-payoff reveal" style={{ textAlign: "center", marginTop: 32 }}>
          <p style={{ maxWidth: 520, margin: "0 auto", opacity: 0.75, fontSize: "0.95rem" }}>
            Most people know within two or three briefings whether SCT fits their routine. That&apos;s the point — try it, see if it clicks.
          </p>
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
