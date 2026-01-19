"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface CacheAction {
  name: string;
  description: string;
  endpoint: string;
  tag: string;
}

const cacheActions: CacheAction[] = [
  {
    name: "Refresh Stripe Prices",
    description: "Fetches the latest prices from Stripe and updates the cached pricing data on the frontend.",
    endpoint: "https://stockandcryptotracker.com/api/cache/revalidate",
    tag: "stripe-prices",
  },
];

export default function CacheManagementPage() {
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const handleRefresh = async (action: CacheAction) => {
    setLoadingStates((prev) => ({ ...prev, [action.tag]: true }));
    setResults((prev) => ({ ...prev, [action.tag]: { success: false, message: "" } }));

    try {
      const response = await fetch(action.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tag: action.tag }),
      });

      const data = await response.json();

      if (response.ok) {
        setResults((prev) => ({
          ...prev,
          [action.tag]: { success: true, message: data.message || "Cache refreshed successfully!" },
        }));
      } else {
        setResults((prev) => ({
          ...prev,
          [action.tag]: { success: false, message: data.error || "Failed to refresh cache" },
        }));
      }
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        [action.tag]: { success: false, message: `Error: ${error instanceof Error ? error.message : "Unknown error"}` },
      }));
    } finally {
      setLoadingStates((prev) => ({ ...prev, [action.tag]: false }));
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Cache Management</h1>
        <p className="text-slate-400 mt-1">
          Manage frontend caches. Use these actions to refresh cached data from external sources.
        </p>
      </div>

      <div className="grid gap-4">
        {cacheActions.map((action) => (
          <Card key={action.tag} className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100">{action.name}</CardTitle>
              <CardDescription className="text-slate-400">{action.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => handleRefresh(action)}
                  disabled={loadingStates[action.tag]}
                  className="bg-sky-600 hover:bg-sky-700"
                >
                  {loadingStates[action.tag] ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Refreshing...
                    </>
                  ) : (
                    "Refresh Cache"
                  )}
                </Button>

                {results[action.tag] && (
                  <span
                    className={`text-sm ${
                      results[action.tag].success ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {results[action.tag].message}
                  </span>
                )}
              </div>

              <div className="mt-4 text-xs text-slate-500">
                <span className="font-mono bg-slate-700 px-2 py-1 rounded">Tag: {action.tag}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-2">How it works</h3>
        <ul className="text-xs text-slate-400 space-y-1">
          <li>• Stripe prices are cached for 1 hour on the frontend for fast page loads</li>
          <li>• When you update prices in Stripe Dashboard, click &quot;Refresh Cache&quot; to see changes immediately</li>
          <li>• The cache will also auto-refresh after 1 hour even without manual action</li>
        </ul>
      </div>
    </div>
  );
}
