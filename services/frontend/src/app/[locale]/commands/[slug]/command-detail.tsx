"use client";

import { Link } from "@/lib/i18n/routing";
import { type BotCommand, COMMAND_CATEGORIES } from "@/data/commands";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Terminal,
  Info,
  Code,
  Lightbulb,
  Send,
  Lock,
  Unlock,
} from "lucide-react";

const TELEGRAM_BOT_URL =
  "https://t.me/StockAndCryptoAdvisorBot?start=register";

interface CommandNavItem {
  slug: string;
  name: string;
}

interface Props {
  command: BotCommand;
  prevCommand: CommandNavItem | null;
  nextCommand: CommandNavItem | null;
}

export function CommandDetail({ command, prevCommand, nextCommand }: Props) {
  const category = COMMAND_CATEGORIES[command.category];

  return (
    <>
      {/* Breadcrumb */}
      <div className="border-b bg-muted/20">
        <div className="container mx-auto px-4 py-3">
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link
              href="/commands"
              className="hover:text-foreground transition-colors"
            >
              Commands
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{command.name}</span>
          </nav>
        </div>
      </div>

      {/* Hero */}
      <section className="border-b bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <Badge variant="secondary" className="mb-4">
              {category.label}
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl font-mono">
              {command.name}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              {command.description}
            </p>

            {/* Quick info */}
            <div className="mt-6 flex flex-wrap gap-3">
              {command.aliases && command.aliases.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground">
                    Aliases:
                  </span>
                  {command.aliases.map((alias) => (
                    <Badge key={alias} variant="outline" className="font-mono">
                      {alias}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                {command.requiresPairing || command.requiresSession ? (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <Unlock className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="text-sm text-muted-foreground">
                  {command.requiresSession
                    ? "Requires login"
                    : command.requiresPairing
                      ? "Requires pairing"
                      : "No login required"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl space-y-8">
            {/* Syntax */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Terminal className="h-5 w-5 text-primary" />
                  Syntax
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-muted p-4 font-mono text-sm">
                  {command.syntax}
                </div>
              </CardContent>
            </Card>

            {/* Parameters */}
            {command.params && command.params.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Code className="h-5 w-5 text-primary" />
                    Parameters
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {command.params.map((param) => (
                      <div
                        key={param.name}
                        className="rounded-lg border p-4"
                      >
                        <div className="flex items-center gap-2">
                          <code className="font-mono font-semibold">
                            {param.name}
                          </code>
                          <Badge
                            variant={param.required ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {param.required ? "Required" : "Optional"}
                          </Badge>
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                          {param.description}
                        </p>
                        {param.options && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {param.options.map((opt) => (
                              <code
                                key={opt}
                                className="rounded bg-muted px-2 py-0.5 text-xs"
                              >
                                {opt}
                              </code>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Examples */}
            {command.examples.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Info className="h-5 w-5 text-primary" />
                    Examples
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {command.examples.map((example, i) => (
                      <div key={i} className="rounded-lg border p-4">
                        <code className="font-mono text-sm font-semibold">
                          {example.input}
                        </code>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {example.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            {command.notes && command.notes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Lightbulb className="h-5 w-5 text-primary" />
                    Tips &amp; Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {command.notes.map((note, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <span className="mt-1 block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        {note}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Tier limits */}
            {command.tierLimits && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <p className="font-medium">Plan Limits</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {command.tierLimits}
                      </p>
                      <Button
                        asChild
                        variant="link"
                        className="h-auto p-0 mt-1 text-sm"
                      >
                        <Link href="/pricing">View pricing plans</Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Try it CTA */}
            <div className="rounded-lg border bg-muted/30 p-6 text-center">
              <p className="mb-4 font-medium">
                Try {command.name} now in Telegram
              </p>
              <Button asChild size="lg" className="gap-2">
                <a
                  href={TELEGRAM_BOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Send className="h-4 w-4" />
                  Open Bot
                </a>
              </Button>
            </div>

            {/* Prev / Next navigation */}
            <div className="flex items-center justify-between pt-4">
              {prevCommand ? (
                <Button asChild variant="ghost" className="gap-2">
                  <Link href={`/commands/${prevCommand.slug}`}>
                    <ArrowLeft className="h-4 w-4" />
                    {prevCommand.name}
                  </Link>
                </Button>
              ) : (
                <div />
              )}
              {nextCommand ? (
                <Button asChild variant="ghost" className="gap-2">
                  <Link href={`/commands/${nextCommand.slug}`}>
                    {nextCommand.name}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <div />
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
