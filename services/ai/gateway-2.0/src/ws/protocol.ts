/** Client -> Server request */
export interface WSRequest {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

/** Server -> Client response */
export interface WSResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
}

/** Server -> Client event */
export interface WSEvent {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
}

export type WSMessage = WSRequest | WSResponse | WSEvent;

export function isWSRequest(msg: unknown): msg is WSRequest {
  return typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).type === 'req';
}

export function createResponse(id: string, ok: boolean, payload?: unknown, error?: string): WSResponse {
  return { type: 'res', id, ok, ...(payload !== undefined && { payload }), ...(error && { error }) };
}

export function createEvent(event: string, payload?: unknown, seq?: number): WSEvent {
  return { type: 'event', event, ...(payload !== undefined && { payload }), ...(seq !== undefined && { seq }) };
}
