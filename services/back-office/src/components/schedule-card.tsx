"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FetchSchedule, ExecutionLogEntry } from "@/lib/db/schedules";
import { WorkerRegistry } from "@/lib/db/workers";
import { ExecutionHistoryBar } from "@/components/execution-history-bar";
import {
  Clock,
  Timer,
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  WifiOff,
} from "lucide-react";

interface DiscoveredSchedule {
  id: number | null;
  name: string;
  description: string | null;
  is_enabled: boolean;
  cadence: string;
  cadence_type: string;
  interval_minutes: number | null;
  offset_minutes: number | null;
  schedule_time: string | null;
  schedule_timezone: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  trigger_endpoint: string | null;
  service: string;
  service_display_name: string;
  source: "worker" | "unreachable";
}

interface DiscoveredScheduleCardProps {
  schedule: DiscoveredSchedule;
  onToggle?: (service: string, scheduleName: string, scheduleId?: string) => Promise<void>;
  isToggling?: boolean;
  executionHistory?: ExecutionLogEntry[];
}

function getStatusColor(status: string | null) {
  switch (status) {
    case "success":
      return "text-emerald-400";
    case "failed":
      return "text-red-400";
    case "partial":
      return "text-amber-400";
    case "unreachable":
      return "text-red-400";
    default:
      return "text-slate-500";
  }
}

function getStatusIcon(status: string | null) {
  switch (status) {
    case "success":
      return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-400" />;
    case "unreachable":
      return <WifiOff className="w-4 h-4 text-red-400" />;
    default:
      return <AlertCircle className="w-4 h-4 text-slate-500" />;
  }
}

function getCadenceIcon(cadenceType: string) {
  switch (cadenceType) {
    case "interval":
      return <Timer className="w-3.5 h-3.5" />;
    default:
      return <Clock className="w-3.5 h-3.5" />;
  }
}

function getCadenceTypeBadge(cadenceType: string) {
  switch (cadenceType) {
    case "interval":
      return "bg-cyan-500/20 text-cyan-400";
    case "daily":
      return "bg-amber-500/20 text-amber-400";
    case "weekly":
      return "bg-violet-500/20 text-violet-400";
    case "monthly":
      return "bg-pink-500/20 text-pink-400";
    default:
      return "bg-slate-700 text-slate-400";
  }
}

function formatLastRun(lastRunAt: string | null): string {
  if (!lastRunAt) return "Never";
  try {
    const d = new Date(lastRunAt);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDay}d ago`;
  } catch {
    return lastRunAt;
  }
}

export function DiscoveredScheduleCard({
  schedule,
  onToggle,
  isToggling = false,
  executionHistory,
}: DiscoveredScheduleCardProps) {
  const handleToggle = async () => {
    if (onToggle && schedule.id != null) {
      await onToggle(schedule.service, schedule.name, String(schedule.id));
    }
  };

  const canToggle = !!onToggle && schedule.source === "worker";

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-900/70 transition-colors">
      <div className="flex items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Status indicator */}
          <div
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              schedule.source === "unreachable"
                ? "bg-red-400"
                : schedule.is_enabled
                  ? "bg-emerald-400"
                  : "bg-slate-600"
            }`}
          />

          {/* Schedule info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-200 truncate">
                {schedule.name}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded ${getCadenceTypeBadge(schedule.cadence_type)}`}
              >
                {schedule.cadence_type}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
              <span className="flex items-center gap-1">
                {getCadenceIcon(schedule.cadence_type)}
                {schedule.cadence}
              </span>
              {schedule.last_run_at && (
                <span className="flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5" />
                  {formatLastRun(schedule.last_run_at)}
                </span>
              )}
            </div>
            {schedule.description && (
              <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">
                {schedule.description}
              </p>
            )}
          </div>

          {/* Last run status */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {getStatusIcon(schedule.last_run_status)}
            <span className={`text-sm ${getStatusColor(schedule.last_run_status)}`}>
              {schedule.last_run_status || "Never"}
            </span>
          </div>

          {/* Toggle button */}
          {canToggle && (
            <Button
              onClick={handleToggle}
              disabled={isToggling}
              size="sm"
              className={`shrink-0 ${
                schedule.is_enabled
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-slate-700 hover:bg-slate-600"
              }`}
            >
              {isToggling
                ? "..."
                : schedule.is_enabled
                  ? "Enabled"
                  : "Disabled"}
            </Button>
          )}
        </div>
      </div>

      {/* Execution history bar */}
      {executionHistory && executionHistory.length > 0 ? (
        <div className="px-4 pb-3 pt-1">
          <ExecutionHistoryBar entries={executionHistory} />
        </div>
      ) : (
        <div className="pb-2" />
      )}
    </div>
  );
}

