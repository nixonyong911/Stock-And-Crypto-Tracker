import { ReleaseCalendarEntry } from "@/lib/db/indicators";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";

interface Props {
  release: ReleaseCalendarEntry;
  showDate?: boolean;
}

export function ReleaseItem({ release, showDate = true }: Props) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex items-start gap-3 py-2">
      <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{release.release_name}</p>
        <div className="flex items-center gap-2 mt-1">
          {showDate && release.next_release_date && (
            <span className="text-xs text-muted-foreground">
              {formatDate(release.next_release_date)}
            </span>
          )}
          {release.release_frequency && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {release.release_frequency}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
