"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Database, 
  RefreshCw, 
  Trash2, 
  Clock,
  HardDrive,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface CacheKey {
  key: string;
  ttl: number;
  owner: string;
  description: string | null;
  refreshEndpoint: string | null;
}

interface RedisInfo {
  usedMemory: number;
  maxMemory: number;
  keyCount: number;
}

export default function RedisPage() {
  const [keys, setKeys] = useState<CacheKey[]>([]);
  const [info, setInfo] = useState<RedisInfo | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [keysRes, infoRes, healthRes] = await Promise.all([
        fetch("/back-office/api/redis?action=keys"),
        fetch("/back-office/api/redis?action=info"),
        fetch("/back-office/api/redis?action=health"),
      ]);

      if (keysRes.ok) {
        const data = await keysRes.json();
        setKeys(data.keys || []);
      }

      if (infoRes.ok) {
        const data = await infoRes.json();
        setInfo(data.info);
      }

      if (healthRes.ok) {
        const data = await healthRes.json();
        setHealthy(data.healthy);
      }
    } catch (error) {
      console.error("Failed to fetch Redis data:", error);
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

  const handleRefreshKey = async (key: string) => {
    setRefreshing(key);
    try {
      await fetch(`/back-office/api/redis?action=refresh&key=${encodeURIComponent(key)}`, {
        method: "POST",
      });
      await fetchData();
    } catch (error) {
      console.error("Failed to refresh key:", error);
    } finally {
      setRefreshing(null);
    }
  };

  const handleClearPattern = async (pattern: string) => {
    if (!confirm(`Clear all keys matching: ${pattern}?`)) return;
    
    setRefreshing(pattern);
    try {
      await fetch(`/back-office/api/redis?pattern=${encodeURIComponent(pattern)}`, {
        method: "DELETE",
      });
      await fetchData();
    } catch (error) {
      console.error("Failed to clear pattern:", error);
    } finally {
      setRefreshing(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTTL = (ttl: number) => {
    if (ttl === -1) return "No expiry";
    if (ttl === -2) return "Expired";
    if (ttl < 60) return `${ttl}s`;
    if (ttl < 3600) return `${Math.floor(ttl / 60)}m ${ttl % 60}s`;
    const hours = Math.floor(ttl / 3600);
    const minutes = Math.floor((ttl % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // Group keys by owner
  const keysByOwner = keys.reduce((acc, key) => {
    const owner = key.owner || "Unknown";
    if (!acc[owner]) acc[owner] = [];
    acc[owner].push(key);
    return acc;
  }, {} as Record<string, CacheKey[]>);

  const memoryPercent = info ? (info.usedMemory / info.maxMemory) * 100 : 0;

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-100">Redis Cache</h1>
            <p className="text-slate-400 mt-1">
              Monitor and manage cache across all services
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
              <CardDescription className="text-slate-400">Total Keys</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-cyan-400" />
                <span className="text-2xl font-bold text-slate-100">
                  {info?.keyCount ?? keys.length}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Memory Used</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-cyan-400" />
                <span className="text-xl font-bold text-slate-100">
                  {info ? formatBytes(info.usedMemory) : "—"}
                </span>
                <span className="text-slate-500 text-sm">
                  / {info ? formatBytes(info.maxMemory) : "128 MB"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Memory Usage</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{memoryPercent.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${
                      memoryPercent > 80 ? "bg-red-500" : 
                      memoryPercent > 60 ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(memoryPercent, 100)}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Keys by Owner */}
        {loading ? (
          <div className="text-center py-16 text-slate-500">Loading cache keys...</div>
        ) : keys.length === 0 ? (
          <Card className="border-slate-800 bg-slate-900/50">
            <CardContent className="py-16 text-center">
              <Database className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-500">No cache keys found</p>
            </CardContent>
          </Card>
        ) : (
          Object.entries(keysByOwner).map(([owner, ownerKeys]) => (
            <Card key={owner} className="border-slate-800 bg-slate-900/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-slate-100">{owner}</CardTitle>
                    <CardDescription className="text-slate-400">
                      {ownerKeys.length} key{ownerKeys.length !== 1 ? "s" : ""}
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => handleClearPattern(`${ownerKeys[0]?.key.split(":")[0]}:*`)}
                    disabled={refreshing !== null}
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="text-left py-2 px-3 text-slate-400 font-medium">Key</th>
                        <th className="text-left py-2 px-3 text-slate-400 font-medium">Description</th>
                        <th className="text-right py-2 px-3 text-slate-400 font-medium">TTL</th>
                        <th className="text-right py-2 px-3 text-slate-400 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ownerKeys.map((item) => (
                        <tr key={item.key} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 px-3">
                            <code className="text-cyan-400 text-xs">{item.key}</code>
                          </td>
                          <td className="py-2 px-3 text-slate-500 text-xs">
                            {item.description || "—"}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className={`text-xs font-mono ${
                              item.ttl < 300 ? "text-amber-400" : "text-slate-400"
                            }`}>
                              {formatTTL(item.ttl)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Button
                              onClick={() => handleRefreshKey(item.key)}
                              disabled={refreshing !== null}
                              variant="ghost"
                              size="sm"
                              className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                            >
                              {refreshing === item.key ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3 h-3" />
                              )}
                              <span className="ml-1">Refresh</span>
                            </Button>
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
