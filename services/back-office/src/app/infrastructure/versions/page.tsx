"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Server,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from "lucide-react";

interface WorkerVersion {
  service: string;
  major_version: number;
  minor_version: number;
  updated_at: string;
}

// Service display name mapping
const SERVICE_DISPLAY_NAMES: Record<string, string> = {
  twelvedata: "TwelveData Worker",
  metrics: "Metrics Service",
  "back-office": "Back Office",
  "mcp-analysis": "MCP Analysis",
  "telegram-bot-2.0": "Telegram Bot 2.0",
  "frontend-staging": "Frontend Staging",
};

export default function VersionsPage() {
  const [versions, setVersions] = useState<WorkerVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/back-office/api/versions");
      if (!response.ok) {
        throw new Error("Failed to fetch versions");
      }
      const data = await response.json();
      setVersions(data.versions || []);
    } catch (err) {
      console.error("Failed to fetch versions:", err);
      setError("Failed to load version data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const formatVersion = (major: number, minor: number) => {
    return `v${major}.${minor}`;
  };

  const getTimeSince = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffHours / 24;

    if (diffHours < 1) {
      const mins = Math.floor(diffMs / (1000 * 60));
      return `${mins}m ago`;
    }
    if (diffHours < 24) {
      return `${Math.floor(diffHours)}h ago`;
    }
    if (diffDays < 7) {
      return `${Math.floor(diffDays)}d ago`;
    }
    return `${Math.floor(diffDays / 7)}w ago`;
  };

  const getStatusInfo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffHours / 24;

    if (diffHours < 24) {
      return {
        icon: CheckCircle,
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10",
        borderColor: "border-emerald-500/30",
        label: "Recent",
      };
    }
    if (diffDays < 7) {
      return {
        icon: AlertTriangle,
        color: "text-amber-400",
        bgColor: "bg-amber-500/10",
        borderColor: "border-amber-500/30",
        label: "This week",
      };
    }
    return {
      icon: XCircle,
      color: "text-red-400",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
      label: "Stale",
    };
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-100">
              Worker Versions
            </h1>
            <p className="text-slate-400 mt-1">
              Docker image versions deployed on Azure VM
            </p>
          </div>
          <Button
            onClick={fetchVersions}
            disabled={loading}
            variant="secondary"
            className="bg-slate-800 hover:bg-slate-700"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Error State */}
        {error && (
          <Card className="border-red-500/30 bg-red-500/10">
            <CardContent className="py-4">
              <p className="text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {loading && !error && (
          <div className="text-center py-16 text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
            Loading version data...
          </div>
        )}

        {/* Stats Summary */}
        {!loading && !error && versions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-400">
                  Total Services
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-cyan-400" />
                  <span className="text-2xl font-bold text-slate-100">
                    {versions.length}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-400">
                  Recently Updated
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span className="text-2xl font-bold text-slate-100">
                    {
                      versions.filter((v) => {
                        const diffHours =
                          (Date.now() - new Date(v.updated_at).getTime()) /
                          (1000 * 60 * 60);
                        return diffHours < 24;
                      }).length
                    }
                  </span>
                  <span className="text-slate-500 text-sm">last 24h</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-400">
                  Last Deploy
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-cyan-400" />
                  <span className="text-lg font-medium text-slate-100">
                    {versions.length > 0
                      ? getTimeSince(
                          versions.reduce((latest, v) =>
                            new Date(v.updated_at) > new Date(latest.updated_at)
                              ? v
                              : latest
                          ).updated_at
                        )
                      : "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Versions Grid */}
        {!loading && !error && versions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {versions.map((version) => {
              const status = getStatusInfo(version.updated_at);
              const StatusIcon = status.icon;

              return (
                <Card
                  key={version.service}
                  className={`border-slate-800 bg-slate-900/50 hover:bg-slate-900/80 transition-colors`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-slate-100 text-lg">
                          {SERVICE_DISPLAY_NAMES[version.service] ||
                            version.service}
                        </CardTitle>
                        <CardDescription className="text-slate-500 font-mono text-xs mt-1">
                          {version.service}
                        </CardDescription>
                      </div>
                      <div
                        className={`px-3 py-1 rounded-full text-sm font-mono font-bold ${status.bgColor} ${status.color}`}
                      >
                        {formatVersion(
                          version.major_version,
                          version.minor_version
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`w-4 h-4 ${status.color}`} />
                        <span className={status.color}>{status.label}</span>
                      </div>
                      <div className="text-slate-500">
                        {formatDate(version.updated_at)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && versions.length === 0 && (
          <Card className="border-slate-800 bg-slate-900/50">
            <CardContent className="py-16 text-center">
              <Server className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-500">No version data found</p>
              <p className="text-slate-600 text-sm mt-1">
                Versions are tracked in the worker_versions table
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
