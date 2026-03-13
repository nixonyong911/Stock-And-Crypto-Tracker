"use client";

import { useEffect, useState, useCallback } from "react";
import { DiscoveredScheduleCard } from "@/components/schedule-card";
import { ExecutionLogEntry } from "@/lib/db/schedules";
import {
  Calendar,
  RefreshCw,
  CheckCircle,
  XCircle,
  WifiOff,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

interface WorkerStatus {
  name: string;
  display_name: string;
  reachable: boolean;
  schedule_count: number;
}

interface DiscoveryResult {
  schedules: DiscoveredSchedule[];
  workers: WorkerStatus[];
}

export default function SchedulesPage() {
  const [data, setData] = useState<DiscoveryResult | null>(null);
  const [executionHistories, setExecutionHistories] = useState<
    Record<number, ExecutionLogEntry[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingNames, setTogglingNames] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/back-office/api/schedules");
      if (!res.ok) throw new Error("Failed to fetch schedules");
      const result: DiscoveryResult = await res.json();
      setData(result);

      // Load execution history for DB-backed schedules (those with IDs)
      const scheduleIds = result.schedules
        .filter((s) => s.id != null && s.source === "worker")
        .map((s) => s.id!);

      if (scheduleIds.length > 0) {
        try {
          const histRes = await fetch(
            `/back-office/api/schedules/history?ids=${scheduleIds.join(",")}`
          );
          if (histRes.ok) {
            const { history } = await histRes.json();
            setExecutionHistories(history || {});
          }
        } catch (histErr) {
          console.error("Failed to load execution history:", histErr);
        }
      }
    } catch (err) {
      console.error("Failed to load schedules:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/back-office/api/schedules?refresh=true", {
        method: "POST",
      });
    } catch (err) {
      console.error("Failed to refresh cache:", err);
    }
    await loadData();
  };

  const handleToggle = async (service: string, scheduleName: string, scheduleId?: string) => {
    if (!scheduleId) return;

    setTogglingNames((prev) => new Set(prev).add(scheduleName));

    try {
      const response = await fetch(
        `/back-office/api/schedules?toggle=${encodeURIComponent(service)}&id=${scheduleId}`,
        { method: "POST" }
      );

      if (response.ok && data) {
        // Re-fetch to get updated state
        await loadData();
      }
    } catch (err) {
      console.error("Failed to toggle schedule:", err);
    } finally {
      setTogglingNames((prev) => {
        const next = new Set(prev);
        next.delete(scheduleName);
        return next;
      });
    }
  };

  // Group schedules by service
  const groupedSchedules = (data?.schedules ?? []).reduce(
    (acc, schedule) => {
      const key = schedule.service;
      if (!acc[key]) acc[key] = [];
      acc[key].push(schedule);
      return acc;
    },
    {} as Record<string, DiscoveredSchedule[]>
  );

  const getServiceColor = (service: string, reachable: boolean) => {
    if (!reachable) return "text-red-400";
    if (service.includes("fred")) return "text-blue-400";
    return "text-emerald-400";
  };

  const activeCount = data?.schedules.filter((s) => s.is_enabled && s.source === "worker").length ?? 0;
  const disabledCount = data?.schedules.filter((s) => !s.is_enabled && s.source === "worker").length ?? 0;
  const unreachableCount = data?.workers.filter((w) => !w.reachable).length ?? 0;

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto text-center py-16 text-slate-500">
          Discovering schedules from workers...
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-amber-400" />
              <h1 className="text-3xl font-bold text-slate-100">
                Scheduled Jobs
              </h1>
            </div>
            <p className="text-slate-400 mt-2">
              Auto-discovered from running workers. Toggle jobs on/off and view
              their status.
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            className="bg-slate-800 border-slate-700 hover:bg-slate-700"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Discovering..." : "Refresh"}
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
            <div className="text-2xl font-bold text-slate-100">
              {data?.schedules.filter((s) => s.source === "worker").length ?? 0}
            </div>
            <div className="text-sm text-slate-400">Total Schedules</div>
          </div>
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <span className="text-2xl font-bold text-emerald-400">
                {activeCount}
              </span>
            </div>
            <div className="text-sm text-slate-400">Active</div>
          </div>
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-slate-500" />
              <span className="text-2xl font-bold text-slate-500">
                {disabledCount}
              </span>
            </div>
            <div className="text-sm text-slate-400">Disabled</div>
          </div>
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
            <div className="flex items-center gap-2">
              <WifiOff className="w-5 h-5 text-red-400" />
              <span className="text-2xl font-bold text-red-400">
                {unreachableCount}
              </span>
            </div>
            <div className="text-sm text-slate-400">Unreachable Workers</div>
          </div>
        </div>

        {/* Worker Health Bar */}
        {data?.workers && data.workers.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            {data.workers.map((w) => (
              <div
                key={w.name}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
                  w.reachable
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-red-500/30 bg-red-500/10 text-red-400"
                }`}
              >
                <Server className="w-3 h-3" />
                {w.display_name}
                <span className="opacity-60">
                  {w.reachable ? `${w.schedule_count} schedules` : "unreachable"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Schedules List */}
        {(data?.schedules.length ?? 0) === 0 ? (
          <div className="text-center py-16">
            <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500">
              No schedules discovered. Are workers running?
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedSchedules).map(([service, items]) => {
              const workerInfo = data?.workers.find((w) => w.name === service);
              const reachable = workerInfo?.reachable ?? false;

              return (
                <div key={service}>
                  <h2
                    className={`text-lg font-semibold mb-3 ${getServiceColor(service, reachable)}`}
                  >
                    {workerInfo?.display_name ?? service}
                    {!reachable && (
                      <span className="ml-2 text-xs font-normal text-red-400/70">
                        (unreachable)
                      </span>
                    )}
                  </h2>
                  <div className="space-y-3">
                    {items
                      .filter((s) => s.source === "worker")
                      .map((schedule) => (
                        <DiscoveredScheduleCard
                          key={`${service}:${schedule.name}`}
                          schedule={schedule}
                          onToggle={
                            schedule.id != null
                              ? handleToggle
                              : undefined
                          }
                          isToggling={togglingNames.has(schedule.name)}
                          executionHistory={
                            schedule.id != null
                              ? executionHistories[schedule.id]
                              : undefined
                          }
                        />
                      ))}
                    {items.filter((s) => s.source === "unreachable").length > 0 && (
                      <div className="rounded-lg border border-red-800/50 bg-red-900/10 p-4">
                        <div className="flex items-center gap-2 text-red-400 text-sm">
                          <WifiOff className="w-4 h-4" />
                          Worker is not responding. Schedules cannot be displayed.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
