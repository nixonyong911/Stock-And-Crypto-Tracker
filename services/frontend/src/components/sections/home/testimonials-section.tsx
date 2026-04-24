export function NewTestimonialsSection() {
  return (
    <section id="voices" className="voices sct-section">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">From real users</span>
          <h2>One message, and I move on with my day.</h2>
          <p>People who stopped tab-hopping and started reading one briefing instead.</p>
        </div>

        <div className="voices-grid reveal">
          <div className="quote-card hero-quote">
            <div className="quote-mark">&ldquo;</div>
            <p className="quote-body">
              I used to open CNBC, Discord, and Twitter before work just to feel
              caught up. Now I read one Telegram message over coffee and I
              honestly know <em>more than I did before</em>.
            </p>
            <div className="quote-who">
              <div className="quote-avatar">MK</div>
              <div className="quote-meta">
                <b>Marcus K.</b>
                <span>HOLDS LONG-TERM · 2 YRS</span>
              </div>
            </div>
          </div>

          <QuoteCard initials="SA" name="Sarah A." role="PART-TIME INVESTOR">
            It actually knows my tickers — not just generic market stuff.
            That&apos;s the part I didn&apos;t expect.
          </QuoteCard>

          <QuoteCard initials="DR" name="Daniel R." role="NEWER INVESTOR">
            I don&apos;t feel anxious checking my portfolio anymore.
            I just read the brief and get on with my morning.
          </QuoteCard>

          <QuoteCard initials="PL" name="Priya L." role="CRYPTO + ETFS">
            I turned off all my price alerts. The morning briefing
            catches everything I actually need to know.
          </QuoteCard>

          <QuoteCard initials="JT" name="James T." role="RETAIL · 5 YRS">
            No hype, no moonshots. Just <em>what moved and why</em>.
            That&apos;s all I wanted.
          </QuoteCard>
        </div>
      </div>
    </section>
  );
}

function QuoteCard({
  initials,
  name,
  role,
  children,
}: {
  initials: string;
  name: string;
  role: string;
  children: React.ReactNode;
}) {
  return (
    <div className="quote-card">
      <div className="quote-mark">&ldquo;</div>
      <p className="quote-body">{children}</p>
      <div className="quote-who">
        <div className="quote-avatar">{initials}</div>
        <div className="quote-meta">
          <b>{name}</b>
          <span>{role}</span>
        </div>
      </div>
    </div>
  );
}
