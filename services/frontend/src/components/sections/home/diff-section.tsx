export function DiffSection() {
  return (
    <section id="diff" className="sct-section">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">The difference</span>
          <h2>Alerts buzz. SCT briefs.</h2>
          <p>
            Most tools fire a notification every time a number twitches. SCT
            waits until it actually has something useful to say — then says it
            once, clearly.
          </p>
        </div>
        <div className="reveal">
          <VsCompare />
        </div>
      </div>
    </section>
  );
}

function VsCompare() {
  return (
    <div className="vs">
      <div className="vs-card dim">
        <div className="vs-label">
          <span className="lbl-dot" />
          Raw price alert
        </div>
        <div className="vs-title">Noise, zero context.</div>
        <div className="vs-sample">
          <div className="row"><span className="tag">07:44</span><span>▲ AAPL +3% (1h)</span></div>
          <div className="row"><span className="tag">07:46</span><span>▲ AAPL +4% (1h)</span></div>
          <div className="row"><span className="tag">07:49</span><span>▼ AAPL −1% (5m)</span></div>
          <div className="row"><span className="tag">07:52</span><span>▲ AAPL +2% (5m)</span></div>
        </div>
        <ul className="vs-feat">
          <li><span className="ic no">—</span> No reason for the move</li>
          <li><span className="ic no">—</span> Fires 40× per day</li>
          <li><span className="ic no">—</span> You still open five tabs to understand it</li>
        </ul>
      </div>

      <div className="vs-divider">vs</div>

      <div className="vs-card good vs-good">
        <div className="vs-label">
          <span className="lbl-dot" />
          SCT briefing
        </div>
        <div className="vs-title">One message. Full picture.</div>
        <div className="vs-sample">
          <div className="row">
            <span className="tag" style={{ color: "var(--brand-ink)" }}>08:02</span>
            <span>
              <b style={{ color: "var(--ink)" }}>AAPL +4.2%</b> — momentum
              continuation; services outlook revised upward. Unusual volume on the
              open. Watch $215 resistance into close.
            </span>
          </div>
        </div>
        <ul className="vs-feat">
          <li><span className="ic ok">✓</span> Price move explained in one line</li>
          <li><span className="ic ok">✓</span> Earnings, news &amp; flows cross-referenced</li>
          <li><span className="ic ok">✓</span> Once at 8am. Re-check only if something changes.</li>
        </ul>
      </div>
    </div>
  );
}
