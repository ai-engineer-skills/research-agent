import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserService } from './services/browser.js';
import { SearchService } from './services/search-engine.js';
import { DuckDuckGoSearchEngine } from './services/search-backends/duckduckgo.js';
import { ContentExtractor } from './services/content-extractor.js';
import { registerWebSearchTool } from './tools/web-search.js';
import { registerVisitPageTool } from './tools/visit-page.js';
import { registerScreenshotTool } from './tools/take-screenshot.js';
import { registerPageActionTools } from './tools/page-actions.js';
import { registerResearchPrompts } from './prompts/research-workflow.js';

let browserService: BrowserService;

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'deep-research-agent',
    version: '1.0.0',
  });

  browserService = new BrowserService();
  const searchEngine = new DuckDuckGoSearchEngine(browserService);
  const searchService = new SearchService(searchEngine);
  const contentExtractor = new ContentExtractor();

  registerWebSearchTool(server, searchService);
  registerVisitPageTool(server, browserService, contentExtractor);
  registerScreenshotTool(server, browserService);
  registerPageActionTools(server, browserService, contentExtractor);
  registerResearchPrompts(server);

  return server;
}

export function getServices(): { browserService: BrowserService } {
  return { browserService };
}
