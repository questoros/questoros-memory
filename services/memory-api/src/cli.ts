import { buildApp, startApp, stopApp } from './app.js';

async function main() {
  const app = await buildApp({
    host: process.env.MEMORY_API_HOST || '127.0.0.1',
    port: parseInt(process.env.MEMORY_API_PORT || '8787', 10),
    logLevel: process.env.MEMORY_API_LOG_LEVEL || 'info',
    bodyLimit: parseInt(process.env.MEMORY_API_BODY_LIMIT_BYTES || '262144', 10),
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await stopApp(app);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await startApp(app);
}

main().catch((err) => {
  console.error('Failed to start Memory API:', err);
  process.exit(1);
});
