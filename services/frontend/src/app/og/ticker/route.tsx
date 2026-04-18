import { ImageResponse } from "next/og";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") ?? "";
    const name = searchParams.get("name") ?? "";
    const signal = searchParams.get("signal") ?? "Neutral";
    const price = searchParams.get("price") ?? "";
    const confidence = searchParams.get("confidence") ?? "";
    const assetType = searchParams.get("type") ?? "stock";

    const signalColor =
      signal.toLowerCase().includes("bull")
        ? "#22c55e"
        : signal.toLowerCase().includes("bear")
          ? "#ef4444"
          : "#a0a0a0";

    return new ImageResponse(
      (
        <div
          style={{
            background:
              "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)",
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
              gap: "12px",
              marginBottom: "40px",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background:
                  "linear-gradient(135deg, #e0e0df 0%, #999696 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                fontWeight: 800,
                color: "#0a0a0a",
              }}
            >
              ST
            </div>
            <span
              style={{
                fontSize: "20px",
                fontWeight: 600,
                color: "#888",
                letterSpacing: "-0.3px",
              }}
            >
              Stock And Crypto Tracker
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "16px",
              marginBottom: "16px",
            }}
          >
            <span
              style={{
                fontSize: "72px",
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "-2px",
              }}
            >
              {symbol.toUpperCase()}
            </span>
            {name && (
              <span
                style={{ fontSize: "28px", color: "#888", fontWeight: 400 }}
              >
                {name}
              </span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: "24px",
              alignItems: "center",
              marginBottom: "32px",
            }}
          >
            <div
              style={{
                padding: "8px 24px",
                borderRadius: "100px",
                background: signalColor + "20",
                border: `2px solid ${signalColor}`,
                color: signalColor,
                fontSize: "24px",
                fontWeight: 700,
              }}
            >
              {signal}
            </div>
            {price && (
              <span
                style={{
                  fontSize: "36px",
                  fontWeight: 600,
                  color: "#e0e0df",
                }}
              >
                ${price}
              </span>
            )}
            {confidence && (
              <span style={{ fontSize: "22px", color: "#888" }}>
                {confidence}% confidence
              </span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: "16px",
              marginTop: "20px",
            }}
          >
            {[
              assetType === "crypto" ? "Crypto" : "Stock",
              "AI Signal",
              "Daily Update",
            ].map((tag) => (
              <div
                key={tag}
                style={{
                  padding: "6px 16px",
                  borderRadius: "100px",
                  border: "1px solid #333",
                  color: "#999",
                  fontSize: "14px",
                }}
              >
                {tag}
              </div>
            ))}
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}
