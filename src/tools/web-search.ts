import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SearchService } from '../services/search-engine.js';

export function registerWebSearchTool(server: McpServer, searchService: SearchService): void {
  server.tool(
    'web_search',
    'Search the web using a browser-based search engine. Returns titles, URLs, and snippets. No API key required.',
    {
      query: z.string().describe('Search query'),
      num_results: z.number().optional().default(10).describe('Number of results to return (default 10)'),
    },
    async ({ query, num_results }) => {
      const results = await searchService.search(query, num_results);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
      };
    },
  );
}
