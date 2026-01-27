"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function DataToggle() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  const currentData = searchParams.get("data") || "media";
  const isRaw = currentData === "raw";
  
  const toggleData = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("data", isRaw ? "media" : "raw");
    router.push(`${pathname}?${params.toString()}`);
  };
  
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="data-toggle" className="text-sm text-muted-foreground">
        {isRaw ? "Raw" : "Media"}
      </Label>
      <Switch
        id="data-toggle"
        checked={isRaw}
        onCheckedChange={toggleData}
      />
    </div>
  );
}
