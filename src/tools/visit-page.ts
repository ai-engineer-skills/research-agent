import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BrowserService } from '../services/browser.js';
import { ContentExtractor } from '../services/content-extractor.js';

export function registerVisitPageTool(
  server: McpServer,
  browserService: BrowserService,
  contentExtractor: ContentExtractor,
): void {
  server.tool(
    'visit_page',
    'Visit a URL and extract its content as clean markdown. Uses browser rendering for JavaScript-heavy sites.',
    {
      url: z.string().url().describe('URL to visit'),
      extract_links: z.boolean().optional().default(false).describe('Also return links found on page'),
    },
    async ({ url, extract_links }) => {
      const pageId = await browserService.newPage();
      try {
        await browserService.navigate(pageId, url, { waitUntil: 'networkidle' });
        const html = await browserService.getContent(pageId);
        const markdown = contentExtractor.extractMarkdown(html, url);

        let text = markdown;
        if (extract_links) {
          const links = contentExtractor.extractLinks(html, url);
          text += '\n\n---\n## Links found on page\n' + JSON.stringify(links, null, 2);
        }

        return {
          content: [{ type: 'text' as const, text }],
        };
      } finally {
        await browserService.closePage(pageId);
      }
    },
  );
}
