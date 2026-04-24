export function NewTestimonialsSection() {
  return (
    <section id="voices" className="voices sct-section">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">What readers say</span>
          <h2>Quietly replacing five tabs and a group chat.</h2>
          <p>Early users who now get their market update from Telegram, before their first coffee.</p>
        </div>

        <div className="voices-grid reveal">
          <div className="quote-card hero-quote">
            <div className="quote-mark">&ldquo;</div>
            <p className="quote-body">
              I used to start every morning bouncing between CNBC, four Discord
              servers, and a Bloomberg terminal I don&apos;t need. Now I read one
              Telegram message and I&apos;m <em>actually more informed</em> than
              I was doing the whole ritual.
            </p>
            <div className="quote-who">
              <div className="quote-avatar">MK</div>
              <div className="quote-meta">
                <b>Marcus K.</b>
                <span>SWING TRADER · 2 YRS</span>
              </div>
            </div>
          </div>

          <QuoteCard initials="SA" name="Sarah A." role="PART-TIME INVESTOR">
            The difference from a generic AI bot is obvious — it{" "}
            <em>actually knows</em> what happened on my tickers yesterday.
          </QuoteCard>

          <QuoteCard initials="DR" name="Daniel R." role="BEGINNER · 8 MONTHS">
            First investing tool that made me feel <em>less anxious</em>, not
            more. One message, once a day.
          </QuoteCard>

          <QuoteCard initials="PL" name="Priya L." role="AMATEUR · CRYPTO + ETFS">
            I stopped setting price alerts entirely. The morning brief catches
            everything that <em>actually matters</em>.
          </QuoteCard>

          <QuoteCard initials="JT" name="James T." role="RETAIL · 5 YRS">
            Feels like a quiet analyst in my pocket. No hype, no moonshots —
            just <em>what moved and why</em>.
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
