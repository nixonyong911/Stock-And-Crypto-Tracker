"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabase, WorkerRegistry } from "@/lib/supabase";
import { Activity, Database, CheckCircle, XCircle, Clock } from "lucide-react";
import Link from "next/link";

interface WorkerWithHealth extends WorkerRegistry {
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
}

export default function DashboardPage() {
  const [workers, setWorkers] = useState<WorkerWithHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/back-office";

  useEffect(() => {
    async function loadDashboard() {
      const supabase = getSupabase();
      if (!supabase) {
        setLoading(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('worker_registry')
          .select('*')
          .eq('is_active', true)
          .order('display_name');
        
        if (error) throw error;
        
        // Check health for each worker
        const workersWithHealth = await Promise.all(
          (data || []).map(async (worker) => {
            if (!worker.health_endpoint) {
              return { ...worker, healthStatus: 'unknown' as const };
            }
            
            try {
              const healthUrl = `https://nxserver.malaysiawest.cloudapp.azure.com${worker.health_endpoint}`;
              const response = await fetch(healthUrl, { 
                method: 'GET',
                cache: 'no-store',
              });
              return {
                ...worker,
                healthStatus: response.ok ? 'healthy' as const : 'unhealthy' as const
              };
            } catch {
              return { ...worker, healthStatus: 'unhealthy' as const };
            }
          })
        );
        
        setWorkers(workersWithHealth);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    
    loadDashboard();
  }, []);

  const healthyCount = workers.filter(w => w.healthStatus === 'healthy').length;
  const totalCount = workers.length;

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-slate-400 mt-1">
            Overview of all workers and their status
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Total Workers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-cyan-400" />
                <span className="text-2xl font-bold text-slate-100">{totalCount}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Healthy</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <span className="text-2xl font-bold text-emerald-400">{healthyCount}</span>
                <span className="text-slate-500">/ {totalCount}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400" />
                <span className={`text-lg font-semibold ${
                  healthyCount === totalCount ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {healthyCount === totalCount ? 'All Operational' : 'Degraded'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Workers List */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-slate-100">Workers</CardTitle>
            <CardDescription className="text-slate-400">
              All registered workers and their current status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-slate-500">Loading workers...</div>
            ) : workers.length === 0 ? (
              <div className="text-center py-8 text-slate-500">No workers registered</div>
            ) : (
              <div className="space-y-3">
                {workers.map((worker) => (
                  <Link
                    key={worker.id}
                    href={`${basePath}/data-fetchers/${worker.name}`}
                    className="flex items-center justify-between p-4 rounded-lg border border-slate-800 bg-slate-950/50 hover:bg-slate-900/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${
                        worker.healthStatus === 'healthy' ? 'bg-emerald-400' :
                        worker.healthStatus === 'unhealthy' ? 'bg-red-400' :
                        'bg-slate-600'
                      }`} />
                      <div>
                        <div className="font-medium text-slate-200">{worker.display_name}</div>
                        <div className="text-sm text-slate-500">{worker.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-xs px-2 py-1 rounded ${
                        worker.service_type === 'data-fetcher' 
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-purple-500/20 text-purple-400'
                      }`}>
                        {worker.service_type}
                      </span>
                      {worker.healthStatus === 'healthy' ? (
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                      ) : worker.healthStatus === 'unhealthy' ? (
                        <XCircle className="w-5 h-5 text-red-400" />
                      ) : (
                        <Clock className="w-5 h-5 text-slate-600" />
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
