"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LayoutGrid, Table } from "lucide-react";

export function ViewToggle() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  const currentView = searchParams.get("view") || "compact";
  
  const setView = (view: "compact" | "detail") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.push(`${pathname}?${params.toString()}`);
  };
  
  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
      <Button
        variant={currentView === "compact" ? "default" : "ghost"}
        size="sm"
        onClick={() => setView("compact")}
        className="gap-2"
      >
        <LayoutGrid className="h-4 w-4" />
        <span className="hidden sm:inline">Compact</span>
      </Button>
      <Button
        variant={currentView === "detail" ? "default" : "ghost"}
        size="sm"
        onClick={() => setView("detail")}
        className="gap-2"
      >
        <Table className="h-4 w-4" />
        <span className="hidden sm:inline">Detail</span>
      </Button>
    </div>
  );
}
