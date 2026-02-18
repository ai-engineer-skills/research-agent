import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BrowserService } from '../services/browser.js';
import { createLogger } from '../logger.js';

const log = createLogger('tool:screenshot');

export function registerScreenshotTool(server: McpServer, browserService: BrowserService): void {
  server.tool(
    'take_screenshot',
    'Take a screenshot of a web page. Returns base64-encoded PNG image.',
    {
      url: z.string().url().describe('URL to screenshot'),
      full_page: z.boolean().optional().default(false).describe('Capture full page'),
    },
    async ({ url, full_page }) => {
      log.info('Taking screenshot', { url, full_page });
      const start = Date.now();
      const pageId = await browserService.newPage();
      try {
        await browserService.navigate(pageId, url, { waitUntil: 'networkidle' });
        const buffer = await browserService.screenshot(pageId, { fullPage: full_page });
        const base64 = buffer.toString('base64');
        log.info('Screenshot complete', { url, sizeBytes: buffer.length, durationMs: Date.now() - start });
        return {
          content: [{ type: 'image' as const, data: base64, mimeType: 'image/png' }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error('Screenshot failed', { url, error: message, durationMs: Date.now() - start });
        return {
          content: [{ type: 'text' as const, text: `Screenshot failed for ${url}: ${message}` }],
          isError: true,
        };
      } finally {
        await browserService.closePage(pageId);
      }
    },
  );
}
