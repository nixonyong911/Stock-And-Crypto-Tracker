export function FounderSection() {
  return (
    <section id="about" className="sct-section">
      <div className="wrap">
        <div
          className="section-head reveal"
          style={{ margin: "0 auto 48px", alignItems: "center", textAlign: "center" }}
        >
          <span className="eyebrow">Why we&apos;re building this</span>
          <h2 style={{ textWrap: "balance" }}>A note from the team.</h2>
        </div>
        <div className="founder reveal">
          <div className="founder-port" aria-hidden="true">
            SCT
          </div>
          <div className="founder-body">
            <p className="quote">
              We built SCT for the version of us that had a day job, ten tickers
              we cared about, and no time to read five newsletters before market
              open. If you&apos;ve ever closed a dozen tabs and still felt out of
              the loop — this is for you.
            </p>
            <p className="sig">— The StockAndCryptoTracker team</p>
          </div>
        </div>
      </div>
    </section>
  );
}
