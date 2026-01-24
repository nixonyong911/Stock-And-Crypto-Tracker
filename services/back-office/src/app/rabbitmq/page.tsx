"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  RefreshCw, 
  Clock,
  CheckCircle,
  XCircle,
  Layers,
  MessageSquare,
  Users,
  Activity,
} from "lucide-react";

interface QueueStats {
  name: string;
  messagesReady: number;
  messagesUnacked: number;
  totalMessages: number;
  consumers: number;
  memory: number;
  publishRate: number;
  deliverRate: number;
  idleSince: string | null;
  state: string;
  owner: string;
  description: string | null;
}

interface OverviewStats {
  totalQueues: number;
  totalMessages: number;
  messagesReady: number;
  messagesUnacked: number;
  totalConsumers: number;
  totalConnections: number;
  publishRate: number;
  deliverRate: number;
}

export default function RabbitMQPage() {
  const [queues, setQueues] = useState<QueueStats[]>([]);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [queuesRes, overviewRes, healthRes] = await Promise.all([
        fetch("/back-office/api/rabbitmq?action=queues"),
        fetch("/back-office/api/rabbitmq?action=overview"),
        fetch("/back-office/api/rabbitmq?action=health"),
      ]);

      if (queuesRes.ok) {
        const data = await queuesRes.json();
        setQueues(data.queues || []);
      }

      if (overviewRes.ok) {
        const data = await overviewRes.json();
        setOverview(data.overview);
      }

      if (healthRes.ok) {
        const data = await healthRes.json();
        setHealthy(data.healthy);
      }
    } catch (error) {
      console.error("Failed to fetch RabbitMQ data:", error);
      setHealthy(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatRate = (rate: number) => {
    if (rate === 0) return "0/s";
    if (rate < 1) return `${(rate * 1000).toFixed(1)}/s`;
    return `${rate.toFixed(1)}/s`;
  };

  const formatIdleSince = (idleSince: string | null) => {
    if (!idleSince) return "Active";
    
    const idleDate = new Date(idleSince);
    const now = new Date();
    const diffMs = now.getTime() - idleDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return "Just now";
  };

  // Group queues by owner
  const queuesByOwner = queues.reduce((acc, queue) => {
    const owner = queue.owner || "Unknown";
    if (!acc[owner]) acc[owner] = [];
    acc[owner].push(queue);
    return acc;
  }, {} as Record<string, QueueStats[]>);

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-100">RabbitMQ Queues</h1>
            <p className="text-slate-400 mt-1">
              Monitor message queues across all services
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-600"
              />
              Auto-refresh (30s)
            </label>
            <Button
              onClick={fetchData}
              disabled={loading}
              variant="secondary"
              className="bg-slate-800 hover:bg-slate-700"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {healthy === null ? (
                  <Clock className="w-5 h-5 text-slate-600" />
                ) : healthy ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
                <span className={`font-semibold ${
                  healthy === null ? "text-slate-500" :
                  healthy ? "text-emerald-400" : "text-red-400"
                }`}>
                  {healthy === null ? "Checking..." : healthy ? "Connected" : "Disconnected"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Total Queues</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-purple-400" />
                <span className="text-2xl font-bold text-slate-100">
                  {overview?.totalQueues ?? queues.length}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Total Messages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-400" />
                <span className="text-2xl font-bold text-slate-100">
                  {overview?.totalMessages ?? 0}
                </span>
                <span className="text-slate-500 text-sm">
                  ({overview?.messagesReady ?? 0} ready)
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Total Consumers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                <span className="text-2xl font-bold text-slate-100">
                  {overview?.totalConsumers ?? 0}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Message Rate Card */}
        {overview && (overview.publishRate > 0 || overview.deliverRate > 0) && (
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-slate-100 text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-400" />
                Message Rates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-8">
                <div>
                  <span className="text-slate-400 text-sm">Publish</span>
                  <div className="text-xl font-mono text-emerald-400">
                    {formatRate(overview.publishRate)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 text-sm">Deliver</span>
                  <div className="text-xl font-mono text-cyan-400">
                    {formatRate(overview.deliverRate)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Queues by Owner */}
        {loading ? (
          <div className="text-center py-16 text-slate-500">Loading queues...</div>
        ) : queues.length === 0 ? (
          <Card className="border-slate-800 bg-slate-900/50">
            <CardContent className="py-16 text-center">
              <Layers className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-500">No queues found</p>
            </CardContent>
          </Card>
        ) : (
          Object.entries(queuesByOwner).map(([owner, ownerQueues]) => (
            <Card key={owner} className="border-slate-800 bg-slate-900/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-slate-100">{owner}</CardTitle>
                    <CardDescription className="text-slate-400">
                      {ownerQueues.length} queue{ownerQueues.length !== 1 ? "s" : ""}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="text-left py-2 px-3 text-slate-400 font-medium">Queue</th>
                        <th className="text-right py-2 px-3 text-slate-400 font-medium">Ready</th>
                        <th className="text-right py-2 px-3 text-slate-400 font-medium">Unacked</th>
                        <th className="text-right py-2 px-3 text-slate-400 font-medium">Consumers</th>
                        <th className="text-right py-2 px-3 text-slate-400 font-medium">Memory</th>
                        <th className="text-right py-2 px-3 text-slate-400 font-medium">Publish</th>
                        <th className="text-right py-2 px-3 text-slate-400 font-medium">Deliver</th>
                        <th className="text-right py-2 px-3 text-slate-400 font-medium">Idle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ownerQueues.map((queue) => (
                        <tr key={queue.name} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 px-3">
                            <div>
                              <code className="text-purple-400 text-xs">{queue.name}</code>
                              {queue.description && (
                                <p className="text-slate-600 text-xs mt-0.5">{queue.description}</p>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className={`font-mono text-xs ${
                              queue.messagesReady > 0 ? "text-amber-400" : "text-slate-500"
                            }`}>
                              {queue.messagesReady}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className={`font-mono text-xs ${
                              queue.messagesUnacked > 0 ? "text-orange-400" : "text-slate-500"
                            }`}>
                              {queue.messagesUnacked}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className={`font-mono text-xs ${
                              queue.consumers > 0 ? "text-emerald-400" : "text-slate-500"
                            }`}>
                              {queue.consumers}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className="font-mono text-xs text-slate-400">
                              {formatBytes(queue.memory)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className="font-mono text-xs text-slate-400">
                              {formatRate(queue.publishRate)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className="font-mono text-xs text-slate-400">
                              {formatRate(queue.deliverRate)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className={`text-xs ${
                              queue.idleSince ? "text-slate-500" : "text-emerald-400"
                            }`}>
                              {formatIdleSince(queue.idleSince)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
