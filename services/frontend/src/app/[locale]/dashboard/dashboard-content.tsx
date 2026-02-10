"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { UserButton, useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Link2,
  Check,
  Copy,
  Loader2,
  Unlink,
  RefreshCw,
} from "lucide-react";

interface ClerkUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | undefined;
  imageUrl: string;
}

interface DbUser {
  id: number;
  tier: "free" | "pro" | "max" | "dev";
  telegramLinked: boolean;
}

interface Props {
  clerkUser: ClerkUser;
  dbUser: DbUser | null;
}

export function DashboardContent({ clerkUser, dbUser }: Props) {
  const { openUserProfile } = useClerk();
  const [linkState, setLinkState] = useState<
    "idle" | "loading" | "code_ready" | "paired" | "error"
  >(dbUser?.telegramLinked ? "paired" : "idle");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
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
        // Code expired
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

  const handleManageSubscription = useCallback(async () => {
    setBillingLoading(true);
    try {
      const response = await fetch("/api/stripe/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });

      if (!response.ok) {
        throw new Error("Failed to create portal session");
      }

      const data = await response.json();
      window.location.href = data.url;
    } catch (error) {
      console.error("Error opening billing portal:", error);
      setBillingLoading(false);
    }
  }, []);

  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    clerkUser.email?.split("@")[0] ||
    "User";

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

      // Start polling for completion
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {displayName}!</p>
        </div>
        <UserButton afterSignOutUrl="/" />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Account Card */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Account</CardTitle>
              <Badge
                variant={dbUser?.tier !== "free" ? "default" : "secondary"}
              >
                {(dbUser?.tier ?? "free").charAt(0).toUpperCase() +
                  (dbUser?.tier ?? "free").slice(1)}
              </Badge>
            </div>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{displayName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{clerkUser.email}</p>
            </div>
            <div className="mt-auto pt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => openUserProfile()}
              >
                Manage Account
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Card */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>Manage your plan</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            {dbUser?.tier === "pro" ? (
              <div className="flex flex-1 flex-col">
                <p className="text-sm">
                  You&apos;re on the <strong>Pro</strong> plan.
                </p>
                <div className="mt-auto">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleManageSubscription}
                    disabled={billingLoading}
                  >
                    {billingLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      "Manage Subscription"
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col">
                <p className="text-sm text-muted-foreground">
                  Upgrade to Pro for unlimited analysis and real-time alerts.
                </p>
                <div className="mt-auto pt-4">
                  <Button className="w-full" asChild>
                    <a href="/pricing">Upgrade to Pro</a>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Telegram Pairing Card */}
        <Card className="flex flex-col">
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
              </div>
            ) : linkState === "code_ready" && pairingCode ? (
              <div className="flex flex-1 flex-col space-y-3">
                <p className="text-sm text-muted-foreground">
                  Send this command to{" "}
                  <strong>@StockAndCryptoAdvisorBot</strong> on Telegram:
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
      </div>
    </div>
  );
}
