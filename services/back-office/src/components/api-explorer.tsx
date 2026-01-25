"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ChevronDown, 
  ChevronRight, 
  Play, 
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  Zap
} from "lucide-react";

interface Parameter {
  name: string;
  in: string;
  required: boolean;
  type: string;
  description?: string;
  default?: unknown;
}

interface Endpoint {
  path: string;
  method: string;
  summary: string;
  description?: string;
  parameters: Parameter[];
  requestBody?: {
    required: boolean;
    schema?: Record<string, unknown>;
  };
  tags?: string[];
}

interface ApiResponse {
  status: number;
  statusText: string;
  data: unknown;
  duration: number;
}

interface ApiExplorerProps {
  worker: string;
}

// Method badge colors
const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-600 text-white",
  POST: "bg-cyan-600 text-white",
  PUT: "bg-amber-600 text-white",
  DELETE: "bg-red-600 text-white",
  PATCH: "bg-violet-600 text-white",
};

// Status badge colors
function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return "text-emerald-400";
  if (status >= 400 && status < 500) return "text-amber-400";
  return "text-red-400";
}

// Simple JSON syntax highlighter (CSS-based, no dependencies)
function JsonHighlighter({ json }: { json: string }) {
  const highlighted = json
    .replace(/(".*?"):/g, '<span class="text-cyan-400">$1</span>:')
    .replace(/: (".*?")/g, ': <span class="text-emerald-400">$1</span>')
    .replace(/: (\d+\.?\d*)/g, ': <span class="text-amber-400">$1</span>')
    .replace(/: (true|false)/g, ': <span class="text-violet-400">$1</span>')
    .replace(/: (null)/g, ': <span class="text-slate-500">$1</span>');

  return (
    <pre 
      className="text-sm text-slate-300 whitespace-pre-wrap font-mono"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}

// Single endpoint row component
function EndpointRow({ 
  endpoint, 
  worker,
  isExpanded,
  onToggle,
}: { 
  endpoint: Endpoint; 
  worker: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [bodyValue, setBodyValue] = useState("");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Initialize default values
  useEffect(() => {
    const defaults: Record<string, string> = {};
    endpoint.parameters.forEach(param => {
      if (param.default !== undefined) {
        defaults[param.name] = String(param.default);
      }
    });
    setParamValues(defaults);

    // Initialize body with schema example if available
    if (endpoint.requestBody?.schema) {
      try {
        setBodyValue(JSON.stringify(endpoint.requestBody.schema, null, 2));
      } catch {
        setBodyValue("{}");
      }
    }
  }, [endpoint]);

  const handleExecute = async () => {
    setLoading(true);
    setResponse(null);

    try {
      // Substitute path parameters
      let path = endpoint.path;
      endpoint.parameters
        .filter(p => p.in === "path")
        .forEach(p => {
          const value = paramValues[p.name] || "";
          path = path.replace(`{${p.name}}`, encodeURIComponent(value));
        });

      // Collect query parameters
      const queryParams: Record<string, string> = {};
      endpoint.parameters
        .filter(p => p.in === "query" && paramValues[p.name])
        .forEach(p => {
          queryParams[p.name] = paramValues[p.name];
        });

      // Parse body if present
      let body: unknown;
      if (endpoint.requestBody && bodyValue.trim()) {
        try {
          body = JSON.parse(bodyValue);
        } catch {
          setResponse({
            status: 0,
            statusText: "Invalid JSON",
            data: { error: "Request body is not valid JSON" },
            duration: 0,
          });
          setLoading(false);
          return;
        }
      }

      const res = await fetch("/back-office/api/openapi/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker,
          path,
          method: endpoint.method,
          params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
          body,
        }),
      });

      const data = await res.json();
      setResponse(data);
    } catch (error) {
      setResponse({
        status: 0,
        statusText: "Network Error",
        data: { error: String(error) },
        duration: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(
        typeof response.data === "string" 
          ? response.data 
          : JSON.stringify(response.data, null, 2)
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  const hasParams = endpoint.parameters.length > 0 || endpoint.requestBody;

  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 hover:bg-slate-800/50 transition-colors text-left"
      >
        {hasParams ? (
          isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
          )
        ) : (
          <div className="w-4" />
        )}
        
        <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold shrink-0 ${METHOD_COLORS[endpoint.method] || "bg-slate-600"}`}>
          {endpoint.method}
        </span>
        
        <span className="font-mono text-sm text-slate-200 truncate">
          {endpoint.path}
        </span>
        
        <span className="text-sm text-slate-500 truncate ml-auto mr-2">
          {endpoint.summary}
        </span>

        {!hasParams && (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleExecute();
            }}
            disabled={loading}
            className="bg-cyan-600 hover:bg-cyan-700 shrink-0"
          >
            {loading ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
          </Button>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-slate-800 p-4 space-y-4 bg-slate-950/50">
          {/* Description */}
          {endpoint.description && (
            <p className="text-sm text-slate-400">{endpoint.description}</p>
          )}

          {/* Parameters */}
          {endpoint.parameters.length > 0 && (
            <div className="space-y-3">
              {endpoint.parameters.map(param => (
                <div key={param.name} className="flex items-start gap-3">
                  <div className="w-32 shrink-0">
                    <label className="text-sm font-mono text-slate-300">
                      {param.name}
                      {param.required && <span className="text-red-400 ml-1">*</span>}
                    </label>
                    <div className="text-xs text-slate-500">
                      {param.in} · {param.type}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={paramValues[param.name] || ""}
                    onChange={(e) => setParamValues(prev => ({ ...prev, [param.name]: e.target.value }))}
                    placeholder={param.description || param.name}
                    className="flex-1 px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-600"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Request body */}
          {endpoint.requestBody && (
            <div className="space-y-2">
              <label className="text-sm font-mono text-slate-300">
                Request Body
                {endpoint.requestBody.required && <span className="text-red-400 ml-1">*</span>}
              </label>
              <textarea
                value={bodyValue}
                onChange={(e) => setBodyValue(e.target.value)}
                placeholder='{"key": "value"}'
                rows={4}
                className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-sm text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-600 resize-y"
              />
            </div>
          )}

          {/* Execute button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleExecute}
              disabled={loading}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Execute
            </Button>
            {response && (
              <span className="text-sm text-slate-500">
                {response.duration}ms
              </span>
            )}
          </div>

          {/* Response */}
          {response && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">Response:</span>
                  <span className={`font-mono font-semibold ${getStatusColor(response.status)}`}>
                    {response.status} {response.statusText}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopy}
                  className="text-slate-400 hover:text-slate-200"
                >
                  {copied ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </Button>
              </div>
              <div className="p-3 rounded bg-slate-900 border border-slate-800 overflow-x-auto max-h-80 overflow-y-auto">
                {typeof response.data === "string" ? (
                  <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono">
                    {response.data}
                  </pre>
                ) : (
                  <JsonHighlighter json={JSON.stringify(response.data, null, 2)} />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick response for no-param endpoints */}
      {!isExpanded && !hasParams && response && (
        <div className="border-t border-slate-800 px-4 py-2 bg-slate-950/50">
          <div className="flex items-center gap-2">
            <span className={`font-mono text-sm font-semibold ${getStatusColor(response.status)}`}>
              {response.status}
            </span>
            <span className="text-sm text-slate-500 truncate">
              {typeof response.data === "object" 
                ? JSON.stringify(response.data).slice(0, 100) + "..."
                : String(response.data).slice(0, 100)
              }
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function ApiExplorer({ worker }: ApiExplorerProps) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [title, setTitle] = useState<string>("");

  const loadEndpoints = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/back-office/api/openapi/${worker}`);
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Failed to load endpoints");
        return;
      }
      
      setEndpoints(data.endpoints || []);
      setTitle(data.title || worker);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [worker]);

  useEffect(() => {
    loadEndpoints();
  }, [loadEndpoints]);

  if (loading) {
    return (
      <Card className="border-slate-800 bg-slate-900/50">
        <CardContent className="py-8 text-center">
          <RefreshCw className="w-6 h-6 text-slate-500 mx-auto animate-spin" />
          <p className="text-slate-500 mt-2">Loading API endpoints...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-slate-800 bg-slate-900/50">
        <CardContent className="py-8 text-center">
          <AlertCircle className="w-6 h-6 text-red-400 mx-auto" />
          <p className="text-red-400 mt-2">{error}</p>
          <Button
            variant="ghost"
            onClick={loadEndpoints}
            className="mt-4 text-slate-400"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-800 bg-slate-900/50">
      <CardHeader>
        <CardTitle className="text-slate-100 flex items-center gap-2">
          <Zap className="w-5 h-5" />
          API Explorer
        </CardTitle>
        <CardDescription className="text-slate-400">
          {title} · {endpoints.length} endpoint{endpoints.length !== 1 ? "s" : ""} available
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {endpoints.length === 0 ? (
          <p className="text-slate-500 text-center py-4">No endpoints found</p>
        ) : (
          endpoints.map((endpoint, index) => (
            <EndpointRow
              key={`${endpoint.method}-${endpoint.path}`}
              endpoint={endpoint}
              worker={worker}
              isExpanded={expandedIndex === index}
              onToggle={() => setExpandedIndex(expandedIndex === index ? null : index)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
