"use client";

import { ExecutionLogEntry } from "@/lib/db/schedules";

interface ExecutionHistoryBarProps {
  entries: ExecutionLogEntry[];
  maxSlots?: number;
}

const STATUS_COLORS: Record<string, string> = {
  success: "bg-emerald-400",
  failed: "bg-red-400",
  partial: "bg-amber-400",
  skipped: "bg-slate-500",
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export function ExecutionHistoryBar({
  entries,
  maxSlots = 20,
}: ExecutionHistoryBarProps) {
  const reversed = [...entries].reverse();
  const slots = reversed.slice(-maxSlots);

  const emptyCount = Math.max(0, maxSlots - slots.length);
  const successCount = slots.filter((e) => e.status === "success").length;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-px">
        {Array.from({ length: emptyCount }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-[4px] h-4 rounded-[1px] bg-slate-700/50"
          />
        ))}
        {slots.map((entry) => (
          <div key={entry.id} className="relative group">
            <div
              className={`w-[4px] h-4 rounded-[1px] ${STATUS_COLORS[entry.status] || "bg-slate-600"}`}
            />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
              <div className="bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 whitespace-nowrap shadow-lg">
                <div className="font-medium capitalize">{entry.status}</div>
                <div className="text-slate-400">{formatTime(entry.completed_at)}</div>
                <div className="text-slate-400">{formatDuration(entry.duration_ms)}</div>
                {entry.message && (
                  <div className="text-slate-500 max-w-[200px] truncate mt-0.5">
                    {entry.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <span className="text-xs text-slate-500 tabular-nums shrink-0">
        {successCount}/{slots.length > 0 ? slots.length : "—"}
      </span>
    </div>
  );
}
