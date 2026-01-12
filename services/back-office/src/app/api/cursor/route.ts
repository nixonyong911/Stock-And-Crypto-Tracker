const AI_HUB_URL = process.env.AI_HUB_URL || "http://ai-hub2:8080";
const AI_HUB_API_KEY = process.env.AI_HUB_API_KEY || "";

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
    if (AI_HUB_API_KEY) {
      headers["X-API-Key"] = AI_HUB_API_KEY;
    }

    const response = await fetch(
      `${AI_HUB_URL}/cli/stock-tracker/cursor/opus-4.5`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ message }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return new Response(
        JSON.stringify({ error: `AI Hub error: ${error}` }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const text = await response.text();
    return new Response(text, {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("Cursor API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to connect to AI Hub" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

