"use client";

import { useEffect, useState } from "react";
import { ScheduleCard } from "@/components/schedule-card";
import { FetchSchedule } from "@/lib/db/schedules";
import { WorkerRegistry } from "@/lib/db/workers";
import { Calendar, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScheduleWithWorker {
  schedule: FetchSchedule;
  worker: WorkerRegistry | null;
}

export default function SchedulesPage() {
  const [schedulesWithWorkers, setSchedulesWithWorkers] = useState<ScheduleWithWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());

  const loadData = async () => {
    try {
      // Fetch schedules and workers in parallel
      const [schedulesRes, workersRes] = await Promise.all([
        fetch("/back-office/api/schedules"),
        fetch("/back-office/api/workers"),
      ]);

      if (!schedulesRes.ok || !workersRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const { schedules } = await schedulesRes.json();
      const { workers } = await workersRes.json();

      // Join schedules with workers
      const joined: ScheduleWithWorker[] = schedules.map((schedule: FetchSchedule) => {
        const worker = workers.find((w: WorkerRegistry) => w.id === schedule.worker_id) || null;
        return { schedule, worker };
      });

      // Sort by worker service type, then by schedule name
      joined.sort((a, b) => {
        const typeA = a.worker?.service_type || "z";
        const typeB = b.worker?.service_type || "z";
        if (typeA !== typeB) return typeA.localeCompare(typeB);
        return a.schedule.name.localeCompare(b.schedule.name);
      });

      setSchedulesWithWorkers(joined);
    } catch (err) {
      console.error("Failed to load schedules:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Force refresh the cache
    try {
      await fetch("/back-office/api/schedules?refresh=true", { method: "POST" });
    } catch (err) {
      console.error("Failed to refresh cache:", err);
    }
    await loadData();
  };

  const handleToggle = async (scheduleId: number) => {
    setTogglingIds((prev) => new Set(prev).add(scheduleId));

    try {
      const response = await fetch(`/back-office/api/schedules?toggle=${scheduleId}`, {
        method: "POST",
      });

      if (response.ok) {
        const { schedule: updatedSchedule } = await response.json();
        setSchedulesWithWorkers((prev) =>
          prev.map((item) =>
            item.schedule.id === scheduleId
              ? { ...item, schedule: updatedSchedule }
              : item
          )
        );
      }
    } catch (err) {
      console.error("Failed to toggle schedule:", err);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(scheduleId);
        return next;
      });
    }
  };

  // Group schedules by worker service type
  const groupedSchedules = schedulesWithWorkers.reduce((acc, item) => {
    const type = item.worker?.service_type || "other";
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {} as Record<string, ScheduleWithWorker[]>);

  const getGroupTitle = (type: string) => {
    switch (type) {
      case "data-fetcher":
        return "Data Fetchers";
      case "analysis":
        return "Analysis Workers";
      default:
        return "Other";
    }
  };

  const getGroupColor = (type: string) => {
    switch (type) {
      case "data-fetcher":
        return "text-emerald-400";
      case "analysis":
        return "text-violet-400";
      default:
        return "text-slate-400";
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto text-center py-16 text-slate-500">
          Loading schedules...
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
              <h1 className="text-3xl font-bold text-slate-100">Scheduled Jobs</h1>
            </div>
            <p className="text-slate-400 mt-2">
              Manage all worker schedules from a single view. Toggle jobs on/off and view their status.
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            className="bg-slate-800 border-slate-700 hover:bg-slate-700"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
            <div className="text-2xl font-bold text-slate-100">
              {schedulesWithWorkers.length}
            </div>
            <div className="text-sm text-slate-400">Total Schedules</div>
          </div>
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
            <div className="text-2xl font-bold text-emerald-400">
              {schedulesWithWorkers.filter((s) => s.schedule.is_enabled).length}
            </div>
            <div className="text-sm text-slate-400">Active</div>
          </div>
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
            <div className="text-2xl font-bold text-slate-500">
              {schedulesWithWorkers.filter((s) => !s.schedule.is_enabled).length}
            </div>
            <div className="text-sm text-slate-400">Disabled</div>
          </div>
        </div>

        {/* Schedules List */}
        {schedulesWithWorkers.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500">No schedules found</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedSchedules).map(([type, items]) => (
              <div key={type}>
                <h2 className={`text-lg font-semibold mb-3 ${getGroupColor(type)}`}>
                  {getGroupTitle(type)}
                </h2>
                <div className="space-y-3">
                  {items.map(({ schedule, worker }) => (
                    <ScheduleCard
                      key={schedule.id}
                      schedule={schedule}
                      worker={worker}
                      onToggle={handleToggle}
                      variant="compact"
                      isToggling={togglingIds.has(schedule.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
