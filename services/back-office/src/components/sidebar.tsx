"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Terminal,
  Database,
  Activity,
  Home,
  BarChart3,
  Globe,
} from "lucide-react";
import { getSupabase, WorkerRegistry } from "@/lib/supabase";

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    cli: false,
    analysis: true,
    dataFetchers: true,
    frontend: true,
  });
  
  const [dataFetchers, setDataFetchers] = useState<WorkerRegistry[]>([]);
  const [analysisWorkers, setAnalysisWorkers] = useState<WorkerRegistry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadWorkers() {
      const supabase = getSupabase();
      if (!supabase) {
        setLoading(false);
        return;
      }
      
      try {
        // Load both data-fetcher and analysis workers
        const [fetchersResult, analysisResult] = await Promise.all([
          supabase
            .from('worker_registry')
            .select('*')
            .eq('service_type', 'data-fetcher')
            .eq('is_active', true)
            .order('display_name'),
          supabase
            .from('worker_registry')
            .select('*')
            .eq('service_type', 'analysis')
            .eq('is_active', true)
            .order('display_name')
        ]);
        
        if (fetchersResult.error) throw fetchersResult.error;
        if (analysisResult.error) throw analysisResult.error;
        
        setDataFetchers(fetchersResult.data || []);
        setAnalysisWorkers(analysisResult.data || []);
      } catch (err) {
        console.error('Failed to load workers:', err);
      } finally {
        setLoading(false);
      }
    }
    
    loadWorkers();
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // pathname from usePathname() includes the basePath (e.g., "/back-office/cli")
  const isActive = (path: string) => {
    const fullPath = `/back-office${path}`;
    return pathname === fullPath || pathname.startsWith(fullPath + '/');
  };

  return (
    <aside className={`w-64 bg-slate-900 border-r border-slate-800 flex flex-col ${className}`}>
      {/* Logo/Title */}
      <div className="p-4 border-b border-slate-800">
        <Link href="/" className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
          <Activity className="w-6 h-6 text-cyan-400" />
          <span className="font-semibold text-slate-100">Back Office</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {/* Home */}
        <Link
          href="/"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
            pathname === "/back-office"
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Home className="w-4 h-4" />
          Dashboard
        </Link>

        {/* CLI Testing Section */}
        <div>
          <button
            onClick={() => toggleSection('cli')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive("/cli")
                ? 'bg-orange-500/20 text-orange-400'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              CLI Testing
            </div>
            {expandedSections.cli ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          {expandedSections.cli && (
            <div className="ml-4 mt-1 space-y-1">
              <Link
                href="/cli"
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${
                  pathname === "/back-office/cli"
                    ? 'text-orange-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                AI Agents
              </Link>
            </div>
          )}
        </div>

        {/* Analysis Section */}
        <div>
          <button
            onClick={() => toggleSection('analysis')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive("/analysis")
                ? 'bg-violet-500/20 text-violet-400'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Analysis
            </div>
            {expandedSections.analysis ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          {expandedSections.analysis && (
            <div className="ml-4 mt-1 space-y-1">
              {loading ? (
                <div className="px-3 py-1.5 text-xs text-slate-600">Loading...</div>
              ) : analysisWorkers.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-slate-600">No workers found</div>
              ) : (
                analysisWorkers.map((worker) => (
                  <Link
                    key={worker.id}
                    href={`/analysis/${worker.name}`}
                    className={`flex items-center justify-between px-3 py-1.5 rounded text-xs ${
                      pathname === `/back-office/analysis/${worker.name}`
                        ? 'text-violet-400 bg-violet-500/10'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                    }`}
                  >
                    <span>{worker.display_name}</span>
                    {worker.is_active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                    )}
                  </Link>
                ))
              )}
            </div>
          )}
        </div>

        {/* Data Fetchers Section */}
        <div>
          <button
            onClick={() => toggleSection('dataFetchers')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive("/data-fetchers")
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Data Fetchers
            </div>
            {expandedSections.dataFetchers ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          {expandedSections.dataFetchers && (
            <div className="ml-4 mt-1 space-y-1">
              {loading ? (
                <div className="px-3 py-1.5 text-xs text-slate-600">Loading...</div>
              ) : dataFetchers.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-slate-600">No workers found</div>
              ) : (
                dataFetchers.map((worker) => (
                  <Link
                    key={worker.id}
                    href={`/data-fetchers/${worker.name}`}
                    className={`flex items-center justify-between px-3 py-1.5 rounded text-xs ${
                      pathname === `/back-office/data-fetchers/${worker.name}`
                        ? 'text-emerald-400 bg-emerald-500/10'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                    }`}
                  >
                    <span>{worker.display_name}</span>
                    {worker.is_active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    )}
                  </Link>
                ))
              )}
            </div>
          )}
        </div>

        {/* Frontend Section */}
        <div>
          <button
            onClick={() => toggleSection('frontend')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive("/frontend")
                ? 'bg-sky-500/20 text-sky-400'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Frontend
            </div>
            {expandedSections.frontend ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          {expandedSections.frontend && (
            <div className="ml-4 mt-1 space-y-1">
              <Link
                href="/frontend/cache"
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${
                  pathname === "/back-office/frontend/cache"
                    ? 'text-sky-400 bg-sky-500/10'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                Cache Management
              </Link>
            </div>
          )}
        </div>

        {/* Monitoring Link */}
        <a
          href="https://stockandcryptotracker.grafana.net/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
        >
          <Activity className="w-4 h-4" />
          Grafana
          <span className="text-xs text-slate-600">↗</span>
        </a>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <div className="text-xs text-slate-600">
          Stock Tracker v1.0
        </div>
      </div>
    </aside>
  );
}

