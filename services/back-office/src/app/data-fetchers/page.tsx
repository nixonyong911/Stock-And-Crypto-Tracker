"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkerRegistry } from "@/lib/db/workers";
import { FetchSchedule } from "@/lib/db/schedules";
import { Database, CheckCircle, XCircle, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";

interface WorkerWithSchedule extends WorkerRegistry {
  schedule?: FetchSchedule;
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
}

export default function DataFetchersPage() {
  const [workers, setWorkers] = useState<WorkerWithSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  // Next.js basePath handles the /back-office prefix automatically for Link components
  const basePath = "";

  useEffect(() => {
    async function loadWorkers() {
      try {
        // Fetch workers and schedules via API routes (server-side with caching)
        const [workersRes, schedulesRes] = await Promise.all([
          fetch("/back-office/api/workers"),
          fetch("/back-office/api/schedules"),
        ]);
        
        if (!workersRes.ok || !schedulesRes.ok) {
          throw new Error("Failed to fetch data");
        }
        
        const { workers: allWorkers } = await workersRes.json();
        const { schedules: schedulesData } = await schedulesRes.json();
        
        // Filter to data-fetcher workers only
        const workersData = allWorkers.filter((w: WorkerRegistry) => w.service_type === "data-fetcher");

        // Match schedules to workers and check health
        const workersWithData = await Promise.all(
          (workersData || []).map(async (worker: WorkerRegistry) => {
            // Find schedule for this worker using worker_id (proper relational lookup)
            const schedule = schedulesData?.find((s: FetchSchedule) => 
              s.worker_id === worker.id
            );

            // Check health
            let healthStatus: 'healthy' | 'unhealthy' | 'unknown' = 'unknown';
            if (worker.health_endpoint) {
              try {
                const healthUrl = `https://nxserver.malaysiawest.cloudapp.azure.com${worker.health_endpoint}`;
                const response = await fetch(healthUrl, { cache: 'no-store' });
                healthStatus = response.ok ? 'healthy' : 'unhealthy';
              } catch {
                healthStatus = 'unhealthy';
              }
            }

            return { ...worker, schedule, healthStatus };
          })
        );
        
        setWorkers(workersWithData);
      } catch (err) {
        console.error('Failed to load workers:', err);
      } finally {
        setLoading(false);
      }
    }
    
    loadWorkers();
  }, []);

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Data Fetchers</h1>
          <p className="text-slate-400 mt-1">
            Configure and monitor data fetcher workers
          </p>
        </div>

        {/* Workers Grid */}
        {loading ? (
          <div className="text-center py-16 text-slate-500">Loading workers...</div>
        ) : workers.length === 0 ? (
          <Card className="border-slate-800 bg-slate-900/50">
            <CardContent className="py-16 text-center">
              <Database className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-500">No data fetcher workers registered</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {workers.map((worker) => (
              <Link
                key={worker.id}
                href={`${basePath}/data-fetchers/${worker.name}`}
              >
                <Card className="border-slate-800 bg-slate-900/50 hover:bg-slate-900/80 transition-colors cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          worker.healthStatus === 'healthy' ? 'bg-emerald-400' :
                          worker.healthStatus === 'unhealthy' ? 'bg-red-400' :
                          'bg-slate-600'
                        }`} />
                        <CardTitle className="text-slate-100">{worker.display_name}</CardTitle>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-500" />
                    </div>
                    <CardDescription className="text-slate-400">
                      {worker.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {/* Health Status */}
                      <div className="flex items-center gap-2">
                        {worker.healthStatus === 'healthy' ? (
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        ) : worker.healthStatus === 'unhealthy' ? (
                          <XCircle className="w-4 h-4 text-red-400" />
                        ) : (
                          <Clock className="w-4 h-4 text-slate-600" />
                        )}
                        <span className={`${
                          worker.healthStatus === 'healthy' ? 'text-emerald-400' :
                          worker.healthStatus === 'unhealthy' ? 'text-red-400' :
                          'text-slate-500'
                        }`}>
                          {worker.healthStatus === 'healthy' ? 'Healthy' :
                           worker.healthStatus === 'unhealthy' ? 'Unhealthy' :
                           'Unknown'}
                        </span>
                      </div>

                      {/* Schedule Status */}
                      <div className="text-slate-400">
                        <span className="text-slate-600">Schedule: </span>
                        {worker.schedule?.is_enabled ? (
                          <span className="text-emerald-400">Enabled</span>
                        ) : (
                          <span className="text-slate-500">Disabled</span>
                        )}
                      </div>

                      {/* Schedule Time */}
                      <div className="text-slate-400">
                        <span className="text-slate-600">Time: </span>
                        {worker.schedule?.schedule_time || 'Not set'}
                        <span className="text-slate-600"> {worker.schedule?.schedule_timezone || ''}</span>
                      </div>

                      {/* Last Run */}
                      <div className="text-slate-400">
                        <span className="text-slate-600">Last run: </span>
                        {worker.schedule?.last_run_status ? (
                          <span className={
                            worker.schedule.last_run_status === 'success' ? 'text-emerald-400' :
                            worker.schedule.last_run_status === 'failed' ? 'text-red-400' :
                            'text-amber-400'
                          }>
                            {worker.schedule.last_run_status}
                          </span>
                        ) : (
                          <span className="text-slate-500">Never</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

