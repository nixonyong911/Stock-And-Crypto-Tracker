/**
 * Extension loader – discovers and registers built-in channel extensions.
 *
 * Currently hard-codes the Telegram extension; this can be evolved into a
 * dynamic directory scanner once more channels are added.
 */

import type { FastifyBaseLogger } from 'fastify';
import type { ExtensionRegistry } from './registry.js';

export async function loadExtensions(
  registry: ExtensionRegistry,
  logger: FastifyBaseLogger,
): Promise<void> {
  // --- Telegram ---------------------------------------------------------
  try {
    const modulePath = '../extensions/telegram/index.js';
    const { createTelegramExtension } = await import(modulePath);
    const telegram = createTelegramExtension();
    registry.register(telegram);
    logger.info({ channelId: telegram.id }, 'Extension loaded');
  } catch (error: unknown) {
    logger.warn(
      { error },
      'Failed to load telegram extension (may not be implemented yet)',
    );
  }

  // --- Add more built-in channels here as they are implemented ----------
  // try {
  //   const { createDiscordExtension } = await import(
  //     '../extensions/discord/index.js'
  //   );
  //   const discord = createDiscordExtension();
  //   registry.register(discord);
  //   logger.info({ channelId: discord.id }, 'Extension loaded');
  // } catch (error: unknown) {
  //   logger.warn(
  //     { error },
  //     'Failed to load discord extension (may not be implemented yet)',
  //   );
  // }
}
