import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import type { WebSocket } from 'ws';
import { isWSRequest, createResponse, createEvent } from './protocol.js';
import type { WSRequest } from './protocol.js';

export type RPCHandler = (params: unknown) => Promise<unknown>;

export class WebSocketServer {
  private readonly clients: Set<WebSocket> = new Set();
  private readonly handlers: Map<string, RPCHandler> = new Map();
  private readonly logger: FastifyBaseLogger;
  private seq = 0;

  constructor(logger: FastifyBaseLogger) {
    this.logger = logger;
  }

  /** Register an RPC method handler */
  registerMethod(method: string, handler: RPCHandler): void {
    this.handlers.set(method, handler);
  }

  /** Register the WebSocket route on Fastify */
  register(app: FastifyInstance): void {
    app.get('/ws', { websocket: true }, (socket, _request) => {
      this.clients.add(socket);
      this.logger.info({ clientCount: this.clients.size }, 'WebSocket client connected');

      socket.on('message', (data) => {
        this.handleMessage(socket, data).catch((err) => {
          this.logger.error({ err }, 'WebSocket message handling error');
        });
      });

      socket.on('close', () => {
        this.clients.delete(socket);
        this.logger.info({ clientCount: this.clients.size }, 'WebSocket client disconnected');
      });

      socket.on('error', (err) => {
        this.logger.error({ err }, 'WebSocket error');
        this.clients.delete(socket);
      });
    });
  }

  /** Broadcast an event to all connected clients */
  broadcast(event: string, payload?: unknown): void {
    const msg = JSON.stringify(createEvent(event, payload, ++this.seq));
    for (const client of this.clients) {
      try {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(msg);
        }
      } catch {
        // Client may have disconnected
      }
    }
  }

  /** Get the number of connected clients */
  get clientCount(): number {
    return this.clients.size;
  }

  private async handleMessage(socket: WebSocket, data: unknown): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      socket.send(JSON.stringify(createResponse('', false, undefined, 'Invalid JSON')));
      return;
    }

    if (!isWSRequest(parsed)) {
      socket.send(JSON.stringify(createResponse('', false, undefined, 'Expected type: req')));
      return;
    }

    const req = parsed as WSRequest;
    const handler = this.handlers.get(req.method);
    if (!handler) {
      socket.send(JSON.stringify(createResponse(req.id, false, undefined, `Unknown method: ${req.method}`)));
      return;
    }

    try {
      const result = await handler(req.params);
      socket.send(JSON.stringify(createResponse(req.id, true, result)));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      socket.send(JSON.stringify(createResponse(req.id, false, undefined, message)));
    }
  }
}
