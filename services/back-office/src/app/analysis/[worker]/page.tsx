"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WorkerRegistry } from "@/lib/db/workers";
import { FetchSchedule } from "@/lib/db/schedules";
import { ScheduleCard } from "@/components/schedule-card";
import {
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  Activity,
  ExternalLink,
  FileCode2,
} from "lucide-react";

// Public API path mapping for swagger URLs (matches Caddyfile routing)
const SWAGGER_PATHS: Record<string, string> = {
  'candlestick-analysis': '/api/analysis',
};

interface WorkerDetails extends WorkerRegistry {
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
}

export default function AnalysisWorkerPage() {
  const params = useParams();
  const workerName = params.worker as string;

  const [worker, setWorker] = useState<WorkerDetails | null>(null);
  const [schedules, setSchedules] = useState<FetchSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function loadWorkerDetails() {
      try {
        // Fetch workers and schedules via API routes (server-side with caching)
        const [workersRes, schedulesRes] = await Promise.all([
          fetch("/back-office/api/workers"),
          fetch("/back-office/api/schedules"),
        ]);

        if (!workersRes.ok || !schedulesRes.ok) {
          throw new Error("Failed to fetch data");
        }

        const { workers } = await workersRes.json();
        const { schedules: allSchedules } = await schedulesRes.json();

        // Find the specific worker
        const workerData = workers.find((w: WorkerRegistry) => w.name === workerName);

        if (!workerData) {
          console.error('Worker not found');
          setLoading(false);
          return;
        }

        // Check health
        let healthStatus: 'healthy' | 'unhealthy' | 'unknown' = 'unknown';
        if (workerData.health_endpoint) {
          try {
            const healthUrl = `https://nxserver.malaysiawest.cloudapp.azure.com${workerData.health_endpoint}`;
            const response = await fetch(healthUrl, { cache: 'no-store' });
            healthStatus = response.ok ? 'healthy' : 'unhealthy';
          } catch {
            healthStatus = 'unhealthy';
          }
        }

        setWorker({ ...workerData, healthStatus });

        // Find ALL schedules for this worker using worker_id
        const workerSchedules = allSchedules.filter((s: FetchSchedule) =>
          s.worker_id === workerData.id
        );
        setSchedules(workerSchedules);
      } catch (err) {
        console.error('Failed to load worker details:', err);
      } finally {
        setLoading(false);
      }
    }

    loadWorkerDetails();
  }, [workerName]);

  const handleToggleSchedule = async (scheduleId: number) => {
    setTogglingIds((prev) => new Set(prev).add(scheduleId));
    try {
      const response = await fetch(`/back-office/api/schedules?toggle=${scheduleId}`, {
        method: "POST",
      });
      if (response.ok) {
        const { schedule: updatedSchedule } = await response.json();
        setSchedules((prev) =>
          prev.map((s) => (s.id === scheduleId ? updatedSchedule : s))
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

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto text-center py-16 text-slate-500">
          Loading worker details...
        </div>
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto text-center py-16">
          <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500">Worker &apos;{workerName}&apos; not found</p>
        </div>
      </div>
    );
  }

  const configSchema = worker.config_schema as Record<string, unknown> | null;
  const grafanaDashboard = (configSchema?.grafana_dashboard as string) || 'candlestick-analysis-details';

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full ${
                worker.healthStatus === 'healthy' ? 'bg-violet-400' :
                worker.healthStatus === 'unhealthy' ? 'bg-red-400' :
                'bg-slate-600'
              }`} />
              <h1 className="text-3xl font-bold text-slate-100">{worker.display_name}</h1>
            </div>
            <p className="text-slate-400 mt-1">{worker.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`https://nxserver.malaysiawest.cloudapp.azure.com${SWAGGER_PATHS[workerName] || `/${workerName}`}/swagger/`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700">
                <FileCode2 className="w-4 h-4 mr-2" />
                Swagger
                <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </a>
            <a
              href={`https://stockandcryptotracker.grafana.net/d/${grafanaDashboard}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
            >
              View in Grafana
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Health</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {worker.healthStatus === 'healthy' ? (
                  <CheckCircle className="w-5 h-5 text-violet-400" />
                ) : worker.healthStatus === 'unhealthy' ? (
                  <XCircle className="w-5 h-5 text-red-400" />
                ) : (
                  <Clock className="w-5 h-5 text-slate-600" />
                )}
                <span className={`font-semibold ${
                  worker.healthStatus === 'healthy' ? 'text-violet-400' :
                  worker.healthStatus === 'unhealthy' ? 'text-red-400' :
                  'text-slate-500'
                }`}>
                  {worker.healthStatus === 'healthy' ? 'Healthy' :
                   worker.healthStatus === 'unhealthy' ? 'Unhealthy' :
                   'Unknown'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Last Run</CardDescription>
            </CardHeader>
            <CardContent>
              <span className={`font-semibold ${
                schedules[0]?.last_run_status === 'success' ? 'text-violet-400' :
                schedules[0]?.last_run_status === 'failed' ? 'text-red-400' :
                'text-slate-500'
              }`}>
                {schedules[0]?.last_run_status || 'Never'}
              </span>
            </CardContent>
          </Card>
        </div>

        {/* Schedules */}
        {schedules.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-200">Schedules</h2>
            {schedules.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                onToggle={handleToggleSchedule}
                variant="compact"
                isToggling={togglingIds.has(schedule.id)}
              />
            ))}
          </div>
        )}

        {/* Monitoring */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Monitoring
            </CardTitle>
            <CardDescription className="text-slate-400">
              View detailed metrics and analysis results in Grafana
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <BarChart3 className="w-12 h-12 text-violet-400 mx-auto mb-4" />
              <p className="text-slate-400 mb-4">
                View candlestick patterns, analysis history, and performance metrics
              </p>
              <a
                href={`https://stockandcryptotracker.grafana.net/d/${grafanaDashboard}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors"
              >
                Open Grafana Dashboard
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
