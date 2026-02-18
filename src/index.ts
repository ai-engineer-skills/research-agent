#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, getServices } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  const cleanup = async () => {
    try {
      const { browserService } = getServices();
      await browserService.close();
    } catch {
      // ignore cleanup errors
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    cleanup();
  });

  await server.connect(transport);
  console.error('Deep Research Agent MCP server started.');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
