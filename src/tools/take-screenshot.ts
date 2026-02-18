import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BrowserService } from '../services/browser.js';

export function registerScreenshotTool(server: McpServer, browserService: BrowserService): void {
  server.tool(
    'take_screenshot',
    'Take a screenshot of a web page. Returns base64-encoded PNG image.',
    {
      url: z.string().url().describe('URL to screenshot'),
      full_page: z.boolean().optional().default(false).describe('Capture full page'),
    },
    async ({ url, full_page }) => {
      const pageId = await browserService.newPage();
      try {
        await browserService.navigate(pageId, url, { waitUntil: 'networkidle' });
        const buffer = await browserService.screenshot(pageId, { fullPage: full_page });
        const base64 = buffer.toString('base64');
        return {
          content: [{ type: 'image' as const, data: base64, mimeType: 'image/png' }],
        };
      } finally {
        await browserService.closePage(pageId);
      }
    },
  );
}
