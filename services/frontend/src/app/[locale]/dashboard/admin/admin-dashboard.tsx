"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Shield, Activity, Users, BarChart3 } from "lucide-react";

interface MetricsData {
  metrics: {
    uptime_seconds: number;
    total_requests: number;
    success_requests: number;
    failed_requests: number;
    blocked_injections: number;
    queue_enqueues: number;
    queue_timeouts: number;
    queue_full_errors: number;
    cli_executions: number;
    cli_timeouts: number;
    cli_errors: number;
    cli_avg_ms: number;
    sessions_pruned: number;
    usage_rejections: number;
    requests_by_tier: Record<string, number>;
  };
  queue: {
    queue_depth: number;
    running: number;
    max_concurrent: number;
  };
}

interface SecurityLog {
  id: number;
  user_id: string;
  channel_type: string;
  message_text: string;
  block_reason: string;
  created_at: string;
}

interface SessionStats {
  active_sessions: number;
  total_sessions: number;
  avg_duration_min: number;
  by_tier: Record<string, number>;
  by_channel: Record<string, number>;
}

interface UsageStats {
  total_messages: number;
  by_tier: Record<string, number>;
  by_channel: Record<string, number>;
  hours_queried: number;
}

async function fetchAdmin<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(`/api/admin/gateway?endpoint=${encodeURIComponent(endpoint)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function AdminDashboard() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [securityLogs, setSecurityLogs] = useState<SecurityLog[]>([]);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const refresh = useCallback(async () => {
    setLoading(true);
    const [m, s, sess, u] = await Promise.all([
      fetchAdmin<MetricsData>("/api/v1/admin/metrics"),
      fetchAdmin<{ logs: SecurityLog[] }>("/api/v1/admin/security-logs?limit=20"),
      fetchAdmin<SessionStats>("/api/v1/admin/sessions"),
      fetchAdmin<UsageStats>("/api/v1/admin/usage?hours=24"),
    ]);

    if (m) setMetrics(m);
    if (s) setSecurityLogs(s.logs || []);
    if (sess) setSessionStats(sess);
    if (u) setUsageStats(u);
    setLoading(false);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, [refresh]);

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const successRate = metrics
    ? metrics.metrics.total_requests > 0
      ? ((metrics.metrics.success_requests / metrics.metrics.total_requests) * 100).toFixed(1)
      : "N/A"
    : "...";

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Gateway observability &middot; Last refresh:{" "}
            {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Uptime</CardDescription>
            <CardTitle className="text-2xl">
              {metrics ? formatUptime(metrics.metrics.uptime_seconds) : "..."}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Requests</CardDescription>
            <CardTitle className="text-2xl">
              {metrics?.metrics.total_requests ?? "..."}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Success rate: {successRate}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Queue</CardDescription>
            <CardTitle className="text-2xl">
              {metrics?.queue.running ?? "..."}/{metrics?.queue.max_concurrent ?? "..."} active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {metrics?.queue.queue_depth ?? 0} waiting
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Blocked Injections</CardDescription>
            <CardTitle className="text-2xl text-destructive">
              {metrics?.metrics.blocked_injections ?? "..."}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* CLI Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              CLI Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Executions</span>
              <span className="font-mono">{metrics?.metrics.cli_executions ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Avg Duration</span>
              <span className="font-mono">
                {metrics?.metrics.cli_avg_ms
                  ? `${(metrics.metrics.cli_avg_ms / 1000).toFixed(1)}s`
                  : "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Timeouts</span>
              <span className="font-mono text-amber-500">
                {metrics?.metrics.cli_timeouts ?? 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Errors</span>
              <span className="font-mono text-destructive">
                {metrics?.metrics.cli_errors ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Sessions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Active</span>
              <span className="font-mono">{sessionStats?.active_sessions ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-mono">{sessionStats?.total_sessions ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Avg Duration</span>
              <span className="font-mono">
                {sessionStats?.avg_duration_min
                  ? `${sessionStats.avg_duration_min.toFixed(0)}min`
                  : "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Pruned</span>
              <span className="font-mono">{metrics?.metrics.sessions_pruned ?? 0}</span>
            </div>
            {sessionStats?.by_tier && Object.keys(sessionStats.by_tier).length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {Object.entries(sessionStats.by_tier).map(([tier, count]) => (
                  <Badge key={tier} variant="secondary">
                    {tier}: {count}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage (24h) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Usage (24h)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total Messages</span>
              <span className="font-mono">{usageStats?.total_messages ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Usage Rejections</span>
              <span className="font-mono text-amber-500">
                {metrics?.metrics.usage_rejections ?? 0}
              </span>
            </div>
            {usageStats?.by_tier && Object.keys(usageStats.by_tier).length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">By Tier</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(usageStats.by_tier).map(([tier, count]) => (
                    <Badge key={tier} variant="outline">
                      {tier}: {count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {metrics?.metrics.requests_by_tier &&
              Object.keys(metrics.metrics.requests_by_tier).length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    All-time by Tier
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(metrics.metrics.requests_by_tier).map(
                      ([tier, count]) => (
                        <Badge key={tier} variant="outline">
                          {tier}: {count}
                        </Badge>
                      )
                    )}
                  </div>
                </div>
              )}
          </CardContent>
        </Card>

        {/* Security Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Recent Security Blocks
            </CardTitle>
            <CardDescription>Last 20 blocked injection attempts</CardDescription>
          </CardHeader>
          <CardContent>
            {securityLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No blocked attempts.</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {securityLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-md border p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="destructive" className="text-xs">
                        {log.block_reason}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {log.created_at}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 font-mono text-xs text-muted-foreground">
                      {log.message_text.substring(0, 200)}
                      {log.message_text.length > 200 ? "..." : ""}
                    </p>
                    <p className="mt-1 text-xs">
                      User: {log.user_id} &middot; {log.channel_type}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
