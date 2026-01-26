"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FetchSchedule } from "@/lib/db/schedules";
import { WorkerRegistry } from "@/lib/db/workers";
import {
  Clock,
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";

interface ScheduleCardProps {
  schedule: FetchSchedule;
  worker?: WorkerRegistry | null;
  onToggle?: (scheduleId: number) => Promise<void>;
  variant?: "full" | "compact";
  isToggling?: boolean;
}

/**
 * Reusable schedule card component
 * - "full" variant: Card layout with all details
 * - "compact" variant: Row layout for list views
 */
export function ScheduleCard({
  schedule,
  worker,
  onToggle,
  variant = "full",
  isToggling = false,
}: ScheduleCardProps) {
  const handleToggle = async () => {
    if (onToggle) {
      await onToggle(schedule.id);
    }
  };

  // Determine worker link path based on service type
  const getWorkerPath = () => {
    if (!worker) return null;
    if (worker.service_type === "data-fetcher") {
      return `/data-fetchers/${worker.name}`;
    }
    if (worker.service_type === "analysis") {
      return `/analysis/${worker.name}`;
    }
    return null;
  };

  const workerPath = getWorkerPath();

  // Get status color based on last run status
  const getStatusColor = () => {
    switch (schedule.last_run_status) {
      case "success":
        return "text-emerald-400";
      case "failed":
        return "text-red-400";
      default:
        return "text-slate-500";
    }
  };

  const getStatusIcon = () => {
    switch (schedule.last_run_status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-slate-500" />;
    }
  };

  // Get service type badge color
  const getServiceTypeBadgeColor = () => {
    if (!worker) return "bg-slate-700 text-slate-400";
    switch (worker.service_type) {
      case "data-fetcher":
        return "bg-emerald-500/20 text-emerald-400";
      case "analysis":
        return "bg-violet-500/20 text-violet-400";
      default:
        return "bg-slate-700 text-slate-400";
    }
  };

  if (variant === "compact") {
    return (
      <div className="flex items-center justify-between p-4 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-900/70 transition-colors">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Status indicator */}
          <div
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              schedule.is_enabled ? "bg-emerald-400" : "bg-slate-600"
            }`}
          />

          {/* Schedule info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-200 truncate">
                {schedule.name}
              </span>
              {worker && (
                <span
                  className={`text-xs px-2 py-0.5 rounded ${getServiceTypeBadgeColor()}`}
                >
                  {worker.service_type}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
              {worker && (
                <span className="flex items-center gap-1">
                  {workerPath ? (
                    <Link
                      href={workerPath}
                      className="hover:text-slate-200 transition-colors"
                    >
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
              <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">
                {schedule.description}
              </p>
            )}
          </div>

          {/* Last run status */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {getStatusIcon()}
            <span className={`text-sm ${getStatusColor()}`}>
              {schedule.last_run_status || "Never"}
            </span>
          </div>
        </div>

        {/* Toggle button */}
        <Button
          onClick={handleToggle}
          disabled={isToggling}
          size="sm"
          className={`ml-4 shrink-0 ${
            schedule.is_enabled
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-slate-700 hover:bg-slate-600"
          }`}
        >
          {isToggling ? "..." : schedule.is_enabled ? "Enabled" : "Disabled"}
        </Button>
      </div>
    );
  }

  // Full variant (card layout)
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              schedule.is_enabled ? "bg-emerald-400" : "bg-slate-600"
            }`}
          />
          <h3 className="font-semibold text-slate-100">{schedule.name}</h3>
          {worker && (
            <span
              className={`text-xs px-2 py-0.5 rounded ${getServiceTypeBadgeColor()}`}
            >
              {worker.service_type}
            </span>
          )}
        </div>
        <Button
          onClick={handleToggle}
          disabled={isToggling}
          size="sm"
          className={
            schedule.is_enabled
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-slate-700 hover:bg-slate-600"
          }
        >
          {isToggling ? "..." : schedule.is_enabled ? "Enabled" : "Disabled"}
        </Button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Worker */}
        {worker && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 w-20">Worker:</span>
            {workerPath ? (
              <Link
                href={workerPath}
                className="text-slate-300 hover:text-cyan-400 transition-colors"
              >
                {worker.display_name}
              </Link>
            ) : (
              <span className="text-slate-300">{worker.display_name}</span>
            )}
          </div>
        )}

        {/* Schedule time */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 w-20">Schedule:</span>
          <span className="text-slate-300 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-slate-500" />
            {schedule.schedule_time} {schedule.schedule_timezone}
          </span>
        </div>

        {/* Description */}
        {schedule.description && (
          <div className="flex items-start gap-2 text-sm">
            <span className="text-slate-500 w-20 shrink-0">Description:</span>
            <span className="text-slate-400">{schedule.description}</span>
          </div>
        )}

        {/* Last run */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 w-20">Last Run:</span>
          <span className={`flex items-center gap-1.5 ${getStatusColor()}`}>
            <Activity className="w-4 h-4" />
            {schedule.last_run_status || "Never"}
          </span>
        </div>
      </div>
    </div>
  );
}
