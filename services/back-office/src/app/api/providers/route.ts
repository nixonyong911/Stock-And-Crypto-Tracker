import { NextRequest, NextResponse } from "next/server";
import { getWorkers } from "@/lib/db/workers";

/**
 * GET /api/providers?worker=data-fetcher-2.0
 * Proxies provider discovery calls to the data-fetcher backend.
 * Uses the worker_registry to find the worker's base URL,
 * then calls the worker's /api/providers endpoint.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const workerName = searchParams.get("worker");

  if (!workerName) {
    return NextResponse.json(
      { error: "Missing 'worker' query parameter" },
      { status: 400 }
    );
  }

  try {
    // Look up the worker in the registry
    const workers = await getWorkers();
    const worker = workers.find((w) => w.name === workerName);

    if (!worker) {
      return NextResponse.json(
        { error: `Worker '${workerName}' not found` },
        { status: 404 }
      );
    }

    // Build the providers URL from the worker's health_endpoint
    // Convention: health_endpoint always ends with /health/live
    // Base path is derived by stripping this suffix
    // health_endpoint is e.g. "/api/data-fetcher-2.0/health/live"
    // The Caddy reverse proxy routes /api/{workerName}/* to the service
    // So the full public URL is: https://domain/api/{workerName}/api/providers
    const basePath = worker.health_endpoint
      ? worker.health_endpoint.replace(/\/health\/live$/, "")
      : `/api/${workerName}`;

    const providersUrl = `https://nxserver.malaysiawest.cloudapp.azure.com${basePath}/api/providers`;

    const response = await fetch(providersUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch providers from worker (status ${response.status})` },
        { status: response.status }
      );
    }

    const data = await response.json();
    // Validate response shape
    if (!Array.isArray(data)) {
      return NextResponse.json(
        { error: "Unexpected response from provider service", providers: [] },
        { status: 502 }
      );
    }
    return NextResponse.json({ providers: data });
  } catch (error) {
    console.error("GET /api/providers error:", error);
    return NextResponse.json(
      { error: "Failed to fetch providers" },
      { status: 500 }
    );
  }
}
