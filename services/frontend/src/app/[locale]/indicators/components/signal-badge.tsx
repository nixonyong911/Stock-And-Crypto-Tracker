import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Signal = "bullish" | "bearish" | "neutral" | null;

export function SignalBadge({ signal, compact = false }: { signal: Signal; compact?: boolean }) {
  const t = useTranslations("indicators");
  if (compact) {
    return (
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          signal === "bullish" && "bg-green-500",
          signal === "bearish" && "bg-red-500",
          (!signal || signal === "neutral") && "bg-gray-400"
        )}
      />
    );
  }

  if (signal === "bullish") {
    return (
      <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-0">
        {t("status.rising")}
      </Badge>
    );
  }
  if (signal === "bearish") {
    return (
      <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/20 border-0">
        {t("status.falling")}
      </Badge>
    );
  }
  return <Badge variant="secondary">{t("status.stable")}</Badge>;
}
