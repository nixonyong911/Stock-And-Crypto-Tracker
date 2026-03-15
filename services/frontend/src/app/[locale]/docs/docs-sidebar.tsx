"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import {
  COMMANDS,
  COMMAND_CATEGORIES,
  type CommandCategory,
} from "@/data/commands";
import { ChevronDown, Menu, X, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

const categoryOrder: CommandCategory[] = [
  "getting-started",
  "session",
  "watchlist",
  "features",
  "help",
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [openCategories, setOpenCategories] = useState<Set<CommandCategory>>(
    () => new Set(categoryOrder)
  );

  const toggleCategory = (cat: CommandCategory) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const isActive = (slug: string) =>
    pathname.endsWith(`/docs/commands/${slug}`);

  return (
    <nav className="space-y-1 py-4">
      <div className="px-3 pb-3">
        <Link
          href="/docs"
          className="flex items-center gap-2 text-sm font-semibold"
          onClick={onNavigate}
        >
          <BookOpen className="h-4 w-4" />
          Documentation
        </Link>
      </div>

      <div className="px-3 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Commands
        </span>
      </div>

      {categoryOrder.map((catKey) => {
        const cat = COMMAND_CATEGORIES[catKey];
        const commands = COMMANDS.filter((c) => c.category === catKey);
        const isOpen = openCategories.has(catKey);

        return (
          <div key={catKey}>
            <button
              onClick={() => toggleCategory(catKey)}
              className="flex w-full items-center justify-between px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {cat.label}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`}
              />
            </button>

            {isOpen && (
              <div className="pb-1">
                {commands.map((cmd) => (
                  <Link
                    key={cmd.slug}
                    href={`/docs/commands/${cmd.slug}`}
                    onClick={onNavigate}
                    className={`block px-3 py-1.5 pl-6 text-sm transition-colors ${
                      isActive(cmd.slug)
                        ? "font-medium text-primary border-l-2 border-primary ml-2 pl-4"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="font-mono">{cmd.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function DocsSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <div className="sticky top-16 z-30 flex items-center border-b bg-background px-4 py-2 lg:hidden">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? (
            <X className="h-4 w-4" />
          ) : (
            <Menu className="h-4 w-4" />
          )}
          Menu
        </Button>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 top-16 z-20 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      {mobileOpen && (
        <aside className="fixed left-0 top-[calc(4rem+41px)] z-30 h-[calc(100vh-4rem-41px)] w-64 overflow-y-auto border-r bg-background lg:hidden">
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </aside>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r">
        <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
          <SidebarContent />
        </div>
      </aside>
    </>
  );
}
