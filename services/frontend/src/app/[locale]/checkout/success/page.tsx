"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    
    if (!sessionId) {
      setStatus("error");
      setMessage("No session ID provided");
      return;
    }

    // Verify the checkout session and determine redirect
    async function verifyAndRedirect() {
      try {
        const response = await fetch(`/api/stripe/verify-session?session_id=${sessionId}`);
        const data = await response.json();

        if (!response.ok) {
          setStatus("error");
          setMessage(data.error || "Failed to verify payment");
          return;
        }

        setStatus("success");
        setMessage("Payment successful! Updating your account...");

        // Refresh the user's tier cache to ensure dashboard shows Pro
        try {
          await fetch("/api/user/refresh-tier", { method: "POST" });
          console.log("Tier cache refreshed successfully");
        } catch (refreshError) {
          console.error("Failed to refresh tier cache:", refreshError);
          // Continue anyway - webhook should have updated it
        }

        setMessage("Redirecting to your dashboard...");

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
        setMessage("An error occurred while verifying your payment");
      }
    }

    verifyAndRedirect();
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto max-w-md text-center">
        {status === "loading" && (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <h1 className="mt-4 text-2xl font-semibold">Processing your payment...</h1>
            <p className="mt-2 text-muted-foreground">Please wait while we verify your subscription.</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <h1 className="mt-4 text-2xl font-semibold text-green-600">Payment Successful!</h1>
            <p className="mt-2 text-muted-foreground">{message}</p>
            <p className="mt-4 text-sm text-muted-foreground">
              Your Pro subscription is now active. Enjoy full access to all features!
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-4 text-2xl font-semibold text-red-600">Payment Verification Failed</h1>
            <p className="mt-2 text-muted-foreground">{message}</p>
            <button
              onClick={() => router.push("/pricing")}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
            >
              Return to Pricing
            </button>
          </>
        )}
      </div>
    </div>
  );
}
