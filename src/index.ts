#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, getServices } from './server.js';
import { setLogLevel, createLogger, type LogLevel } from './logger.js';

const log = createLogger('main');

async function main(): Promise<void> {
  // Configure log level from environment
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && ['debug', 'info', 'warn', 'error'].includes(envLevel)) {
    setLogLevel(envLevel as LogLevel);
  }

  log.info('Starting Deep Research Agent MCP server', {
    nodeVersion: process.version,
    pid: process.pid,
    logLevel: envLevel ?? 'info',
  });

  const server = createServer();
  const transport = new StdioServerTransport();

  const cleanup = async () => {
    log.info('Shutting down...');
    try {
      const { browserService } = getServices();
      await browserService.close();
      log.info('Browser closed, exiting');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('Error during cleanup', { error: message });
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  process.on('uncaughtException', (error) => {
    log.error('Uncaught exception', { error: error.message, stack: error.stack });
    cleanup();
  });

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    log.error('Unhandled promise rejection', { error: message });
  });

  await server.connect(transport);
  log.info('MCP server connected and ready');
}

main().catch((error) => {
  const log = createLogger('main');
  log.error('Failed to start server', { error: error.message, stack: error.stack });
  process.exit(1);
});
