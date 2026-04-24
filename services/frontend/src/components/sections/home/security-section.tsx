export function SecuritySection() {
  return (
    <section id="security" className="security sct-section">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">Security &amp; privacy</span>
          <h2>Your watchlist is yours. Full stop.</h2>
          <p>
            No brokerage connections. No trading on your behalf. Just briefings
            delivered to a private chat.
          </p>
        </div>
        <div className="sec-grid reveal">
          <div className="sec-card">
            <div className="sec-ic">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4Z"/>
              </svg>
            </div>
            <h3>Read-only, always.</h3>
            <p>
              SCT never connects to your brokerage or wallet. We see the tickers
              you track — nothing else.
            </p>
          </div>
          <div className="sec-card">
            <div className="sec-ic">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h3>Private Telegram chat.</h3>
            <p>
              Briefings are delivered in a 1:1 chat. We don&apos;t post in groups,
              and nobody else sees your watchlist.
            </p>
          </div>
          <div className="sec-card">
            <div className="sec-ic">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </div>
            <h3>Delete anything, anytime.</h3>
            <p>
              Remove tickers, cancel your plan, or delete your account from
              Telegram or the dashboard. No support ticket needed.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
