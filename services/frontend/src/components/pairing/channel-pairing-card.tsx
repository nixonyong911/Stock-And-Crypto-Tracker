"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Send,
  Link2,
  Check,
  Copy,
  Loader2,
  Unlink,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

const TELEGRAM_BOT_USERNAME = "StockAndCryptoAdvisorBot";

interface ChannelPairingCardProps {
  /** Whether the account is already paired */
  isPaired: boolean;
  /** Optional: show unlink button (hidden on standalone /pair page) */
  showUnlink?: boolean;
  /** Optional: className for the Card wrapper */
  className?: string;
}

export function ChannelPairingCard({
  isPaired: initialPaired,
  showUnlink = true,
  className,
}: ChannelPairingCardProps) {
  const [linkState, setLinkState] = useState<
    "idle" | "loading" | "code_ready" | "paired" | "error"
  >(initialPaired ? "paired" : "idle");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;

    const updateTimer = () => {
      const remaining = Math.max(
        0,
        Math.floor((expiresAt - Date.now()) / 1000)
      );
      setTimeLeft(remaining);

      if (remaining <= 0) {
        setPairingCode(null);
        setLinkState("idle");
        setExpiresAt(null);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [expiresAt]);

  // Poll for pairing completion
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch("/api/link-telegram");
        if (response.ok) {
          const data = await response.json();
          if (data.isLinked) {
            setLinkState("paired");
            setPairingCode(null);
            setExpiresAt(null);
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);
  }, []);

  const handleLinkTelegram = async () => {
    setLinkState("loading");

    try {
      const response = await fetch("/api/link-telegram", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create pairing code");
      }

      const data = await response.json();
      setPairingCode(data.code);
      setExpiresAt(Date.now() + data.expiresIn * 1000);
      setLinkState("code_ready");

      startPolling();
    } catch (error) {
      console.error("Error generating pairing code:", error);
      setLinkState("error");
    }
  };

  const handleUnlinkTelegram = async () => {
    setUnlinkLoading(true);

    try {
      const response = await fetch("/api/link-telegram/unlink", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to unlink");
      }

      setLinkState("idle");
    } catch (error) {
      console.error("Error unlinking Telegram:", error);
    } finally {
      setUnlinkLoading(false);
    }
  };

  const copyCode = async () => {
    if (pairingCode) {
      await navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const telegramDeepLink = pairingCode
    ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=pair_${pairingCode}`
    : null;

  return (
    <Card className={`flex flex-col ${className ?? ""}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Telegram
        </CardTitle>
        <CardDescription>
          Pair your Telegram account for AI chat
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {linkState === "paired" ? (
          <div className="flex flex-1 flex-col">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Check className="h-5 w-5" />
              <span>Telegram account paired</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Your subscription tier is synced automatically.
            </p>
            {showUnlink && (
              <div className="mt-auto pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 text-destructive hover:text-destructive"
                  onClick={handleUnlinkTelegram}
                  disabled={unlinkLoading}
                >
                  {unlinkLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Unlink className="h-4 w-4" />
                  )}
                  Unlink Telegram
                </Button>
              </div>
            )}
          </div>
        ) : linkState === "code_ready" && pairingCode ? (
          <div className="flex flex-1 flex-col space-y-3">
            <p className="text-sm text-muted-foreground">
              Send this command to{" "}
              <strong>@{TELEGRAM_BOT_USERNAME}</strong> on Telegram:
            </p>
            <div className="rounded-lg bg-muted p-4 text-center">
              <p className="mb-1 text-xs text-muted-foreground">
                Your pairing code
              </p>
              <div className="flex items-center justify-center gap-2">
                <code className="text-2xl font-bold tracking-widest">
                  {pairingCode}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={copyCode}
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <p className="text-center text-sm font-medium">
              Type: <code>/pair {pairingCode}</code>
            </p>

            {/* Deep link button — opens Telegram directly */}
            {telegramDeepLink && (
              <Button className="w-full gap-2" asChild>
                <a
                  href={telegramDeepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open in Telegram
                </a>
              </Button>
            )}

            <div className="mt-auto flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Expires in {formatTime(timeLeft)}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={handleLinkTelegram}
              >
                <RefreshCw className="h-3 w-3" />
                New code
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <p className="text-sm text-muted-foreground">
              Link your Telegram to access AI analysis via chat. Your
              subscription tier syncs automatically.
            </p>
            <div className="mt-auto pt-4">
              <Button
                onClick={handleLinkTelegram}
                disabled={linkState === "loading"}
                className="w-full gap-2"
              >
                {linkState === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating code...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4" />
                    Pair Telegram Account
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
        {linkState === "error" && (
          <p className="mt-2 text-sm text-destructive">
            Failed to generate pairing code. Please try again.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
