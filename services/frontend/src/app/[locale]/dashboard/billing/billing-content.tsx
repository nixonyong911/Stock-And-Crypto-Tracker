"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  Calendar,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Loader2,
  User,
  Settings,
} from "lucide-react";

interface Subscription {
  id: number;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  plan_type: string;
  status: string;
  interval: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  canceled_at: string | null;
  trial_start: string | null;
  trial_end: string | null;
}

interface BillingContentProps {
  user: {
    id: number;
    tier: string;
    stripe_customer_id: string | null;
    email: string;
  };
  subscription: Subscription | null;
  clerkUser: {
    email: string;
  };
}

export function BillingContent({ user, subscription, clerkUser }: BillingContentProps) {
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);

  const handleManageBilling = async () => {
    if (!user.stripe_customer_id) {
      // No Stripe customer yet - redirect to pricing
      window.location.href = "/pricing";
      return;
    }

    setIsLoadingPortal(true);
    try {
      const response = await fetch("/api/stripe/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Failed to create billing portal session");
      }
    } catch (error) {
      console.error("Error creating billing portal session:", error);
    } finally {
      setIsLoadingPortal(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      active: { variant: "default", label: "Active" },
      trialing: { variant: "secondary", label: "Trial" },
      past_due: { variant: "destructive", label: "Past Due" },
      canceled: { variant: "outline", label: "Canceled" },
      incomplete: { variant: "destructive", label: "Incomplete" },
    };

    const config = statusConfig[status] || { variant: "outline" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const isTrialing = subscription?.status === "trialing";
  const isActive = subscription?.status === "active" || isTrialing;
  const isCanceled = subscription?.cancel_at_period_end || subscription?.status === "canceled";

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-3xl font-bold">Billing & Subscription</h1>
        <p className="mb-8 text-muted-foreground">
          Manage your subscription and billing information
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Current Plan Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Current Plan
              </CardTitle>
              <CardDescription>Your current subscription details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <span className="font-semibold capitalize">
                  {user.tier === "pro" ? "Pro" : "Free"}
                </span>
              </div>

              {subscription && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    {getStatusBadge(subscription.status)}
                  </div>

                  {subscription.interval && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Billing</span>
                      <span className="capitalize">{subscription.interval}ly</span>
                    </div>
                  )}

                  {isTrialing && subscription.trial_end && (
                    <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950">
                      <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                        <AlertCircle className="h-4 w-4" />
                        Trial ends on {formatDate(subscription.trial_end)}
                      </div>
                    </div>
                  )}

                  {isCanceled && !subscription.canceled_at && (
                    <div className="rounded-lg bg-yellow-50 p-3 dark:bg-yellow-950">
                      <div className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-300">
                        <AlertCircle className="h-4 w-4" />
                        Cancels on {formatDate(subscription.current_period_end)}
                      </div>
                    </div>
                  )}
                </>
              )}

              {!subscription && user.tier === "free" && (
                <div className="rounded-lg bg-muted p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    You&apos;re on the Free plan. Upgrade to Pro for full access.
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter>
              {user.tier === "free" ? (
                <Button asChild className="w-full">
                  <a href="/pricing">Upgrade to Pro</a>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleManageBilling}
                  disabled={isLoadingPortal}
                >
                  {isLoadingPortal ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  Manage Subscription
                </Button>
              )}
            </CardFooter>
          </Card>

          {/* Billing Period Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Billing Period
              </CardTitle>
              <CardDescription>Current billing cycle information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscription && isActive ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Started</span>
                    <span>{formatDate(subscription.current_period_start)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {isCanceled ? "Access Until" : "Next Billing"}
                    </span>
                    <span>{formatDate(subscription.current_period_end)}</span>
                  </div>
                  {isActive && !isCanceled && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <CheckCircle className="h-4 w-4" />
                      Auto-renews on {formatDate(subscription.current_period_end)}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-muted-foreground">
                  <p className="text-sm">No active billing period</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Account Management Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Account
              </CardTitle>
              <CardDescription>Manage your account settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Email</span>
                <span className="text-sm">{clerkUser.email}</span>
              </div>
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button variant="outline" className="flex-1" asChild>
                <a href="/user-profile">
                  <Settings className="mr-2 h-4 w-4" />
                  Clerk Account
                </a>
              </Button>
              {user.stripe_customer_id && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleManageBilling}
                  disabled={isLoadingPortal}
                >
                  {isLoadingPortal ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="mr-2 h-4 w-4" />
                  )}
                  Stripe Billing
                </Button>
              )}
            </CardFooter>
          </Card>

          {/* Quick Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common billing actions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {user.stripe_customer_id ? (
                <>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={handleManageBilling}
                    disabled={isLoadingPortal}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Update Payment Method
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={handleManageBilling}
                    disabled={isLoadingPortal}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View Invoice History
                  </Button>
                  {isActive && !isCanceled && (
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-destructive hover:text-destructive"
                      onClick={handleManageBilling}
                      disabled={isLoadingPortal}
                    >
                      <AlertCircle className="mr-2 h-4 w-4" />
                      Cancel Subscription
                    </Button>
                  )}
                </>
              ) : (
                <div className="text-center text-muted-foreground">
                  <p className="text-sm">Upgrade to Pro to access billing features</p>
                  <Button asChild className="mt-4">
                    <a href="/pricing">View Plans</a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
