import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerRequest, ServerNotification } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { LLMService } from '../services/llm-provider.js';
import { SearchService } from '../services/search-engine.js';
import { BrowserService } from '../services/browser.js';
import { ContentExtractor } from '../services/content-extractor.js';
import { CheckpointService } from '../services/checkpoint.js';
import type { SubQuestion, SearchHit, Finding, CheckpointState } from '../types/research.js';
import { createLogger } from '../logger.js';

const log = createLogger('tool:deep_research');

const MAX_PAGE_CHARS = 20_000;

type Depth = 'quick' | 'standard' | 'deep';

const MAX_GAP_ROUNDS: Record<Depth, number> = {
  quick: 1,
  standard: 2,
  deep: 3,
};

const TOTAL_STEPS = 7;

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/** Send an MCP progress notification if the client provided a progressToken. */
async function sendProgress(
  extra: ToolExtra,
  step: number,
  message: string,
): Promise<void> {
  const progressToken = extra._meta?.progressToken;
  if (progressToken === undefined) return;
  try {
    await extra.sendNotification({
      method: 'notifications/progress',
      params: { progressToken, progress: step, total: TOTAL_STEPS, message },
    });
  } catch {
    log.debug('Failed to send progress notification', { step, message });
  }
}

/** Send an MCP logging message for troubleshooting. */
async function sendLog(
  server: McpServer,
  level: 'debug' | 'info' | 'warning' | 'error',
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    await server.sendLoggingMessage({
      level,
      logger: 'deep_research',
      data: { message, ...data },
    });
  } catch {
    // Logging failures should never break the research flow
    log.debug('Failed to send MCP log message', { message });
  }
}

