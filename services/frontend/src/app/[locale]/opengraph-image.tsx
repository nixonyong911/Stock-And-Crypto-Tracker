import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Stock And Crypto Tracker - Daily Briefing for Your Watchlist";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "60px 80px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #e0e0df 0%, #999696 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              fontWeight: 800,
              color: "#0a0a0a",
            }}
          >
            ST
          </div>
          <span
            style={{
              fontSize: "28px",
              fontWeight: 600,
              color: "#e0e0df",
              letterSpacing: "-0.5px",
            }}
          >
            Stock And Crypto Tracker
          </span>
        </div>

        <div
          style={{
            fontSize: "52px",
            fontWeight: 800,
            color: "#ffffff",
            textAlign: "center",
            lineHeight: 1.2,
            letterSpacing: "-1px",
            marginBottom: "24px",
          }}
        >
          Your daily market briefing.
          <br />
          One place for you.
        </div>

        <div
          style={{
            fontSize: "22px",
            color: "#a0a0a0",
            textAlign: "center",
            maxWidth: "700px",
            lineHeight: 1.5,
          }}
        >
          Personalized watchlist briefings with curated context and plain-English
          updates. Delivered on Telegram.
        </div>

        <div
          style={{
            display: "flex",
            gap: "24px",
            marginTop: "40px",
          }}
        >
          {["Stocks", "Crypto", "AI Analysis", "Telegram"].map((tag) => (
            <div
              key={tag}
              style={{
                padding: "8px 20px",
                borderRadius: "100px",
                border: "1px solid #333",
                color: "#d0d0d0",
                fontSize: "16px",
              }}
            >
              {tag}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
