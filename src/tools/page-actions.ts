import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BrowserService } from '../services/browser.js';
import { ContentExtractor } from '../services/content-extractor.js';
import { createLogger } from 'agent-toolkit/logger';

const log = createLogger('tool:page_actions');

export function registerPageActionTools(
  server: McpServer,
  browserService: BrowserService,
  contentExtractor: ContentExtractor,
): void {
  server.tool(
    'click_element',
    'Click an element on an open page by CSS selector. Use after visit_page to interact with pages.',
    {
      page_id: z.string().describe('ID of an open page'),
      selector: z.string().describe('CSS selector of the element to click'),
    },
    async ({ page_id, selector }) => {
      log.info('Clicking element', { page_id, selector });
      try {
        await browserService.click(page_id, selector);
        // Wait for potential navigation
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const url = await browserService.getUrl(page_id);
        const html = await browserService.getContent(page_id);
        const metadata = contentExtractor.extractMetadata(html);
        log.info('Click complete', { page_id, selector, newUrl: url });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ url, title: metadata.title }, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error('Click failed', { page_id, selector, error: message });
        return {
          content: [{ type: 'text' as const, text: `Click failed on "${selector}": ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'get_page_links',
    'Get all links from an open page. Returns array of {text, href}.',
    {
      page_id: z.string().describe('ID of an open page'),
    },
    async ({ page_id }) => {
      log.info('Getting page links', { page_id });
      try {
        const html = await browserService.getContent(page_id);
        const url = await browserService.getUrl(page_id);
        const links = contentExtractor.extractLinks(html, url);
        log.info('Links retrieved', { page_id, linkCount: links.length });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(links, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error('Get links failed', { page_id, error: message });
        return {
          content: [{ type: 'text' as const, text: `Failed to get links: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'list_open_pages',
    'List all currently open browser pages with their IDs.',
    {},
    async () => {
      const pages = await browserService.listPages();
      log.debug('Listed open pages', { count: pages.length });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(pages, null, 2) }],
      };
    },
  );

  server.tool(
    'close_page',
    'Close an open browser page.',
    {
      page_id: z.string().describe('ID of the page to close'),
    },
    async ({ page_id }) => {
      log.info('Closing page', { page_id });
      await browserService.closePage(page_id);
      return {
        content: [{ type: 'text' as const, text: `Page ${page_id} closed.` }],
      };
    },
  );
}
