const AI_HUB_URL = process.env.AI_HUB_URL || "http://172.17.0.1:8084";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const response = await fetch(
      `${AI_HUB_URL}/cli/stock-tracker/claude/opus-4.5`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    console.error("Claude API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to connect to AI Hub" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

