/**
 * Extension registry – manages the lifecycle of channel extensions.
 */

import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import type { IChannelExtension, GatewayAPI } from './types.js';

export class ExtensionRegistry {
  private readonly extensions: Map<string, IChannelExtension> = new Map();
  private readonly logger: FastifyBaseLogger;

  constructor(logger: FastifyBaseLogger) {
    this.logger = logger;
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  /** Register a channel extension. Throws if an extension with the same ID already exists. */
  register(extension: IChannelExtension): void {
    if (this.extensions.has(extension.id)) {
      throw new Error(
        `Extension "${extension.id}" is already registered`,
      );
    }

    this.extensions.set(extension.id, extension);
    this.logger.info(
      { channelId: extension.id, label: extension.meta.label },
      'Channel extension registered',
    );
  }

  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  /** Get an extension by its unique channel ID. */
  get(id: string): IChannelExtension | undefined {
    return this.extensions.get(id);
  }

  /** Get all registered extensions. */
  getAll(): IChannelExtension[] {
    return [...this.extensions.values()];
  }

  /** List the IDs of all registered channels. */
  listIds(): string[] {
    return [...this.extensions.keys()];
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start every registered extension.
   *
   * Each extension is started independently – a failure in one extension
   * does not prevent the others from starting.
   */
  async startAll(api: GatewayAPI): Promise<void> {
    const results = await Promise.allSettled(
      this.getAll().map(async (ext) => {
        await ext.start(api);
        this.logger.info({ channelId: ext.id }, 'Extension started');
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error(
          { error: result.reason },
          'Extension failed to start',
        );
      }
    }
  }

  /**
   * Stop every registered extension gracefully.
   *
   * Like {@link startAll}, each extension is stopped independently so one
   * failure doesn't block the rest.
   */
  async stopAll(): Promise<void> {
    const results = await Promise.allSettled(
      this.getAll().map(async (ext) => {
        await ext.stop();
        this.logger.info({ channelId: ext.id }, 'Extension stopped');
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error(
          { error: result.reason },
          'Extension failed to stop cleanly',
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------

  /**
   * Register HTTP routes for every extension that implements
   * {@link IChannelExtension.registerRoutes}.
   */
  registerAllRoutes(fastify: FastifyInstance): void {
    for (const ext of this.getAll()) {
      if (ext.registerRoutes) {
        ext.registerRoutes(fastify);
        this.logger.info(
          { channelId: ext.id },
          'Extension routes registered',
        );
      }
    }
  }
}
