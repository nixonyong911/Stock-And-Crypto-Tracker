"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSupabase, WorkerRegistry, FetchSchedule, StockTicker } from "@/lib/supabase";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  RefreshCw, 
  Play,
  Settings,
  Database,
  Activity,
  ExternalLink
} from "lucide-react";

interface WorkerDetails extends WorkerRegistry {
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
}

export default function WorkerConfigPage() {
  const params = useParams();
  const workerName = params.worker as string;
  
  const [worker, setWorker] = useState<WorkerDetails | null>(null);
  const [schedule, setSchedule] = useState<FetchSchedule | null>(null);
  const [tickers, setTickers] = useState<StockTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  useEffect(() => {
    async function loadWorkerDetails() {
      const supabase = getSupabase();
      if (!supabase) {
        setLoading(false);
        return;
      }
      
      try {
        // Load worker from registry
        const { data: workerData, error: workerError } = await supabase
          .from('worker_registry')
          .select('*')
          .eq('name', workerName)
          .single();
        
        if (workerError || !workerData) {
          console.error('Worker not found:', workerError);
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

        // Load schedule
        const { data: scheduleData } = await supabase
          .from('fetch_schedules')
          .select('*')
          .ilike('name', `%${workerName}%`)
          .single();
        
        if (scheduleData) {
          setSchedule(scheduleData);
        }

        // Load tickers (for data fetcher workers)
        if (workerData.service_type === 'data-fetcher') {
          const { data: tickersData } = await supabase
            .from('stock_tickers')
            .select('*')
            .order('symbol');
          
          setTickers(tickersData || []);
        }
      } catch (err) {
        console.error('Failed to load worker details:', err);
      } finally {
        setLoading(false);
      }
    }
    
    loadWorkerDetails();
  }, [workerName]);

  const handleToggleSchedule = async () => {
    if (!schedule) return;
    const supabase = getSupabase();
    if (!supabase) return;
    
    const { error } = await supabase
      .from('fetch_schedules')
      .update({ is_enabled: !schedule.is_enabled })
      .eq('id', schedule.id);
    
    if (!error) {
      setSchedule({ ...schedule, is_enabled: !schedule.is_enabled });
    }
  };

  const handleToggleTicker = async (ticker: StockTicker) => {
    const supabase = getSupabase();
    if (!supabase) return;
    
    const { error } = await supabase
      .from('stock_tickers')
      .update({ is_active: !ticker.is_active })
      .eq('id', ticker.id);
    
    if (!error) {
      setTickers(tickers.map(t => 
        t.id === ticker.id ? { ...t, is_active: !t.is_active } : t
      ));
    }
  };

  const handleTriggerFetchAll = async () => {
    setTriggerLoading(true);
    setTriggerResult(null);
    
    try {
      const response = await fetch(
        `https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/api/fetch/trigger/all`,
        { method: 'POST' }
      );
      
      const result = await response.json();
      setTriggerResult(result.message || JSON.stringify(result));
    } catch (err) {
      setTriggerResult(`Error: ${err}`);
    } finally {
      setTriggerLoading(false);
    }
  };

  const handleTriggerFetchSymbol = async (symbol: string) => {
    setTriggerLoading(true);
    setTriggerResult(null);
    
    try {
      const response = await fetch(
        `https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/api/fetch/trigger/${symbol}`,
        { method: 'POST' }
      );
      
      const result = await response.json();
      setTriggerResult(result.message || JSON.stringify(result));
    } catch (err) {
      setTriggerResult(`Error: ${err}`);
    } finally {
      setTriggerLoading(false);
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

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <CardDescription className="text-slate-400">Schedule</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Activity className={`w-5 h-5 ${schedule?.is_enabled ? 'text-emerald-400' : 'text-slate-600'}`} />
                <span className={`font-semibold ${schedule?.is_enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {schedule?.is_enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Schedule Time</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="font-semibold text-slate-200">
                {schedule?.schedule_time_utc || 'Not set'}
              </span>
              <span className="text-slate-500 ml-1">UTC</span>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Last Run</CardDescription>
            </CardHeader>
            <CardContent>
              <span className={`font-semibold ${
                schedule?.last_run_status === 'success' ? 'text-emerald-400' :
                schedule?.last_run_status === 'failed' ? 'text-red-400' :
                'text-slate-500'
              }`}>
                {schedule?.last_run_status || 'Never'}
              </span>
            </CardContent>
          </Card>
        </div>

        {/* Schedule Configuration */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Schedule Configuration
            </CardTitle>
            <CardDescription className="text-slate-400">
              Enable/disable scheduled fetching
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-200">Automatic Daily Fetch</p>
                <p className="text-sm text-slate-500">
                  Fetches data daily at {schedule?.schedule_time_utc || '22:00:00'} UTC
                </p>
              </div>
              <Button
                onClick={handleToggleSchedule}
                variant={schedule?.is_enabled ? "default" : "secondary"}
                className={schedule?.is_enabled 
                  ? "bg-emerald-600 hover:bg-emerald-700" 
                  : "bg-slate-700 hover:bg-slate-600"
                }
              >
                {schedule?.is_enabled ? 'Enabled' : 'Disabled'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Manual Trigger */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <Play className="w-5 h-5" />
              Manual Trigger
            </CardTitle>
            <CardDescription className="text-slate-400">
              Manually trigger data fetch operations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button
                onClick={handleTriggerFetchAll}
                disabled={triggerLoading}
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                {triggerLoading ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Fetch All Tickers
              </Button>
            </div>
            
            {triggerResult && (
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
                <pre className="text-sm text-slate-300 whitespace-pre-wrap">{triggerResult}</pre>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tickers Management */}
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
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTriggerFetchSymbol(ticker.symbol)}
                        disabled={triggerLoading}
                        className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Fetch
                      </Button>
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
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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

