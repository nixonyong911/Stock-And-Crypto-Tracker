import http from "node:http";
import { getWorkers, WorkerRegistry } from "@/lib/db/workers";
import { getScheduleMetadata } from "./registry";

export interface DiscoveredSchedule {
  id: number | null;
  name: string;
  description: string | null;
  is_enabled: boolean;
  cadence: string;
  cadence_type: string;
  interval_minutes: number | null;
  offset_minutes: number | null;
  schedule_time: string | null;
  schedule_timezone: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  trigger_endpoint: string | null;
  // Discovery metadata
  service: string;
  service_display_name: string;
  source: "worker" | "unreachable";
}

export interface WorkerSchedulesResponse {
  service: string;
  schedules: Array<{
    id?: number | null;
    name: string;
    description?: string | null;
    is_enabled: boolean;
    cadence: string;
    cadence_type: string;
    interval_minutes?: number | null;
    offset_minutes?: number | null;
    schedule_time?: string | null;
    schedule_timezone?: string | null;
    last_run_at?: string | null;
    last_run_status?: string | null;
    last_run_message?: string | null;
    trigger_endpoint?: string | null;
  }>;
}

export interface DiscoveryResult {
  schedules: DiscoveredSchedule[];
  workers: Array<{
    name: string;
    display_name: string;
    reachable: boolean;
    schedule_count: number;
  }>;
}

const PROBE_TIMEOUT_MS = 5000;

/**
 * HTTP GET using node:http to avoid WHATWG URL parser rejecting
 * Docker hostnames with dots (e.g. "data-fetcher-2.0").
 */
function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const match = url.match(/^http:\/\/([^:/]+):?(\d+)?(\/.*)?$/);
    if (!match) return reject(new Error(`Invalid URL: ${url}`));

    const [, hostname, port, path] = match;
    const req = http.get(
      { hostname, port: port ? Number(port) : 80, path: path || "/", timeout: PROBE_TIMEOUT_MS },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

async function probeWorker(
  worker: WorkerRegistry
): Promise<WorkerSchedulesResponse | null> {
  if (!worker.schedules_endpoint) return null;

  try {
    const { status, body } = await httpGet(worker.schedules_endpoint);

    if (status < 200 || status >= 300) {
      console.error(`Worker ${worker.name} schedules endpoint returned ${status}`);
      return null;
    }

    return JSON.parse(body) as WorkerSchedulesResponse;
  } catch (error) {
    console.error(`Failed to probe worker ${worker.name}:`, error);
    return null;
  }
}

/**
 * Discover all schedules by probing active workers' /schedules endpoints.
 * Workers without a schedules_endpoint are skipped.
 * Unreachable workers are reported but not hidden.
 */
export async function discoverSchedules(): Promise<DiscoveryResult> {
  const workers = await getWorkers();
  const workersWithEndpoint = workers.filter((w) => w.schedules_endpoint);

  const probeResults = await Promise.allSettled(
    workersWithEndpoint.map(async (worker) => ({
      worker,
      response: await probeWorker(worker),
    }))
  );

  const schedules: DiscoveredSchedule[] = [];
  const workerStatuses: DiscoveryResult["workers"] = [];

  for (const result of probeResults) {
    if (result.status === "rejected") continue;

    const { worker, response } = result.value;
    const reachable = response !== null;

    if (reachable && response) {
      for (const s of response.schedules) {
        const metadata = getScheduleMetadata(s.name, worker.name);

        schedules.push({
          id: s.id ?? null,
          name: s.name,
          description: s.description ?? metadata.description,
          is_enabled: s.is_enabled,
          cadence: s.cadence,
          cadence_type: s.cadence_type,
          interval_minutes: s.interval_minutes ?? null,
          offset_minutes: s.offset_minutes ?? null,
          schedule_time: s.schedule_time ?? null,
          schedule_timezone: s.schedule_timezone ?? null,
          last_run_at: s.last_run_at ?? null,
          last_run_status: s.last_run_status ?? null,
          last_run_message: s.last_run_message ?? null,
          trigger_endpoint: s.trigger_endpoint ?? null,
          service: worker.name,
          service_display_name: worker.display_name,
          source: "worker",
        });
      }
    }

    workerStatuses.push({
      name: worker.name,
      display_name: worker.display_name,
      reachable,
      schedule_count: reachable ? (response?.schedules.length ?? 0) : 0,
    });
  }

  // Add unreachable markers for workers that didn't respond
  for (const ws of workerStatuses) {
    if (!ws.reachable) {
      schedules.push({
        id: null,
        name: `${ws.display_name} (unreachable)`,
        description: `Worker ${ws.name} is not responding`,
        is_enabled: false,
        cadence: "Unknown",
        cadence_type: "unknown",
        interval_minutes: null,
        offset_minutes: null,
        schedule_time: null,
        schedule_timezone: null,
        last_run_at: null,
        last_run_status: "unreachable",
        last_run_message: null,
        trigger_endpoint: null,
        service: ws.name,
        service_display_name: ws.display_name,
        source: "unreachable",
      });
    }
  }

  return { schedules, workers: workerStatuses };
}
