import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Trend = "up" | "down" | "flat" | null;

export function TrendIcon({ trend, className }: { trend: Trend; className?: string }) {
  if (trend === "up") {
    return <TrendingUp className={cn("h-4 w-4 text-green-500", className)} />;
  }
  if (trend === "down") {
    return <TrendingDown className={cn("h-4 w-4 text-red-500", className)} />;
  }
  return <Minus className={cn("h-4 w-4 text-muted-foreground", className)} />;
}
