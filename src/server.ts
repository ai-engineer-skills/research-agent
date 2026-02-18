import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserService } from './services/browser.js';
import { SearchService } from './services/search-engine.js';
import { BingSearchEngine } from './services/search-backends/bing.js';
import { ContentExtractor } from './services/content-extractor.js';
import { LLMService, type LLMProvider } from './services/llm-provider.js';
import { DirectAPILLMProvider } from './services/llm-backends/direct-api.js';
import { CopilotLLMProvider } from './services/llm-backends/copilot.js';
import { registerWebSearchTool } from './tools/web-search.js';
import { registerVisitPageTool } from './tools/visit-page.js';
import { registerScreenshotTool } from './tools/take-screenshot.js';
import { registerPageActionTools } from './tools/page-actions.js';
import { registerDeepResearchTool } from './tools/deep-research.js';
import { CheckpointService } from './services/checkpoint.js';
import { registerResearchPrompts } from './prompts/research-workflow.js';
import { createLogger } from './logger.js';

const log = createLogger('server');

let browserService: BrowserService;
let llmService: LLMService | null = null;
let checkpointService: CheckpointService;

function createLLMProvider(): LLMProvider | null {
  const provider = process.env.LLM_PROVIDER?.toLowerCase();

  if (!provider) {
    return null;
  }

  switch (provider) {
    case 'openai':
      return new DirectAPILLMProvider();
    case 'copilot':
      return new CopilotLLMProvider();
    default:
      log.warn('Unknown LLM_PROVIDER value, LLM disabled', { provider });
      return null;
  }
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'research-agent',
    version: '1.0.0',
  });

  browserService = new BrowserService();
  const searchEngine = new BingSearchEngine(browserService);
  const searchService = new SearchService(searchEngine);
  const contentExtractor = new ContentExtractor();
  checkpointService = new CheckpointService(process.env.CHECKPOINT_DIR);

  registerWebSearchTool(server, searchService);
  registerVisitPageTool(server, browserService, contentExtractor);
  registerScreenshotTool(server, browserService);
  registerPageActionTools(server, browserService, contentExtractor);
  registerResearchPrompts(server);

  // Conditionally register deep_research tool when LLM is configured
  const llmProvider = createLLMProvider();
  if (llmProvider) {
    llmService = new LLMService(llmProvider);
    registerDeepResearchTool(server, llmService, searchService, browserService, contentExtractor, checkpointService);
    log.info('deep_research tool registered', { llmProvider: llmProvider.name });
  } else {
    log.info('LLM_PROVIDER not set — deep_research tool not available');
  }

  return server;
}

export function getServices(): { browserService: BrowserService; llmService: LLMService | null; checkpointService: CheckpointService } {
  return { browserService, llmService, checkpointService };
}
