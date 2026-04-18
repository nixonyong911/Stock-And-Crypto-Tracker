import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  try {
    return new ImageResponse(
      (
        <div
          style={{
            width: "512px",
            height: "512px",
            background: "#0a0a0a",
            borderRadius: "96px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div
            style={{
              fontSize: "200px",
              fontWeight: 800,
              color: "#e0e0df",
              letterSpacing: "-8px",
            }}
          >
            ST
          </div>
        </div>
      ),
      { width: 512, height: 512 }
    );
  } catch {
    return NextResponse.json({ error: "Failed to generate logo" }, { status: 500 });
  }
}
