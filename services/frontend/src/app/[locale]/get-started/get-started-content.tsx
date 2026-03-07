"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Send,
  Copy,
  Check,
  Loader2,
  ExternalLink,
  RefreshCw,
  ArrowRight,
} from "lucide-react";

const TELEGRAM_BOT_USERNAME = "StockAndCryptoAdvisorBot";

interface GetStartedContentProps {
  locale: string;
}

export function GetStartedContent({ locale }: GetStartedContentProps) {
  const router = useRouter();
  const t = useTranslations("getStarted");
  const [state, setState] = useState<
    "idle" | "loading" | "code_ready" | "paired" | "error"
  >("idle");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [newCodeCooldown, setNewCodeCooldown] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  useEffect(() => {
    if (!expiresAt) return;

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((expiresAt - Date.now()) / 1000)
      );
      setTimeLeft(remaining);

      if (remaining <= 0) {
        setPairingCode(null);
        setState("idle");
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

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [expiresAt]);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/link-telegram");
        if (res.ok) {
          const data = await res.json();
          if (data.isLinked) {
            setState("paired");
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
        // ignore polling errors
      }
    }, 3000);
  }, []);

  const startCooldown = useCallback(() => {
    setNewCodeCooldown(30);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setNewCodeCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) {
            clearInterval(cooldownRef.current);
            cooldownRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const generateCode = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/link-telegram", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate code");
      }
      const data = await res.json();
      setPairingCode(data.code);
      setExpiresAt(Date.now() + data.expiresIn * 1000);
      setState("code_ready");
      startPolling();
      startCooldown();
    } catch (err) {
      console.error("Pairing code error:", err);
      setState("error");
    }
  };

  const copyCode = async () => {
    if (!pairingCode) return;
    await navigator.clipboard.writeText(pairingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const deepLink = pairingCode
    ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=pair_${pairingCode}`
    : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg space-y-10 text-center">
        {/* Header */}
        <div className="space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Send className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">
            {state === "paired" ? t("allSet") : t("title")}
          </h1>
          <p className="text-lg text-muted-foreground">
            {state === "paired"
              ? t("telegramLinked")
              : t("linkTelegram")}
          </p>
        </div>

        {/* Success state */}
        {state === "paired" && (
          <div className="space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10">
              <Check className="h-10 w-10 text-green-500" />
            </div>
            <Button
              size="lg"
              className="w-full gap-2 text-base"
              onClick={() => router.push(`/${locale}/dashboard`)}
            >
              {t("goToDashboard")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Idle / Loading / Error -- show steps + generate button */}
        {(state === "idle" || state === "loading" || state === "error") && (
          <div className="space-y-8">
            {/* Steps */}
            <div className="space-y-4 text-left">
              {[t("step1"), t("step2"), t("step3")].map((text, i) => (
                <div key={i} className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <p className="pt-1 text-base font-medium">{text}</p>
                </div>
              ))}
            </div>

            <Button
              size="lg"
              className="w-full gap-2 text-base"
              onClick={generateCode}
              disabled={state === "loading"}
            >
              {state === "loading" ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {t("generating")}
                </>
              ) : (
                t("generateCode")
              )}
            </Button>

            {state === "error" && (
              <p className="text-sm text-destructive">
                {t("error")}
              </p>
            )}
          </div>
        )}

        {/* Code ready */}
        {state === "code_ready" && pairingCode && (
          <div className="space-y-6">
            <div className="rounded-xl border bg-muted/50 p-6">
              <p className="mb-2 text-sm font-medium text-muted-foreground">
                {t("pairingCode")}
              </p>
              <div className="flex items-center justify-center gap-3">
                <code className="text-4xl font-extrabold tracking-[0.3em]">
                  {pairingCode}
                </code>
                <Button variant="ghost" size="icon" onClick={copyCode}>
                  {copied ? (
                    <Check className="h-5 w-5 text-green-500" />
                  ) : (
                    <Copy className="h-5 w-5" />
                  )}
                </Button>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {t("sendToBot", { code: pairingCode })}
              </p>
            </div>

            {deepLink && (
              <Button size="lg" className="w-full gap-2 text-base" asChild>
                <a
                  href={deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-5 w-5" />
                  {t("openInTelegram")}
                </a>
              </Button>
            )}

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{t("expiresIn", { time: formatTime(timeLeft) })}</span>
              <button
                onClick={generateCode}
                disabled={newCodeCooldown > 0}
                className="inline-flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {newCodeCooldown > 0
                  ? t("newCodeCooldown", { seconds: newCodeCooldown })
                  : t("newCode")}
              </button>
            </div>
          </div>
        )}

        {/* Skip link -- always visible except on success */}
        {state !== "paired" && (
          <div className="pt-4 border-t border-border">
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => router.push(`/${locale}/dashboard`)}
            >
              {t("skipToDashboard")}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
