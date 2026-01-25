import { NextRequest, NextResponse } from "next/server";

// Worker URL mapping (internal Docker network)
const WORKER_URLS: Record<string, string> = {
  'twelvedata': 'http://twelvedata:8080',
  'candlestick-analysis': 'http://candlestick-analysis:8080',
};

// Endpoints to exclude from display
const EXCLUDED_PATTERNS = [
  /^\/health/,
  /^\/swagger/,
  /^\/metrics$/,
  /^\/$/,
];

interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'body';
  required?: boolean;
  schema?: {
    type?: string;
    format?: string;
    default?: unknown;
  };
  description?: string;
}

interface OpenApiOperation {
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: {
      'application/json'?: {
        schema?: Record<string, unknown>;
      };
    };
    required?: boolean;
  };
  tags?: string[];
}

interface OpenApiPath {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  delete?: OpenApiOperation;
  patch?: OpenApiOperation;
}

interface OpenApiSpec {
  paths: Record<string, OpenApiPath>;
  info?: {
    title?: string;
    version?: string;
  };
}

export interface ParsedEndpoint {
  path: string;
  method: string;
  summary: string;
  description?: string;
  parameters: Array<{
    name: string;
    in: string;
    required: boolean;
    type: string;
    description?: string;
    default?: unknown;
  }>;
  requestBody?: {
    required: boolean;
    schema?: Record<string, unknown>;
  };
  tags?: string[];
}

function parseOpenApiSpec(spec: OpenApiSpec): ParsedEndpoint[] {
  const endpoints: ParsedEndpoint[] = [];

  for (const [path, methods] of Object.entries(spec.paths)) {
    // Skip excluded paths
    if (EXCLUDED_PATTERNS.some(pattern => pattern.test(path))) {
      continue;
    }

    const httpMethods = ['get', 'post', 'put', 'delete', 'patch'] as const;

    for (const method of httpMethods) {
      const operation = methods[method];
      if (!operation) continue;

      const parameters = (operation.parameters || []).map(param => ({
        name: param.name,
        in: param.in,
        required: param.required ?? false,
        type: param.schema?.type || 'string',
        description: param.description,
        default: param.schema?.default,
      }));

      // Handle request body
      let requestBody: ParsedEndpoint['requestBody'];
      if (operation.requestBody) {
        requestBody = {
          required: operation.requestBody.required ?? false,
          schema: operation.requestBody.content?.['application/json']?.schema,
        };
      }

      endpoints.push({
        path,
        method: method.toUpperCase(),
        summary: operation.summary || `${method.toUpperCase()} ${path}`,
        description: operation.description,
        parameters,
        requestBody,
        tags: operation.tags,
      });
    }
  }

  // Sort by path, then by method
  return endpoints.sort((a, b) => {
    const pathCompare = a.path.localeCompare(b.path);
    if (pathCompare !== 0) return pathCompare;
    return a.method.localeCompare(b.method);
  });
}

/**
 * GET /api/openapi/[worker]
 * Fetches and parses OpenAPI spec from a worker service
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ worker: string }> }
) {
  try {
    const { worker } = await params;

    const baseUrl = WORKER_URLS[worker];
    if (!baseUrl) {
      return NextResponse.json(
        { error: `Unknown worker: ${worker}. Available: ${Object.keys(WORKER_URLS).join(', ')}` },
        { status: 404 }
      );
    }

    const swaggerUrl = `${baseUrl}/swagger/v1/swagger.json`;

    const response = await fetch(swaggerUrl, {
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch OpenAPI spec from ${worker}: ${response.status}` },
        { status: 502 }
      );
    }

    const spec: OpenApiSpec = await response.json();
    const endpoints = parseOpenApiSpec(spec);

    return NextResponse.json({
      worker,
      title: spec.info?.title || worker,
      version: spec.info?.version || 'unknown',
      endpoints,
    });
  } catch (error) {
    console.error("GET /api/openapi/[worker] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch OpenAPI spec" },
      { status: 500 }
    );
  }
}
