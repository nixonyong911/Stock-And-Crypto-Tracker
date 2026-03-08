"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradientText } from "@/components/ui/gradient-text";
import {
  Users,
  Gift,
  Share2,
  Copy,
  Check,
  DollarSign,
} from "lucide-react";

interface AffiliateStatus {
  isMember: boolean;
  affiliateCode?: string;
  phoneVerified?: boolean;
  stats?: {
    totalReferrals: number;
    referralsByMonth: Record<string, number>;
  };
}

const TELEGRAM_BOT_USERNAME = "StockAndCryptoAdvisorBot";

interface AffiliateContentProps {
  user: {
    id: number;
    phoneVerified: boolean;
    telegramLinked: boolean;
  } | null;
}

export function AffiliateContent({ user }: AffiliateContentProps) {
  const t = useTranslations("affiliate");
  const locale = useLocale();
  const [affiliateStatus, setAffiliateStatus] = useState<AffiliateStatus | null>(
    null
  );
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/affiliate/status")
      .then((res) => res.json())
      .then((data) => setAffiliateStatus(data))
      .catch(() => setAffiliateStatus({ isMember: false }));
  }, [user]);

  const handleJoin = async () => {
    if (!user?.phoneVerified || isJoining) return;
    setIsJoining(true);
    setError(null);
    try {
      const res = await fetch("/api/affiliate/join", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          const statusRes = await fetch("/api/affiliate/status");
          const status = await statusRes.json();
          setAffiliateStatus(status);
          return;
        }
        throw new Error(data.error || t("error"));
      }
      const statusRes = await fetch("/api/affiliate/status");
      const status = await statusRes.json();
      setAffiliateStatus(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setIsJoining(false);
    }
  };

  const handleCopy = () => {
    if (!affiliateStatus?.affiliateCode) return;
    navigator.clipboard.writeText(affiliateStatus.affiliateCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const referralsThisMonth =
    affiliateStatus?.stats?.referralsByMonth?.[thisMonthKey] ?? 0;

  return (
    <div className="max-w-4xl mx-auto px-4">
      {/* Hero */}
      <section className="py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          <GradientText as="span">{t("hero.title")}</GradientText>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          {t("hero.subtitle")}
        </p>
      </section>

      {/* How It Works */}
      <section className="py-16">
        <h2 className="text-2xl font-semibold text-center mb-8">
          {t("howItWorks.title")}
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <Share2 className="h-10 w-10 text-primary mb-2" />
              <CardTitle>{t("howItWorks.step1.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {t("howItWorks.step1.description")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Users className="h-10 w-10 text-primary mb-2" />
              <CardTitle>{t("howItWorks.step2.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {t("howItWorks.step2.description")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Gift className="h-10 w-10 text-primary mb-2" />
              <CardTitle>{t("howItWorks.step3.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {t("howItWorks.step3.description")}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16">
        <h2 className="text-2xl font-semibold text-center mb-8">
          {t("benefits.title")}
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <DollarSign className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">
                {t("benefits.forPromoter")}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Gift className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">
                {t("benefits.forReferred")}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <h2 className="text-2xl font-semibold text-center mb-8">
          {t("faq.title")}
        </h2>
        <div className="max-w-3xl mx-auto space-y-6">
          {(["q1", "q2", "q3", "q4"] as const).map((key) => (
            <div key={key} className="border-b pb-6">
              <h3 className="mb-2 font-medium">{t(`faq.${key}.question`)}</h3>
              <p className="text-sm text-muted-foreground">
                {t(`faq.${key}.answer`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Join / Dashboard */}
      <section className="py-16">
        <h2 className="text-2xl font-semibold text-center mb-8">
          {t("join.title")}
        </h2>
        <Card className="max-w-xl mx-auto">
          <CardContent className="pt-6">
            {!user ? (
              <div className="space-y-4 text-center">
                <p className="text-muted-foreground">
                  {t("join.signInRequired")}
                </p>
                <Button asChild>
                  <Link href={`/sign-in?redirect_url=/${locale}/affiliate`}>
                    {t("join.signIn")}
                  </Link>
                </Button>
              </div>
            ) : !user.telegramLinked ? (
              <div className="space-y-4 text-center">
                <p className="text-muted-foreground">{t("join.linkTelegramRequired")}</p>
                <Button asChild variant="outline">
                  <Link href="/get-started">{t("join.linkTelegram")}</Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t("join.requirements")}
                </p>
              </div>
            ) : !user.phoneVerified ? (
              <div className="space-y-4 text-center">
                <p className="text-muted-foreground">{t("join.phoneRequired")}</p>
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `https://t.me/${TELEGRAM_BOT_USERNAME}?start=verify_phone`,
                      "_blank"
                    )
                  }
                >
                  {t("join.verifyViaTelegram")}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t("join.requirements")}
                </p>
              </div>
            ) : affiliateStatus?.isMember ? (
              <div className="space-y-6 text-center">
                <h3 className="text-lg font-medium">{t("dashboard.title")}</h3>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <code className="px-4 py-2 bg-muted rounded-md font-mono text-lg font-semibold">
                    {affiliateStatus.affiliateCode}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    disabled={copied}
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        {t("dashboard.copied")}
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" />
                        {t("dashboard.copyCode")}
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("dashboard.shareText")}
                </p>
                <div className="flex gap-4 justify-center">
                  <Badge variant="secondary" className="px-3 py-1">
                    {t("dashboard.totalReferrals")}:{" "}
                    {affiliateStatus.stats?.totalReferrals ?? 0}
                  </Badge>
                  <Badge variant="outline" className="px-3 py-1">
                    {t("dashboard.thisMonth")}: {referralsThisMonth}
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <p className="text-muted-foreground text-sm">
                  {t("join.requirements")}
                </p>
                {error && (
                  <p className="text-destructive text-sm">{error}</p>
                )}
                <Button
                  onClick={handleJoin}
                  disabled={isJoining}
                >
                  {isJoining ? t("join.joining") : t("join.joinButton")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
