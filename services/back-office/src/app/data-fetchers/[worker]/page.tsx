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
  Database,
  Activity,
  ExternalLink,
  FileCode2,
} from "lucide-react";

// Public API path mapping for swagger URLs (matches Caddyfile routing)
const SWAGGER_PATHS: Record<string, string> = {
  'twelvedata': '/api/twelvedata',
  'data-fetcher-2.0': '/api/data-fetcher-2.0',
};

// Stock ticker type (not cached, loaded on demand)
interface StockTicker {
  id: number;
  universe_id: number;
  symbol: string;
  name: string | null;
  exchange: string | null;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Provider {
  name: string;
  description: string;
  statusEndpoint: string;
  swaggerGroup: string;
  capabilities: string[];
}

interface WorkerDetails extends WorkerRegistry {
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
}

export default function WorkerConfigPage() {
  const params = useParams();
  const workerName = params.worker as string;

  const [worker, setWorker] = useState<WorkerDetails | null>(null);
  const [schedules, setSchedules] = useState<FetchSchedule[]>([]);
  const [tickers, setTickers] = useState<StockTicker[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
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

        // Load tickers via API route (for data fetcher workers)
        if (workerData.service_type === 'data-fetcher' && workerData.name !== 'data-fetcher-2.0') {
          try {
            const tickersRes = await fetch("/back-office/api/tickers");
            if (tickersRes.ok) {
              const { tickers: tickersData } = await tickersRes.json();
              setTickers(tickersData || []);
            }
          } catch (err) {
            console.error('Failed to load tickers:', err);
          }
        }

        // Load providers (for centralized data-fetcher workers)
        if (workerData.name === 'data-fetcher-2.0') {
          try {
            const providersRes = await fetch(`/back-office/api/providers?worker=${workerData.name}`);
            if (providersRes.ok) {
              const { providers: providersData } = await providersRes.json();
              setProviders(providersData || []);
            }
          } catch (err) {
            console.error('Failed to load providers:', err);
          }
        }
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

  const handleToggleTicker = async (ticker: StockTicker) => {
    try {
      const response = await fetch(`/back-office/api/tickers?toggle=${ticker.id}`, {
        method: 'POST',
      });

      if (response.ok) {
        setTickers(tickers.map(t =>
          t.id === ticker.id ? { ...t, is_active: !t.is_active } : t
        ));
      }
    } catch (err) {
      console.error('Failed to toggle ticker:', err);
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
          <Database className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500">Worker &apos;{workerName}&apos; not found</p>
        </div>
      </div>
    );
  }

  const configSchema = worker.config_schema as Record<string, unknown> | null;
  const grafanaPanels = (configSchema?.grafana_panels as Array<{name: string; panelId: string; dashboardUid: string}>) || [];

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full ${
                worker.healthStatus === 'healthy' ? 'bg-emerald-400' :
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
              href="https://stockandcryptotracker.grafana.net/d/twelvedata-details"
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
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                ) : worker.healthStatus === 'unhealthy' ? (
                  <XCircle className="w-5 h-5 text-red-400" />
                ) : (
                  <Clock className="w-5 h-5 text-slate-600" />
                )}
                <span className={`font-semibold ${
                  worker.healthStatus === 'healthy' ? 'text-emerald-400' :
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
                schedules[0]?.last_run_status === 'success' ? 'text-emerald-400' :
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

        {/* Providers (for data-fetcher-2.0) or Tickers (for other workers) */}
        {worker.name === 'data-fetcher-2.0' ? (
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Database className="w-5 h-5" />
                Providers
              </CardTitle>
              <CardDescription className="text-slate-400">
                Dynamically discovered data providers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {providers.length === 0 ? (
                <p className="text-slate-500 text-center py-4">No providers discovered</p>
              ) : (
                <div className="space-y-2">
                  {providers.map((provider) => (
                    <div key={provider.name} className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950/50">
                      <div className="flex items-center gap-4">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <div>
                          <span className="font-semibold text-slate-200">{provider.name}</span>
                          <span className="text-slate-500 ml-2 text-sm">{provider.description}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {provider.capabilities.map((cap) => (
                          <span key={cap} className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                            {cap}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Database className="w-5 h-5" />
                Tickers
              </CardTitle>
              <CardDescription className="text-slate-400">
                Manage which tickers to fetch data for
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tickers.length === 0 ? (
                <p className="text-slate-500 text-center py-4">No tickers configured</p>
              ) : (
                <div className="space-y-2">
                  {tickers.map((ticker) => (
                    <div
                      key={ticker.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950/50"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-2 h-2 rounded-full ${ticker.is_active ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        <div>
                          <span className="font-mono font-semibold text-slate-200">{ticker.symbol}</span>
                          {ticker.name && (
                            <span className="text-slate-500 ml-2 text-sm">{ticker.name}</span>
                          )}
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                          {ticker.exchange}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggleTicker(ticker)}
                        className={ticker.is_active
                          ? "text-emerald-400 hover:text-emerald-300"
                          : "text-slate-500 hover:text-slate-400"
                        }
                      >
                        {ticker.is_active ? 'Active' : 'Inactive'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Grafana Panels */}
        {grafanaPanels.length > 0 && (
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Monitoring
              </CardTitle>
              <CardDescription className="text-slate-400">
                Real-time metrics from Grafana
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {grafanaPanels.map((panel, index) => (
                  <div key={index} className="rounded-lg border border-slate-800 overflow-hidden">
                    <div className="bg-slate-800 px-3 py-2 text-sm text-slate-300">
                      {panel.name}
                    </div>
                    <div className="h-[200px] bg-slate-950 flex items-center justify-center text-slate-500">
                      <iframe
                        src={`https://stockandcryptotracker.grafana.net/d-solo/${panel.dashboardUid}?panelId=${panel.panelId}&theme=dark`}
                        width="100%"
                        height="200"
                        frameBorder="0"
                        className="bg-transparent"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-center">
                <a
                  href="https://stockandcryptotracker.grafana.net/d/twelvedata-details"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cyan-400 hover:text-cyan-300 flex items-center justify-center gap-1"
                >
                  View Full Dashboard
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

