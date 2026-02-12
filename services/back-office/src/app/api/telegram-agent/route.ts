const GATEWAY_URL = process.env.GATEWAY_URL || "http://gateway-2.0:8080";
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY || "";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add API key if configured
    if (GATEWAY_API_KEY) {
      headers["X-API-Key"] = GATEWAY_API_KEY;
    }

    const response = await fetch(`${GATEWAY_URL}/api/v1/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message,
        user_id: "back-office",
        tier: "dev",
        channel_type: "back-office",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return new Response(
        JSON.stringify({ error: `Gateway error: ${error}` }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    return new Response(data.response ?? "", {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("Telegram Agent API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to connect to Gateway" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
