"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

import { ChannelPairingCard } from "@/components/pairing/channel-pairing-card";
import Link from "next/link";
import {
  Copy,
  Check,
  Users,
  Share2,
  Loader2,
  ExternalLink,
  Gift,
} from "lucide-react";

const TELEGRAM_BOT_USERNAME = "StockAndCryptoAdvisorBot";

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
  phoneVerified: boolean;
}

interface AffiliateStatus {
  isMember: boolean;
  affiliateCode?: string;
  stats?: { totalReferrals: number };
}

interface ReferralInfo {
  hasReferral: boolean;
  code?: string;
}

interface Props {
  clerkUser: ClerkUser;
  dbUser: DbUser | null;
}

export function DashboardContent({ clerkUser, dbUser }: Props) {
  const t = useTranslations("dashboard");
  const { openUserProfile } = useClerk();

  const [affiliateStatus, setAffiliateStatus] = useState<AffiliateStatus | null>(null);
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [applyingReferral, setApplyingReferral] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referralSuccess, setReferralSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [affError, setAffError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/affiliate/status")
      .then((res) => res.json())
      .then((data) => {
        setAffiliateStatus(data);
        if (data.referredBy) {
          setReferralInfo({ hasReferral: true, code: data.referredBy });
        }
      })
      .catch(() => setAffiliateStatus({ isMember: false }));

    fetch("/api/affiliate/referral-status")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.hasReferral) setReferralInfo(data);
      })
      .catch(() => {});
  }, []);

  const handleJoinAffiliate = async () => {
    setIsJoining(true);
    setAffError(null);
    try {
      const res = await fetch("/api/affiliate/join", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to join");
      }
      const statusRes = await fetch("/api/affiliate/status");
      setAffiliateStatus(await statusRes.json());
    } catch (e) {
      setAffError(e instanceof Error ? e.message : "Failed to join");
    } finally {
      setIsJoining(false);
    }
  };

  const handleApplyReferral = async () => {
    if (!referralCode.trim()) return;
    setApplyingReferral(true);
    setReferralError(null);
    setReferralSuccess(false);
    try {
      const res = await fetch("/api/affiliate/apply-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: referralCode.trim() }),
      });
      const data = await res.json();
      if (data.valid) {
        setReferralSuccess(true);
        setReferralInfo({ hasReferral: true, code: referralCode.trim().toUpperCase() });
      } else {
        const errorMap: Record<string, string> = {
          self_referral: t("affiliate.errorSelfReferral"),
          already_referred: t("affiliate.errorAlreadyReferred"),
          invalid_code: t("affiliate.errorInvalidCode"),
        };
        setReferralError(errorMap[data.error] || t("affiliate.errorGeneric"));
      }
    } catch {
      setReferralError(t("affiliate.errorGeneric"));
    } finally {
      setApplyingReferral(false);
    }
  };

  const handleCopyCode = () => {
    if (!affiliateStatus?.affiliateCode) return;
    navigator.clipboard.writeText(affiliateStatus.affiliateCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    clerkUser.email?.split("@")[0] ||
    "User";

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("welcome", { name: displayName })}</p>
        </div>
        <UserButton afterSignOutUrl="/" />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Account Card */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("account")}</CardTitle>
              <Badge
                variant={dbUser?.tier !== "free" ? "default" : "secondary"}
              >
                {(dbUser?.tier ?? "free").charAt(0).toUpperCase() +
                  (dbUser?.tier ?? "free").slice(1)}
              </Badge>
            </div>
            <CardDescription>{t("accountInfo")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">{t("name")}</p>
              <p className="font-medium">{displayName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("email")}</p>
              <p className="font-medium">{clerkUser.email}</p>
            </div>
            <div className="mt-auto pt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => openUserProfile()}
              >
                {t("manageAccount")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Card */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>{t("subscription")}</CardTitle>
            <CardDescription>{t("managePlan")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            {dbUser?.tier === "pro" ? (
              <div className="flex flex-1 flex-col">
                <p className="text-sm">
                  {t("onPlan", { plan: "Pro" })}
                </p>
                <div className="mt-auto">
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/dashboard/billing">
                      {t("manageSubscription")}
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col">
                <p className="text-sm text-muted-foreground">
                  {t("upgradeDescription")}
                </p>
                <div className="mt-auto pt-4">
                  <Button className="w-full" asChild>
                    <a href="/pricing">{t("upgradeToPro")}</a>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Telegram Pairing Card (reusable) */}
        <ChannelPairingCard isPaired={dbUser?.telegramLinked ?? false} />

        {/* Affiliate Program Card */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("affiliate.title")}</CardTitle>
              <Link href="/affiliate" className="text-xs text-primary hover:underline flex items-center gap-1">
                {t("affiliate.viewDetails")}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <CardDescription>{t("affiliate.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            {/* Section 1: Enter referral code (as a referred user) */}
            {dbUser?.telegramLinked && dbUser?.phoneVerified && (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Gift className="h-4 w-4 text-primary" />
                  {t("affiliate.referralSection")}
                </p>
                {referralInfo?.hasReferral ? (
                  <p className="text-sm text-muted-foreground">
                    {t("affiliate.referredBy")}: <span className="font-mono font-semibold">{referralInfo.code}</span>
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder={t("affiliate.enterCode")}
                        value={referralCode}
                        onChange={(e) => {
                          setReferralCode(e.target.value.toUpperCase());
                          setReferralError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleApplyReferral();
                        }}
                        maxLength={8}
                        className="font-mono uppercase text-sm"
                        disabled={applyingReferral || referralSuccess}
                      />
                      <Button
                        size="sm"
                        onClick={handleApplyReferral}
                        disabled={!referralCode.trim() || applyingReferral || referralSuccess}
                      >
                        {applyingReferral ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          t("affiliate.applyCode")
                        )}
                      </Button>
                    </div>
                    {referralError && (
                      <p className="text-xs text-destructive">{referralError}</p>
                    )}
                    {referralSuccess && (
                      <p className="text-xs text-emerald-600">{t("affiliate.applied")}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {dbUser?.telegramLinked && dbUser?.phoneVerified && (
              <Separator />
            )}

            {/* Section 2: Your affiliate code (as a promoter) */}
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Share2 className="h-4 w-4 text-primary" />
                {t("affiliate.affiliateSection")}
              </p>

              {!dbUser?.telegramLinked ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{t("affiliate.linkTelegramFirst")}</p>
                  <Button size="sm" variant="outline" className="w-full" asChild>
                    <Link href="/get-started">{t("affiliate.linkTelegram")}</Link>
                  </Button>
                </div>
              ) : !dbUser?.phoneVerified ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{t("affiliate.verifyPhoneFirst")}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      window.open(
                        `https://t.me/${TELEGRAM_BOT_USERNAME}?start=verify_phone`,
                        "_blank"
                      )
                    }
                  >
                    {t("affiliate.verifyPhone")}
                  </Button>
                </div>
              ) : affiliateStatus?.isMember ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-1.5 bg-muted rounded-md font-mono text-sm font-semibold text-center">
                      {affiliateStatus.affiliateCode}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyCode}
                    >
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {t("affiliate.totalReferrals")}: {affiliateStatus.stats?.totalReferrals ?? 0}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{t("affiliate.joinDescription")}</p>
                  {affError && <p className="text-xs text-destructive">{affError}</p>}
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={handleJoinAffiliate}
                    disabled={isJoining}
                  >
                    {isJoining ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        {t("affiliate.joining")}
                      </>
                    ) : (
                      t("affiliate.joinButton")
                    )}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
