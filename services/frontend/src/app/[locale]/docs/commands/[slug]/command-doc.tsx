"use client";

import { useMemo } from "react";
import { Link } from "@/lib/i18n/routing";
import { type BotCommand, COMMAND_CATEGORIES } from "@/data/commands";
import { Badge } from "@/components/ui/badge";
import { DocsToc, type TocItem } from "../../docs-toc";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Lock,
  Unlock,
} from "lucide-react";

interface CommandNavItem {
  slug: string;
  name: string;
}

interface Props {
  command: BotCommand;
  prevCommand: CommandNavItem | null;
  nextCommand: CommandNavItem | null;
}

export function CommandDoc({ command, prevCommand, nextCommand }: Props) {
  const category = COMMAND_CATEGORIES[command.category];

  const tocItems: TocItem[] = useMemo(() => {
    const items: TocItem[] = [{ id: "overview", label: "Overview" }];
    items.push({ id: "syntax", label: "Syntax" });
    if (command.params && command.params.length > 0) {
      items.push({ id: "parameters", label: "Parameters" });
    }
    if (command.examples.length > 0) {
      items.push({ id: "examples", label: "Examples" });
    }
    if (command.notes && command.notes.length > 0) {
      items.push({ id: "notes", label: "Tips & Notes" });
    }
    if (command.tierLimits) {
      items.push({ id: "plan-limits", label: "Plan Limits" });
    }
    return items;
  }, [command]);

  return (
    <div className="flex flex-1 min-w-0">
      {/* Main content */}
      <article className="flex-1 min-w-0 px-6 py-8 lg:px-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link
            href="/docs"
            className="hover:text-foreground transition-colors"
          >
            Docs
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">{command.name}</span>
        </nav>

        {/* Title */}
        <h1 id="overview" className="scroll-mt-20 text-3xl font-bold tracking-tight mb-2">
          {command.name}
        </h1>
        <p className="text-lg text-muted-foreground mb-4">
          {command.shortDescription}
        </p>

        {/* Meta badges */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <Badge variant="secondary">{category.label}</Badge>
          {command.aliases && command.aliases.length > 0 &&
            command.aliases.map((alias) => (
              <Badge key={alias} variant="outline" className="font-mono">
                {alias}
              </Badge>
            ))}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            {command.requiresPairing || command.requiresSession ? (
              <>
                <Lock className="h-3.5 w-3.5" />
                {command.requiresSession ? "Requires login" : "Requires pairing"}
              </>
            ) : (
              <>
                <Unlock className="h-3.5 w-3.5" />
                No login required
              </>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-sm leading-relaxed text-muted-foreground mb-8">
          {command.description}
        </p>

        <hr className="mb-8" />

        {/* Syntax */}
        <h2 id="syntax" className="scroll-mt-20 text-xl font-semibold mb-3">
          Syntax
        </h2>
        <div className="rounded-lg bg-muted p-4 font-mono text-sm mb-8 overflow-x-auto">
          {command.syntax}
        </div>

        {/* Parameters */}
        {command.params && command.params.length > 0 && (
          <>
            <h2 id="parameters" className="scroll-mt-20 text-xl font-semibold mb-3">
              Parameters
            </h2>
            <div className="mb-8 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Required</th>
                    <th className="pb-2 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {command.params.map((param) => (
                    <tr key={param.name} className="border-b last:border-0">
                      <td className="py-2.5 pr-4">
                        <code className="font-mono text-sm">{param.name}</code>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge
                          variant={param.required ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {param.required ? "Yes" : "No"}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {param.description}
                        {param.options && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {param.options.map((opt) => (
                              <code
                                key={opt}
                                className="rounded bg-muted px-1.5 py-0.5 text-xs"
                              >
                                {opt}
                              </code>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Examples */}
        {command.examples.length > 0 && (
          <>
            <h2 id="examples" className="scroll-mt-20 text-xl font-semibold mb-3">
              Examples
            </h2>
            <div className="space-y-3 mb-8">
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
          </>
        )}

        {/* Notes */}
        {command.notes && command.notes.length > 0 && (
          <>
            <h2 id="notes" className="scroll-mt-20 text-xl font-semibold mb-3">
              Tips &amp; Notes
            </h2>
            <ul className="mb-8 space-y-2 list-disc list-inside text-sm text-muted-foreground">
              {command.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </>
        )}

        {/* Tier limits */}
        {command.tierLimits && (
          <>
            <h2 id="plan-limits" className="scroll-mt-20 text-xl font-semibold mb-3">
              Plan Limits
            </h2>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 mb-8">
              <p className="text-sm text-muted-foreground">
                {command.tierLimits}
              </p>
              <Link
                href="/pricing"
                className="text-sm text-primary hover:underline mt-1 inline-block"
              >
                View pricing plans &rarr;
              </Link>
            </div>
          </>
        )}

        {/* Prev / Next */}
        <hr className="mb-6" />
        <div className="flex items-center justify-between">
          {prevCommand ? (
            <Link
              href={`/docs/commands/${prevCommand.slug}`}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {prevCommand.name}
            </Link>
          ) : (
            <div />
          )}
          {nextCommand ? (
            <Link
              href={`/docs/commands/${nextCommand.slug}`}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {nextCommand.name}
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <div />
          )}
        </div>
      </article>

      {/* TOC */}
      <DocsToc items={tocItems} />
    </div>
  );
}
