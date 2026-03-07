"use client";

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

import { ChannelPairingCard } from "@/components/pairing/channel-pairing-card";
import Link from "next/link";

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

  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    clerkUser.email?.split("@")[0] ||
    "User";

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
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/dashboard/billing">
                      Manage Subscription
                    </Link>
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

        {/* Telegram Pairing Card (reusable) */}
        <ChannelPairingCard isPaired={dbUser?.telegramLinked ?? false} />
      </div>
    </div>
  );
}
