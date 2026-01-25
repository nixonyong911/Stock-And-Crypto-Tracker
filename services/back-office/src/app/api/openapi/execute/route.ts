import { NextRequest, NextResponse } from "next/server";

// Worker URL mapping (internal Docker network)
const WORKER_URLS: Record<string, string> = {
  'twelvedata': 'http://twelvedata:8080',
  'candlestick-analysis': 'http://candlestick-analysis:8080',
};

interface ExecuteRequest {
  worker: string;
  path: string;
  method: string;
  params?: Record<string, string>;  // Query params
  body?: unknown;                    // Request body for POST/PUT/PATCH
}

/**
 * POST /api/openapi/execute
 * Proxies API calls to worker services
 */
export async function POST(request: NextRequest) {
  try {
    const body: ExecuteRequest = await request.json();
    const { worker, path, method, params, body: requestBody } = body;

    // Validate worker
    const baseUrl = WORKER_URLS[worker];
    if (!baseUrl) {
      return NextResponse.json(
        { error: `Unknown worker: ${worker}` },
        { status: 404 }
      );
    }

    // Build URL with path params already substituted by client
    let url = `${baseUrl}${path}`;

    // Add query params if present
    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString();
      url += `?${queryString}`;
    }

    // Make the request to the worker
    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    // Add body for POST/PUT/PATCH
    if (requestBody && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      fetchOptions.body = JSON.stringify(requestBody);
    }

    const startTime = Date.now();
    const response = await fetch(url, fetchOptions);
    const duration = Date.now() - startTime;

    // Try to parse response as JSON, fallback to text
    let data: unknown;
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      try {
        data = await response.json();
      } catch {
        data = await response.text();
      }
    } else {
      data = await response.text();
    }

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      data,
      duration,
    });
  } catch (error) {
    console.error("POST /api/openapi/execute error:", error);

    // Check if it's a network error (worker unreachable)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return NextResponse.json(
        {
          status: 503,
          statusText: 'Service Unavailable',
          data: { error: 'Worker service is unreachable' },
          duration: 0,
        }
      );
    }

    return NextResponse.json(
      { error: "Failed to execute API call" },
      { status: 500 }
    );
  }
}
