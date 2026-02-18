# Deep Research Agent

> Browser-powered deep research agent for AI coding assistants. No API keys required.

An [MCP](https://modelcontextprotocol.io/) server that gives any AI assistant the ability to search the web, read pages, take screenshots, and interact with sites — all through a real browser. Uses DuckDuckGo for search and Playwright for browser automation, so there are **zero API keys** to configure.

## Features

- 🔍 **Browser-based web search** — DuckDuckGo via Playwright, no API keys needed
- 📄 **Full page content extraction** — JavaScript-rendered sites converted to clean Markdown
- 📸 **Screenshots** — capture full or viewport screenshots for visual analysis
- 🖱️ **Interactive navigation** — click elements, fill forms, follow links
- 🔌 **Replaceable search backend** — swap DuckDuckGo for Tavily, Brave, Exa, or any search API
- 🤖 **Works with any MCP-compatible AI assistant** — Copilot CLI, Claude Code, Codex, and more

## Quick Install

### GitHub Copilot CLI

Add to your project's `.github/copilot-mcp.json` (or user-level MCP config):

```json
{
  "mcpServers": {
    "deep-research": {
      "command": "npx",
      "args": ["-y", "deep-research-agent"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add deep-research -- npx -y deep-research-agent
```

### VS Code (Copilot Chat)

Add to your VS Code `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "deep-research": {
        "command": "npx",
        "args": ["-y", "deep-research-agent"]
      }
    }
  }
}
```

### OpenAI Codex / Other MCP Hosts

Use the generic MCP server configuration:

```json
{
  "mcpServers": {
    "deep-research": {
      "command": "npx",
      "args": ["-y", "deep-research-agent"]
    }
  }
}
```

## Available Tools

### `web_search`

Search the web using DuckDuckGo. Returns titles, URLs, and snippets.

| Parameter      | Type   | Required | Default | Description              |
| -------------- | ------ | -------- | ------- | ------------------------ |
| `query`        | string | yes      | —       | Search query             |
| `num_results`  | number | no       | 10      | Number of results to return |

```json
{ "query": "Rust async runtime comparison 2025", "num_results": 5 }
```

### `visit_page`

Visit a URL and extract the page content as Markdown. Renders JavaScript before extraction.

| Parameter        | Type    | Required | Default | Description                  |
| ---------------- | ------- | -------- | ------- | ---------------------------- |
| `url`            | string  | yes      | —       | URL to visit                 |
| `extract_links`  | boolean | no       | false   | Also return an array of links |

```json
{ "url": "https://docs.rust-lang.org/book/", "extract_links": true }
```

### `take_screenshot`

Capture a screenshot of a page as a base64-encoded PNG.

| Parameter    | Type    | Required | Default | Description                    |
| ------------ | ------- | -------- | ------- | ------------------------------ |
| `url`        | string  | yes      | —       | URL to screenshot              |
| `full_page`  | boolean | no       | false   | Capture the full scrollable page |

```json
{ "url": "https://example.com", "full_page": true }
```

### `click_element`

Click an element on an already-open page using a CSS selector.

| Parameter   | Type   | Required | Description                    |
| ----------- | ------ | -------- | ------------------------------ |
| `page_id`   | string | yes      | ID of an open page             |
| `selector`  | string | yes      | CSS selector of the element    |

```json
{ "page_id": "a1b2c3", "selector": "button.submit" }
```

### `get_page_links`

Extract all links from an open page.

| Parameter | Type   | Required | Description        |
| --------- | ------ | -------- | ------------------ |
| `page_id` | string | yes      | ID of an open page |

### `list_open_pages`

List all currently open browser pages. Takes no parameters.

### `close_page`

Close a browser page.

| Parameter | Type   | Required | Description          |
| --------- | ------ | -------- | -------------------- |
| `page_id` | string | yes      | ID of the page to close |

## Available Prompts

### `deep-research`

A guided research workflow template that instructs the assistant to perform iterative, multi-source research with built-in citation tracking and verification.

| Parameter | Type   | Required | Default    | Description                                                  |
| --------- | ------ | -------- | ---------- | ------------------------------------------------------------ |
| `topic`   | string | yes      | —          | The research topic or question                               |
| `depth`   | string | no       | `standard` | Research depth: `quick` (3 sub-questions), `standard` (5), or `deep` (7) |

The prompt guides the assistant through a structured workflow:

1. **Decompose** the topic into sub-questions
2. **Search** for each sub-question
3. **Extract** content from the most relevant results
4. **Cross-reference** findings across sources
5. **Fill gaps** with follow-up searches
6. **Synthesize** findings into a coherent answer
7. **Report** with inline citations and a source list

## Architecture

```
src/
├── index.ts                    # Entry point (stdio transport)
├── server.ts                   # MCP server initialization
├── tools/                      # MCP tool definitions
│   ├── web-search.ts
│   ├── visit-page.ts
│   ├── take-screenshot.ts
│   └── page-actions.ts         # click, links, list, close
├── prompts/
│   └── research-workflow.ts    # deep-research prompt
└── services/
    ├── browser.ts              # Playwright browser management
    ├── search-engine.ts        # SearchEngine interface
    ├── content-extractor.ts    # HTML → Markdown extraction
    └── search-backends/
        └── duckduckgo.ts       # Default search implementation
```

The codebase follows a layered architecture:

- **Services** — core capabilities (browser automation, search, content extraction)
- **Tools** — thin MCP tool registrations that delegate to services
- **Prompts** — reusable research workflow templates
- **Search backends** — pluggable search engine implementations behind a common interface

## Custom Search Backend

The search backend is replaceable. Implement the `SearchEngine` interface to use any search API:

```typescript
import { SearchEngine, SearchResult } from './services/search-engine.js';

class MyCustomSearch implements SearchEngine {
  name = 'my-search';

  async search(query: string, numResults?: number): Promise<SearchResult[]> {
    // Call your preferred search API (Tavily, Brave, Exa, etc.)
    const response = await fetch(`https://api.example.com/search?q=${query}`);
    const data = await response.json();

    return data.results.map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    }));
  }
}
```

## Development

```bash
git clone <repo-url>
cd agent_mobile
npm install
npm run build
npm start
```

| Script          | Description                              |
| --------------- | ---------------------------------------- |
| `npm run build` | Compile TypeScript to `dist/`            |
| `npm start`     | Start the MCP server (stdio transport)   |
| `npm run dev`   | Build in watch mode for development      |

## Requirements

- **Node.js** ≥ 18
- **Chromium** — auto-installed by Playwright during `npm install`

## License

MIT
