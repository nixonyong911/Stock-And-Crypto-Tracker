"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AgentType = "claude" | "cursor" | "telegram-agent" | "telegram-agent-test";

interface HistoryEntry {
  id: number;
  agent: AgentType;
  duration: number;
  timestamp: Date;
}

const AGENT_DISPLAY_NAMES: Record<AgentType, string> = {
  claude: "Claude (Opus 4.5)",
  cursor: "Cursor (Opus 4.5)",
  "telegram-agent": "Telegram Agent (Sonnet 4.5)",
  "telegram-agent-test": "Telegram Agent Test (Sonnet 4.5)",
};

export default function CliTestingPage() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentType | null>(null);
  const [lastUsedAgent, setLastUsedAgent] = useState<AgentType | null>(null);

  // Stopwatch state
  const [elapsedTime, setElapsedTime] = useState(0);
  const [finalTime, setFinalTime] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const historyIdRef = useRef(0);

  // Timer effect - automatically tracks any request
  useEffect(() => {
    if (isLoading) {
      setElapsedTime(0);
      setFinalTime(null);
      const start = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedTime(Date.now() - start);
      }, 100);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      setFinalTime(elapsedTime);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isLoading]);

  // Format time helper
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const milliseconds = Math.floor((ms % 1000) / 100);
    return `${seconds}.${milliseconds}s`;
  };

  const sendToAgent = async (agent: AgentType) => {
    if (!message.trim()) return;

    setIsLoading(true);
    setActiveAgent(agent);
    setLastUsedAgent(agent);
    setResponse("");
    const startTime = Date.now();

    try {
      // Use relative path - browser will use correct base URL
      const res = await fetch(`/back-office/api/${agent}`, {
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
      const duration = Date.now() - startTime;
      setIsLoading(false);
      setActiveAgent(null);

      // Add to history
      historyIdRef.current += 1;
      setHistory((prev) => [
        {
          id: historyIdRef.current,
          agent,
          duration,
          timestamp: new Date(),
        },
        ...prev,
      ]);
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
              Enter your message to send to Claude, Cursor, or Telegram AI
              agents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Enter your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[150px] resize-none border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500/20"
            />
            {/* Stopwatch display */}
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-cyan-400 font-mono text-lg">
                  {formatTime(elapsedTime)}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button
                onClick={() => sendToAgent("claude")}
                disabled={isLoading || !message.trim()}
                className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold"
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
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold"
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
              <Button
                onClick={() => sendToAgent("telegram-agent")}
                disabled={isLoading || !message.trim()}
                className="bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white font-semibold"
              >
                {isLoading && activeAgent === "telegram-agent" ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing...
                  </span>
                ) : (
                  "Send to Telegram Agent (Sonnet 4.5)"
                )}
              </Button>
              <Button
                onClick={() => sendToAgent("telegram-agent-test")}
                disabled={isLoading || !message.trim()}
                className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-semibold"
              >
                {isLoading && activeAgent === "telegram-agent-test" ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing...
                  </span>
                ) : (
                  "Send to Telegram Agent Test (Sonnet 4.5)"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Response Card */}
        <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-slate-100">Response</CardTitle>
                <CardDescription className="text-slate-400">
                  Raw response from the AI agent
                </CardDescription>
              </div>
              {finalTime !== null && !isLoading && lastUsedAgent && (
                <div className="flex items-center gap-2 py-1 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <span className="text-emerald-400 text-sm">
                    {AGENT_DISPLAY_NAMES[lastUsedAgent]}
                  </span>
                  <span className="text-emerald-500/50">•</span>
                  <span className="text-emerald-400 font-mono font-semibold">
                    {formatTime(finalTime)}
                  </span>
                </div>
              )}
            </div>
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

        {/* History Table */}
        {history.length > 0 && (
          <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-slate-100">Request History</CardTitle>
              <CardDescription className="text-slate-400">
                Recent requests (resets on page refresh)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 px-3 text-slate-400 font-medium">
                        #
                      </th>
                      <th className="text-left py-2 px-3 text-slate-400 font-medium">
                        Endpoint
                      </th>
                      <th className="text-right py-2 px-3 text-slate-400 font-medium">
                        Duration
                      </th>
                      <th className="text-right py-2 px-3 text-slate-400 font-medium">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry, index) => (
                      <tr
                        key={entry.id}
                        className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="py-2 px-3 text-slate-500 font-mono">
                          {history.length - index}
                        </td>
                        <td className="py-2 px-3 text-slate-100">
                          {AGENT_DISPLAY_NAMES[entry.agent]}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-400">
                          {formatTime(entry.duration)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-400 font-mono">
                          {entry.timestamp.toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

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
                  → gateway-2.0 /api/v1/chat
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-400">
                  POST
                </span>
                <span className="text-slate-300">/back-office/api/cursor</span>
                <span className="text-slate-500">
                  → gateway-2.0 /api/v1/chat
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-violet-500/20 px-2 py-0.5 text-violet-400">
                  POST
                </span>
                <span className="text-slate-300">
                  /back-office/api/telegram-agent
                </span>
                <span className="text-slate-500">
                  → gateway-2.0 /api/v1/chat
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-pink-500/20 px-2 py-0.5 text-pink-400">
                  POST
                </span>
                <span className="text-slate-300">
                  /back-office/api/telegram-agent-test
                </span>
                <span className="text-slate-500">
                  → gateway-2.0 /api/v1/chat
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