function tryParseJSON<T>(text: string): T | null {
  // Try to extract JSON from markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}

export function registerDeepResearchTool(
  server: McpServer,
  llmService: LLMService,
  searchService: SearchService,
  browserService: BrowserService,
  contentExtractor: ContentExtractor,
  checkpointService: CheckpointService,
): void {
  server.tool(
    'deep_research',
    'Perform autonomous deep research on a topic. The server internally decomposes the question, searches, extracts content, cross-references findings, fills gaps, and produces a structured report with citations. Requires an LLM provider to be configured.',
    {
      topic: z.string().describe('The research topic or question'),
      depth: z.enum(['quick', 'standard', 'deep']).optional().default('standard').describe('Research depth: quick (fewer searches), standard, or deep (more thorough)'),
      sessionId: z.string().uuid().optional().describe('Optional session ID to resume a previously interrupted research session'),
    },
    async ({ topic, depth, sessionId }, extra) => {
      const isResume = !!sessionId;
      let state: CheckpointState;

      if (isResume) {
        // Resume from checkpoint
        const loaded = await checkpointService.load(sessionId!);
        if (!loaded) {
          return {
            content: [{ type: 'text' as const, text: `No valid checkpoint found for session ${sessionId}. Start a fresh research session without a sessionId.` }],
            isError: true,
          };
        }
        if (loaded.topic !== topic) {
          return {
            content: [{ type: 'text' as const, text: `Topic mismatch: checkpoint has "${loaded.topic}" but request has "${topic}". Use the original topic or start a new session.` }],
            isError: true,
          };
        }
        state = loaded;
        log.info('Resuming deep research', { sessionId, topic, depth, fromStep: state.lastCompletedStep + 1 });
        await sendLog(server, 'info', 'Resuming deep research from checkpoint', {
          sessionId, topic, depth, lastCompletedStep: state.lastCompletedStep,
        });
      } else {
        // Fresh session
        const newId = randomUUID();
        state = {
          version: 1,
          sessionId: newId,
          topic,
          depth,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastCompletedStep: 0,
          visitedUrls: [],
        };
        log.info('Starting deep research', { sessionId: newId, topic, depth });
        await sendLog(server, 'info', 'Starting deep research', { sessionId: newId, topic, depth });
      }

      const overallStart = Date.now();
      const visitedUrls = new Set<string>(state.visitedUrls);

      try {
        // ── Step 1: Decompose topic into sub-questions ──
        if (state.lastCompletedStep < 1) {
          log.info('Step 1: Decomposing topic');
          await sendProgress(extra, 1, 'Decomposing topic into sub-questions');
          await sendLog(server, 'info', 'Step 1: Decomposing topic into sub-questions');
          state.subQuestions = await decomposeTopic(llmService, topic, depth);
          log.info('Decomposition complete', { subQuestionCount: state.subQuestions.length });
          await sendLog(server, 'info', 'Decomposition complete', { subQuestionCount: state.subQuestions.length });
          state.lastCompletedStep = 1;
          state.visitedUrls = [...visitedUrls];
          await checkpointService.save(state.sessionId, state);
        }

        // ── Step 2: Search for each sub-question ──
        if (state.lastCompletedStep < 2) {
          log.info('Step 2: Searching');
          await sendProgress(extra, 2, `Searching for ${state.subQuestions!.length} sub-questions`);
          await sendLog(server, 'info', `Step 2: Searching for ${state.subQuestions!.length} sub-questions`);
          state.searchResults = await searchForQuestions(llmService, searchService, state.subQuestions!);
          log.info('Search complete', { totalResults: state.searchResults.length });
          await sendLog(server, 'info', 'Search complete', { totalResults: state.searchResults.length });
          state.lastCompletedStep = 2;
          state.visitedUrls = [...visitedUrls];
          await checkpointService.save(state.sessionId, state);
        }

        // ── Step 3: Extract content from top pages ──
        if (state.lastCompletedStep < 3) {
          log.info('Step 3: Extracting content');
          await sendProgress(extra, 3, `Extracting content from ${state.searchResults!.length} results`);
          await sendLog(server, 'info', `Step 3: Extracting content from ${state.searchResults!.length} search results`);
          state.findings = await extractFindings(
            llmService, browserService, contentExtractor, state.searchResults!, visitedUrls, depth,
          );
          log.info('Extraction complete', { findingsCount: state.findings.length });
          await sendLog(server, 'info', 'Extraction complete', { findingsCount: state.findings.length });
          state.lastCompletedStep = 3;
          state.visitedUrls = [...visitedUrls];
          await checkpointService.save(state.sessionId, state);
        }

        // ── Step 4: Cross-reference findings ──
        if (state.lastCompletedStep < 4) {
          log.info('Step 4: Cross-referencing');
          await sendProgress(extra, 4, `Cross-referencing ${state.findings!.length} findings`);
          await sendLog(server, 'info', `Step 4: Cross-referencing ${state.findings!.length} findings`);
          state.analysis = await crossReference(llmService, topic, state.findings!);
          log.info('Cross-reference complete');
          await sendLog(server, 'info', 'Cross-reference complete');
          state.lastCompletedStep = 4;
          state.visitedUrls = [...visitedUrls];
          await checkpointService.save(state.sessionId, state);
        }

        // ── Step 5: Fill gaps ──
        if (state.lastCompletedStep < 5) {
          log.info('Step 5: Filling gaps');
          await sendProgress(extra, 5, 'Filling knowledge gaps with additional searches');
          await sendLog(server, 'info', 'Step 5: Filling knowledge gaps');
          state.allFindings = await fillGaps(
            llmService, searchService, browserService, contentExtractor,
            topic, state.findings!, state.analysis!, visitedUrls, depth,
          );
          log.info('Gap-filling complete', { totalFindings: state.allFindings.length });
          await sendLog(server, 'info', 'Gap-filling complete', { totalFindings: state.allFindings.length });
          state.lastCompletedStep = 5;
          state.visitedUrls = [...visitedUrls];
          await checkpointService.save(state.sessionId, state);
        }

        // ── Step 6: Synthesize report ──
        if (state.lastCompletedStep < 6) {
          log.info('Step 6: Synthesizing report');
          await sendProgress(extra, 6, `Synthesizing report from ${state.allFindings!.length} findings`);
          await sendLog(server, 'info', `Step 6: Synthesizing report from ${state.allFindings!.length} findings`);
          state.report = await synthesizeReport(llmService, topic, state.allFindings!, state.analysis!);
          log.info('Report synthesized', { reportLength: state.report.length });
          state.lastCompletedStep = 6;
          state.visitedUrls = [...visitedUrls];
          await checkpointService.save(state.sessionId, state);
        }

        // ── Step 7: Done ──
        const durationMs = Date.now() - overallStart;
        await sendProgress(extra, 7, 'Research complete');
        await sendLog(server, 'info', 'Deep research complete', {
          topic,
          depth,
          sessionId: state.sessionId,
          findingsCount: state.allFindings!.length,
          pagesVisited: visitedUrls.size,
          durationMs,
        });

        log.info('Deep research complete', {
          topic,
          depth,
          sessionId: state.sessionId,
          findingsCount: state.allFindings!.length,
          pagesVisited: visitedUrls.size,
          durationMs,
        });

        // Clean up checkpoint on success
        await checkpointService.delete(state.sessionId);

        return {
          content: [{ type: 'text' as const, text: `${state.report}\n\n<!-- sessionId: ${state.sessionId} -->` }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const durationMs = Date.now() - overallStart;
        log.error('Deep research failed', { topic, sessionId: state.sessionId, error: message, durationMs });
        await sendLog(server, 'error', 'Deep research failed', { topic, sessionId: state.sessionId, error: message, durationMs });

        // Save current state so user can resume
        try {
          state.visitedUrls = [...visitedUrls];
          await checkpointService.save(state.sessionId, state);
        } catch (saveErr) {
          log.error('Failed to save checkpoint on error', {
            sessionId: state.sessionId,
            error: saveErr instanceof Error ? saveErr.message : String(saveErr),
          });
        }

        return {
          content: [{ type: 'text' as const, text: `Deep research failed: ${message}\n\nYou can resume this session by passing sessionId: "${state.sessionId}" with the same topic.` }],
          isError: true,
        };
      }
    },
  );
}

// ── Step 1: Decompose ──

async function decomposeTopic(llm: LLMService, topic: string, depth: Depth): Promise<SubQuestion[]> {
  const numQuestions = depth === 'quick' ? 3 : depth === 'standard' ? 5 : 8;

  const result = await llm.complete(
    `You are a research planning assistant. Decompose the user's research topic into ${numQuestions} specific sub-questions that together provide comprehensive coverage. For each sub-question, suggest 1-2 search queries.

Respond in JSON format:
[
  { "question": "...", "searchQueries": ["query1", "query2"] }
]`,
    `Research topic: ${topic}`,
  );

  const parsed = tryParseJSON<SubQuestion[]>(result.content);
  if (parsed && Array.isArray(parsed)) {
    return parsed;
  }

  // Fallback: use the topic itself as a single question
  log.warn('Failed to parse decomposition, using fallback');
  return [{ question: topic, searchQueries: [topic] }];
}

// ── Step 2: Search ──

async function searchForQuestions(
  _llm: LLMService,
  searchService: SearchService,
  subQuestions: SubQuestion[],
): Promise<SearchHit[]> {
  const hits: SearchHit[] = [];

  for (const sq of subQuestions) {
    for (const query of sq.searchQueries) {
      try {
        const results = await searchService.search(query, 5);
        for (const r of results) {
          hits.push({ question: sq.question, title: r.title, url: r.url, snippet: r.snippet });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn('Search query failed', { query, error: message });
      }
    }
  }

  return hits;
}

// ── Step 3: Extract ──

async function extractFindings(
  llm: LLMService,
  browserService: BrowserService,
  contentExtractor: ContentExtractor,
  searchHits: SearchHit[],
  visitedUrls: Set<string>,
  depth: Depth,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const maxPages = depth === 'quick' ? 5 : depth === 'standard' ? 10 : 20;

  // Deduplicate URLs and limit
  const uniqueHits: SearchHit[] = [];
  const seenUrls = new Set<string>();
  for (const hit of searchHits) {
    if (!seenUrls.has(hit.url)) {
      seenUrls.add(hit.url);
      uniqueHits.push(hit);
    }
  }

  const toVisit = uniqueHits.slice(0, maxPages);

  for (const hit of toVisit) {
    if (visitedUrls.has(hit.url)) continue;
    visitedUrls.add(hit.url);

    const pageId = await browserService.newPage();
    try {
      await browserService.navigate(pageId, hit.url, { waitUntil: 'load' });
      const html = await browserService.getContent(pageId);
      let markdown = contentExtractor.extractMarkdown(html, hit.url, MAX_PAGE_CHARS);

      if (markdown.length > MAX_PAGE_CHARS) {
        markdown = markdown.slice(0, MAX_PAGE_CHARS);
      }

      if (!markdown.trim()) {
        log.debug('Empty content, skipping', { url: hit.url });
        continue;
      }

      // Ask LLM to extract key facts
      const extraction = await llm.complete(
        `You are a fact extraction assistant. Extract the key facts relevant to the research question from the web page content below. Return a JSON array of fact strings.

Respond in JSON format:
["fact 1", "fact 2", ...]`,
        `Research question: ${hit.question}\n\nPage title: ${hit.title}\nURL: ${hit.url}\n\nContent:\n${markdown}`,
      );

      const facts = tryParseJSON<string[]>(extraction.content);
      if (facts && Array.isArray(facts) && facts.length > 0) {
        findings.push({ url: hit.url, title: hit.title, facts });
      } else {
        // Fallback: use the LLM response as a single fact
        findings.push({ url: hit.url, title: hit.title, facts: [extraction.content.slice(0, 500)] });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn('Page extraction failed', { url: hit.url, error: message });
    } finally {
      await browserService.closePage(pageId);
    }
  }

  return findings;
}

// ── Step 4: Cross-reference ──

async function crossReference(llm: LLMService, topic: string, findings: Finding[]): Promise<string> {
  const findingsSummary = findings.map((f, i) =>
    `[${i + 1}] ${f.title} (${f.url})\nFacts: ${f.facts.join('; ')}`,
  ).join('\n\n');

  const result = await llm.complete(
    `You are a research analyst. Analyze the collected findings for the given topic. Identify:
1. Points of consensus across sources
2. Conflicting information
3. Knowledge gaps that need further research

Be specific and reference source numbers [1], [2], etc.`,
    `Topic: ${topic}\n\nFindings:\n${findingsSummary}`,
  );

  return result.content;
}

// ── Step 5: Fill gaps ──

async function fillGaps(
  llm: LLMService,
  searchService: SearchService,
  browserService: BrowserService,
  contentExtractor: ContentExtractor,
  topic: string,
  existingFindings: Finding[],
  analysis: string,
  visitedUrls: Set<string>,
  depth: Depth,
): Promise<Finding[]> {
  const allFindings = [...existingFindings];
  const maxRounds = MAX_GAP_ROUNDS[depth];

  for (let round = 0; round < maxRounds; round++) {
    log.debug('Gap-filling round', { round: round + 1, maxRounds });

    // Ask LLM to generate gap-filling queries
    const gapResult = await llm.complete(
      `You are a research assistant. Based on the analysis below, identify the most important knowledge gaps and generate 1-3 search queries to fill them. If there are no significant gaps, return an empty array.

Respond in JSON format:
["query1", "query2"]`,
      `Topic: ${topic}\n\nAnalysis:\n${analysis}\n\nExisting sources: ${allFindings.length}`,
    );

    const queries = tryParseJSON<string[]>(gapResult.content);
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      log.info('No gaps identified, stopping gap-filling');
      break;
    }

    // Search and extract for gap queries
    const gapHits: SearchHit[] = [];
    for (const query of queries) {
      try {
        const results = await searchService.search(query, 3);
        for (const r of results) {
          if (!visitedUrls.has(r.url)) {
            gapHits.push({ question: query, title: r.title, url: r.url, snippet: r.snippet });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn('Gap search failed', { query, error: message });
      }
    }

    if (gapHits.length === 0) {
      log.info('No new URLs from gap search, stopping');
      break;
    }

    const newFindings = await extractFindings(
      llm, browserService, contentExtractor, gapHits, visitedUrls, 'quick',
    );
    allFindings.push(...newFindings);
  }

  return allFindings;
}

// ── Steps 6-7: Synthesize & Report ──

async function synthesizeReport(
  llm: LLMService,
  topic: string,
  findings: Finding[],
  analysis: string,
): Promise<string> {
  const sourcesBlock = findings.map((f, i) =>
    `[${i + 1}] ${f.title}\n    URL: ${f.url}\n    Key facts: ${f.facts.join('; ')}`,
  ).join('\n\n');

  const result = await llm.complete(
    `You are an expert research report writer. Produce a comprehensive, well-structured research report based on the findings and analysis provided. The report should:

1. Start with an executive summary
2. Cover each major aspect of the topic with detailed analysis
3. Note any conflicting information and explain possible reasons
4. Include inline citations using [1], [2], etc. referencing the source numbers
5. End with a "Sources" section listing all referenced URLs
6. Use markdown formatting

Write a thorough, objective report.`,
    `Topic: ${topic}\n\nCross-reference analysis:\n${analysis}\n\nAll findings:\n${sourcesBlock}`,
  );

  // Append a sources section if the LLM didn't include one
  let report = result.content;
  if (!report.toLowerCase().includes('## sources') && !report.toLowerCase().includes('## references')) {
    report += '\n\n## Sources\n\n';
    for (let i = 0; i < findings.length; i++) {
      report += `[${i + 1}] [${findings[i].title}](${findings[i].url})\n\n`;
    }
  }

  return report;
}
