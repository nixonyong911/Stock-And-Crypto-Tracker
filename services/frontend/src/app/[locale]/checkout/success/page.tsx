"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const t = useTranslations("checkout");

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    
    if (!sessionId) {
      setStatus("error");
      setMessage(t("noSessionId"));
      return;
    }

    // Verify the checkout session and determine redirect
    async function verifyAndRedirect() {
      try {
        const response = await fetch(`/api/stripe/verify-session?session_id=${sessionId}`);
        const data = await response.json();

        if (!response.ok) {
          setStatus("error");
          setMessage(data.error || t("verifyFailed"));
          return;
        }

        setStatus("success");
        setMessage(t("paymentSuccessUpdating"));

        // Refresh the user's tier cache to ensure dashboard shows Pro
        try {
          await fetch("/api/user/refresh-tier", { method: "POST" });
          console.log("Tier cache refreshed successfully");
        } catch (refreshError) {
          console.error("Failed to refresh tier cache:", refreshError);
          // Continue anyway - webhook should have updated it
        }

        setMessage(t("redirecting"));

        // Determine redirect based on source
        const source = data.client_reference_id?.split("_")[0] || "web";
        
        setTimeout(() => {
          if (source === "telegram") {
            // Redirect back to Telegram bot
            window.location.href = "https://t.me/StockAndCryptoAdvisorBot?start=payment_success";
          } else {
            // Redirect to dashboard
            router.push("/dashboard?subscription=success");
          }
        }, 1500);
      } catch (error) {
        console.error("Error verifying session:", error);
        setStatus("error");
        setMessage(t("verifyError"));
      }
    }

    verifyAndRedirect();
  }, [searchParams, router, t]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto max-w-md text-center">
        {status === "loading" && (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <h1 className="mt-4 text-2xl font-semibold">{t("processing")}</h1>
            <p className="mt-2 text-muted-foreground">{t("pleaseWait")}</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <h1 className="mt-4 text-2xl font-semibold text-green-600">{t("successTitle")}</h1>
            <p className="mt-2 text-muted-foreground">{message}</p>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("proActive")}
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-4 text-2xl font-semibold text-red-600">{t("failedTitle")}</h1>
            <p className="mt-2 text-muted-foreground">{message}</p>
            <button
              onClick={() => router.push("/pricing")}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
            >
              {t("returnToPricing")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
