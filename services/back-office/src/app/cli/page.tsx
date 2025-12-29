"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function CliTestingPage() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeAgent, setActiveAgent] = useState<"claude" | "cursor" | null>(null);

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/back-office";

  const sendToAgent = async (agent: "claude" | "cursor") => {
    if (!message.trim()) return;

    setIsLoading(true);
    setActiveAgent(agent);
    setResponse("");

    try {
      const res = await fetch(`${basePath}/api/${agent}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const text = await res.text();

      if (!res.ok) {
        try {
          const error = JSON.parse(text);
          setResponse(`Error: ${error.error || "Unknown error"}`);
        } catch {
          setResponse(`Error: ${text}`);
        }
      } else {
        setResponse(text);
      }
    } catch (error) {
      setResponse(`Connection error: ${error}`);
    } finally {
      setIsLoading(false);
      setActiveAgent(null);
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-100">CLI Testing</h1>
          <p className="text-slate-400 mt-1">
            Test AI CLI endpoints directly from your browser
          </p>
        </div>

        {/* Input Card */}
        <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-slate-100">Send Message</CardTitle>
            <CardDescription className="text-slate-400">
              Enter your message to send to Claude or Cursor AI agents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Enter your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[150px] resize-none border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500/20"
            />
            <div className="flex gap-4">
              <Button
                onClick={() => sendToAgent("claude")}
                disabled={isLoading || !message.trim()}
                className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold"
              >
                {isLoading && activeAgent === "claude" ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing...
                  </span>
                ) : (
                  "Send to Claude (Opus 4.5)"
                )}
              </Button>
              <Button
                onClick={() => sendToAgent("cursor")}
                disabled={isLoading || !message.trim()}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold"
              >
                {isLoading && activeAgent === "cursor" ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing...
                  </span>
                ) : (
                  "Send to Cursor (Opus 4.5)"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Response Card */}
        <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-slate-100">Response</CardTitle>
            <CardDescription className="text-slate-400">
              Raw response from the AI agent
            </CardDescription>
          </CardHeader>
          <CardContent>
            {response ? (
              <pre className="whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950 p-4 text-sm text-slate-100 font-mono overflow-x-auto max-h-[500px] overflow-y-auto">
                {response}
              </pre>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/50 p-8 text-center text-slate-500">
                Response will appear here...
              </div>
            )}
          </CardContent>
        </Card>

        {/* Endpoints Info */}
        <Card className="border-slate-800 bg-slate-900/30">
          <CardHeader>
            <CardTitle className="text-sm text-slate-400">
              API Endpoints
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 text-sm font-mono">
              <div className="flex items-center gap-2">
                <span className="rounded bg-orange-500/20 px-2 py-0.5 text-orange-400">
                  POST
                </span>
                <span className="text-slate-300">/back-office/api/claude</span>
                <span className="text-slate-500">
                  → /cli/stock-tracker/claude/opus-4.5
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-400">
                  POST
                </span>
                <span className="text-slate-300">/back-office/api/cursor</span>
                <span className="text-slate-500">
                  → /cli/stock-tracker/cursor/opus-4.5
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

