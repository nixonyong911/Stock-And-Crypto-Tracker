"use client";

import { useState } from "react";
import { Link } from "@/lib/i18n/routing";
import {
  COMMANDS,
  COMMAND_CATEGORIES,
  type CommandCategory,
  type BotCommand,
} from "@/data/commands";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Terminal,
  Search,
  Rocket,
  RefreshCw,
  List,
  Sparkles,
  HelpCircle,
  ArrowRight,
  Send,
} from "lucide-react";

const TELEGRAM_BOT_URL =
  "https://t.me/StockAndCryptoAdvisorBot?start=register";

const categoryIcons: Record<CommandCategory, typeof Terminal> = {
  "getting-started": Rocket,
  session: RefreshCw,
  watchlist: List,
  features: Sparkles,
  help: HelpCircle,
};

const categoryOrder: CommandCategory[] = [
  "getting-started",
  "session",
  "watchlist",
  "features",
  "help",
];

function CommandCard({ command }: { command: BotCommand }) {
  return (
    <Link href={`/commands/${command.slug}`} className="group block">
      <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-mono text-base">
              {command.name}
            </CardTitle>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <CardDescription className="text-sm">
            {command.shortDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <code className="rounded bg-muted px-2 py-1 text-xs">
            {command.syntax}
          </code>
          {command.aliases && command.aliases.length > 0 && (
            <div className="mt-2 flex gap-1">
              {command.aliases.map((alias) => (
                <Badge key={alias} variant="secondary" className="text-xs">
                  {alias}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export function CommandsContent() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCommands = searchQuery.trim()
    ? COMMANDS.filter((cmd) => {
        const q = searchQuery.toLowerCase();
        return (
          cmd.name.toLowerCase().includes(q) ||
          cmd.shortDescription.toLowerCase().includes(q) ||
          cmd.description.toLowerCase().includes(q) ||
          cmd.aliases?.some((a) => a.toLowerCase().includes(q))
        );
      })
    : null;

  return (
    <>
      {/* Hero */}
      <section className="border-b bg-muted/30 py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Bot Commands
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Complete reference for all Telegram bot commands. Learn how to track
            stocks and crypto, manage your watchlist, and get AI-powered
            insights.
          </p>

          {/* Search */}
          <div className="relative mx-auto mt-8 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search commands..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border bg-background px-10 py-2.5 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Commands */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          {filteredCommands ? (
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-6 text-lg font-semibold text-muted-foreground">
                {filteredCommands.length} result
                {filteredCommands.length !== 1 ? "s" : ""} for &ldquo;
                {searchQuery}&rdquo;
              </h2>
              {filteredCommands.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredCommands.map((cmd) => (
                    <CommandCard key={cmd.slug} command={cmd} />
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground">
                  No commands match your search. Try a different term.
                </p>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-5xl space-y-12">
              {categoryOrder.map((categoryKey) => {
                const category = COMMAND_CATEGORIES[categoryKey];
                const commands = COMMANDS.filter(
                  (cmd) => cmd.category === categoryKey
                );
                const Icon = categoryIcons[categoryKey];

                return (
                  <div key={categoryKey}>
                    <div className="mb-6 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">{category.label}</h2>
                        <p className="text-sm text-muted-foreground">
                          {category.description}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {commands.map((cmd) => (
                        <CommandCard key={cmd.slug} command={cmd} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-muted/30 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-4 text-2xl font-bold">Ready to get started?</h2>
          <p className="mx-auto mb-8 max-w-xl text-muted-foreground">
            Open the Telegram bot and start tracking stocks and crypto in
            seconds. No credit card required.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="gap-2">
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Send className="h-4 w-4" />
                Open Telegram Bot
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