// Legacy ScheduleCard for data-fetchers/[worker] page
interface ScheduleCardProps {
  schedule: FetchSchedule;
  worker?: WorkerRegistry | null;
  onToggle?: (scheduleId: number) => Promise<void>;
  variant?: "full" | "compact";
  isToggling?: boolean;
  executionHistory?: ExecutionLogEntry[];
}

export function ScheduleCard({
  schedule,
  worker,
  onToggle,
  variant = "full",
  isToggling = false,
  executionHistory,
}: ScheduleCardProps) {
  const handleToggle = async () => {
    if (onToggle) await onToggle(schedule.id);
  };

  const getWorkerPath = () => {
    if (!worker) return null;
    if (worker.service_type === "data-fetcher") return `/data-fetchers/${worker.name}`;
    return null;
  };

  const workerPath = getWorkerPath();

  const statusColor =
    schedule.last_run_status === "success"
      ? "text-emerald-400"
      : schedule.last_run_status === "failed"
        ? "text-red-400"
        : "text-slate-500";

  const statusIcon =
    schedule.last_run_status === "success" ? (
      <CheckCircle className="w-4 h-4 text-emerald-400" />
    ) : schedule.last_run_status === "failed" ? (
      <XCircle className="w-4 h-4 text-red-400" />
    ) : (
      <AlertCircle className="w-4 h-4 text-slate-500" />
    );

  const badgeColor = !worker
    ? "bg-slate-700 text-slate-400"
    : worker.service_type === "data-fetcher"
      ? "bg-emerald-500/20 text-emerald-400"
      : worker.service_type === "analysis"
        ? "bg-violet-500/20 text-violet-400"
        : "bg-slate-700 text-slate-400";

  if (variant === "compact") {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-900/70 transition-colors">
        <div className="flex items-center justify-between p-4 pb-2">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                schedule.is_enabled ? "bg-emerald-400" : "bg-slate-600"
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-200 truncate">
                  {schedule.name}
                </span>
                {worker && (
                  <span className={`text-xs px-2 py-0.5 rounded ${badgeColor}`}>
                    {worker.service_type}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                {worker && (
                  <span>
                    {workerPath ? (
                      <Link href={workerPath} className="hover:text-slate-200 transition-colors">
                        {worker.display_name}
                      </Link>
                    ) : (
                      worker.display_name
                    )}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {schedule.schedule_time} {schedule.schedule_timezone}
                </span>
              </div>
              {schedule.description && (
                <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">{schedule.description}</p>
              )}
            </div>
            <div className="hidden md:flex items-center gap-2 shrink-0">
              {statusIcon}
              <span className={`text-sm ${statusColor}`}>{schedule.last_run_status || "Never"}</span>
            </div>
            <Button
              onClick={handleToggle}
              disabled={isToggling}
              size="sm"
              className={`shrink-0 ${
                schedule.is_enabled ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-700 hover:bg-slate-600"
              }`}
            >
              {isToggling ? "..." : schedule.is_enabled ? "Enabled" : "Disabled"}
            </Button>
          </div>
        </div>
        {executionHistory && executionHistory.length > 0 ? (
          <div className="px-4 pb-3 pt-1">
            <ExecutionHistoryBar entries={executionHistory} />
          </div>
        ) : (
          <div className="pb-2" />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${schedule.is_enabled ? "bg-emerald-400" : "bg-slate-600"}`} />
          <h3 className="font-semibold text-slate-100">{schedule.name}</h3>
          {worker && (
            <span className={`text-xs px-2 py-0.5 rounded ${badgeColor}`}>{worker.service_type}</span>
          )}
        </div>
        <Button
          onClick={handleToggle}
          disabled={isToggling}
          size="sm"
          className={schedule.is_enabled ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-700 hover:bg-slate-600"}
        >
          {isToggling ? "..." : schedule.is_enabled ? "Enabled" : "Disabled"}
        </Button>
      </div>
      <div className="p-4 space-y-3">
        {worker && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 w-20">Worker:</span>
            {workerPath ? (
              <Link href={workerPath} className="text-slate-300 hover:text-cyan-400 transition-colors">
                {worker.display_name}
              </Link>
            ) : (
              <span className="text-slate-300">{worker.display_name}</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 w-20">Schedule:</span>
          <span className="text-slate-300 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-slate-500" />
            {schedule.schedule_time} {schedule.schedule_timezone}
          </span>
        </div>
        {schedule.description && (
          <div className="flex items-start gap-2 text-sm">
            <span className="text-slate-500 w-20 shrink-0">Description:</span>
            <span className="text-slate-400">{schedule.description}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 w-20">Last Run:</span>
          <span className={`flex items-center gap-1.5 ${statusColor}`}>
            <Activity className="w-4 h-4" />
            {schedule.last_run_status || "Never"}
          </span>
        </div>
        {executionHistory && executionHistory.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 w-20">History:</span>
            <ExecutionHistoryBar entries={executionHistory} />
          </div>
        )}
      </div>
    </div>
  );
}
