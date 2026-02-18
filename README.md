# Deep Research Agent

> Browser-powered deep research agent for AI coding assistants. No API keys required.

An [MCP](https://modelcontextprotocol.io/) server that gives any AI assistant the ability to search the web, read pages, take screenshots, and interact with sites — all through a real browser. Uses Bing for search and Playwright for browser automation, so there are **zero API keys** to configure.

## Features

- 🔍 **Browser-based web search** — Bing via Playwright (stealth user-agent), no API keys needed
- 📄 **Full page content extraction** — JavaScript-rendered sites converted to clean Markdown via Readability + Turndown
- 📸 **Screenshots** — capture full or viewport screenshots for visual analysis
- 🖱️ **Interactive navigation** — click elements, fill forms, follow links
- 🔌 **Replaceable search backend** — swap Bing for any search API by implementing the `SearchEngine` interface
- 🤖 **Works with any MCP-compatible AI assistant** — Copilot CLI, Claude Code, Codex, VS Code, and more
- 📝 **Structured logging** — all operations logged to stderr with timestamps, durations, and error context
- 🧩 **Research workflow prompt** — built-in `deep-research` prompt guides the host LLM through a complete multi-step research workflow

## Design

### How It Works

This project is an **MCP server** — it does **not** include its own LLM. Instead, it exposes browser-based research tools that a host AI assistant (Copilot CLI, Claude Code, Codex) orchestrates. The host LLM decides what to search, which pages to visit, and how to synthesize findings.

```
┌────────────────────────────────────────────────────────────┐
│  Host LLM (Copilot CLI / Claude Code / Codex)              │
│  - Decides what to search, which pages to read             │
│  - Synthesizes findings into reports                       │
│  - Uses the deep-research prompt for guided workflows      │
└──────────┬─────────────────────────────────────────────────┘
           │ MCP Protocol (stdio)
           ▼
┌────────────────────────────────────────────────────────────┐
│  Deep Research Agent (this server)                          │
│                                                            │
│  Tools Layer          Services Layer                       │
│  ┌──────────────┐    ┌──────────────────────────────────┐  │
│  │ web_search   │───▶│ SearchService                    │  │
│  │ visit_page   │    │  └─ BingSearchEngine (default)   │  │
│  │ screenshot   │───▶│  └─ DuckDuckGoEngine (alt)       │  │
│  │ click_element│    │  └─ YourCustomEngine (plug in)   │  │
│  │ get_links    │───▶│ BrowserService (Playwright)      │  │
│  │ list_pages   │    │  └─ Stealth user-agent           │  │
│  │ close_page   │    │  └─ Page lifecycle management    │  │
│  └──────────────┘    │ ContentExtractor                  │  │
│                      │  └─ Readability + Turndown        │  │
│  Prompts Layer       │  └─ JSDOM (quiet virtual console) │  │
│  ┌──────────────┐    └──────────────────────────────────┘  │
│  │deep-research │    Logger (stderr, structured JSON)      │
│  └──────────────┘                                          │
└────────────────────────────────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────────────────┐
│  Chromium (headless, auto-installed by Playwright)          │
│  └─ Bing search, page rendering, screenshots               │
└────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **MCP server, not standalone agent** | Universal compatibility — works with any MCP host (Copilot, Claude Code, Codex). The host LLM does the reasoning. |
| **Bing as default search engine** | DuckDuckGo serves CAPTCHAs to headless browsers. Google blocks by IP. Bing works reliably with a stealth user-agent. |
| **Stealth user-agent** | Search engines detect `HeadlessChrome`. We set `Chrome/131.0.0.0` + realistic viewport/locale to avoid bot detection. |
| **Replaceable search backend** | The `SearchEngine` interface lets you swap Bing for any API (Tavily, Brave, Exa) with a single class change. |
| **No LLM API dependency** | The host provides the LLM. Zero API keys, zero cost, works offline (except for web access). |
| **Readability + Turndown** | Mozilla Readability strips boilerplate, Turndown converts to Markdown — clean content for LLM consumption. |
| **Structured logging to stderr** | Stdout is reserved for MCP protocol. All logs go to stderr with `[timestamp] [LEVEL] [component] message {metadata}`. |

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

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |

## Available Tools

### `web_search`

Search the web using Bing. Returns titles, URLs, and snippets.

| Parameter      | Type   | Required | Default | Description              |
| -------------- | ------ | -------- | ------- | ------------------------ |
| `query`        | string | yes      | —       | Search query             |
| `num_results`  | number | no       | 10      | Number of results to return |

### `visit_page`

Visit a URL and extract the page content as Markdown. Renders JavaScript before extraction.

| Parameter        | Type    | Required | Default | Description                  |
| ---------------- | ------- | -------- | ------- | ---------------------------- |
| `url`            | string  | yes      | —       | URL to visit                 |
| `extract_links`  | boolean | no       | false   | Also return an array of links |

### `take_screenshot`

Capture a screenshot of a page as a base64-encoded PNG.

| Parameter    | Type    | Required | Default | Description                    |
| ------------ | ------- | -------- | ------- | ------------------------------ |
| `url`        | string  | yes      | —       | URL to screenshot              |
| `full_page`  | boolean | no       | false   | Capture the full scrollable page |

### `click_element`

Click an element on an already-open page using a CSS selector.

| Parameter   | Type   | Required | Description                    |
| ----------- | ------ | -------- | ------------------------------ |
| `page_id`   | string | yes      | ID of an open page             |
| `selector`  | string | yes      | CSS selector of the element    |

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

## Project Structure

```
src/
├── index.ts                        # Entry point — shebang, stdio transport, signal handlers
├── server.ts                       # MCP server wiring — creates services, registers tools/prompts
├── logger.ts                       # Structured logger (stderr, level-based, JSON metadata)
├── tools/
│   ├── web-search.ts               # web_search tool
│   ├── visit-page.ts               # visit_page tool
│   ├── take-screenshot.ts          # take_screenshot tool
│   └── page-actions.ts             # click_element, get_page_links, list_open_pages, close_page
├── prompts/
│   └── research-workflow.ts        # deep-research prompt (7-step guided workflow)
└── services/
    ├── browser.ts                  # Playwright browser lifecycle + stealth settings
    ├── search-engine.ts            # SearchEngine interface + SearchService wrapper
    ├── content-extractor.ts        # HTML → Markdown (Readability + Turndown + quiet JSDOM)
    └── search-backends/
        ├── bing.ts                 # Default — Bing search with URL redirect decoding
        └── duckduckgo.ts           # Alternative — DuckDuckGo (may CAPTCHA in some environments)
```

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

Then update `src/server.ts` to use your backend:

```typescript
const searchEngine = new MyCustomSearch();  // instead of BingSearchEngine
```

## Known Issues & Remaining Work

### Search Engine Reliability

| Engine | Status | Notes |
|--------|--------|-------|
| **Bing** (default) | ✅ Works | Reliable with stealth user-agent. URLs decoded from Bing redirects. |
| **DuckDuckGo** | ⚠️ CAPTCHAs | Serves "select all ducks" CAPTCHA to headless browsers. Kept as alternative. |
| **Google** | ❌ Blocked | Blocks headless Chrome by IP (`/sorry/` redirect). Not implemented. |

Bing may eventually start blocking headless browsers too. The replaceable backend architecture makes it easy to switch to a paid search API when needed.

### Not Yet Implemented

- **npm publish** — The package is not yet published to npm. Currently install from source. Run `npm publish` to make `npx -y deep-research-agent` work globally.
- **Parallel sub-question execution** — The `deep-research` prompt instructs the host LLM to research sequentially. Parallel tool calls depend on the host's multi-tool-call support.
- **Session persistence** — Browser pages are lost when the server restarts. No cross-session memory.
- **Token/cost budgeting** — No mechanism to limit how many pages the host LLM visits or how much content it extracts.
- **Rate limiting** — No throttling between rapid Bing searches. Heavy use may trigger Bing bot detection.
- **Authentication support** — Cannot log into sites that require authentication.
- **PDF/document extraction** — Only HTML pages are supported. PDFs, Word docs, etc. are not extracted.
- **Vector store / long-term memory** — No semantic storage of past research findings.

### Operational Notes

- **First tool call is slow (~3-8s)** — Chromium browser launch happens lazily on first use. Subsequent calls reuse the browser instance.
- **`networkidle` wait strategy** — `visit_page` and `take_screenshot` wait for network idle, which can be slow on heavy sites. Consider adding a timeout parameter.
- **Stderr logging** — All logs go to stderr (stdout is MCP protocol). Set `LOG_LEVEL=debug` for full detail, `LOG_LEVEL=error` for quiet operation.
- **JSDOM CSS warnings suppressed** — Modern CSS (`:has()`, nesting) triggers harmless `Could not parse CSS stylesheet` errors in JSDOM. These are silenced via `VirtualConsole`.

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
