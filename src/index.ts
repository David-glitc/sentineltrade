import { bot } from './bot';
import { log, logError } from './utils/logger';
import { redisService } from './services/redis.service';

async function shutdown(): Promise<void> {
  try {
    log.info('Shutting down gracefully...');
    await bot.stop();
    await redisService.disconnect();
    process.exit(0);
  } catch (error) {
    logError(error as Error, 'shutdown');
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logError(error, 'uncaughtException');
  shutdown();
});

process.on('unhandledRejection', (reason) => {
  logError(reason as Error, 'unhandledRejection');
  shutdown();
});

// Start the bot
(async () => {
  try {
    log.info('Starting SentinelTrade bot...');
    await bot.start();
    log.info('Bot is running');
  } catch (error) {
    logError(error as Error, 'startup');
    await shutdown();
  }
})(); 