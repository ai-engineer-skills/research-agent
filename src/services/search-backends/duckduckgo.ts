import { SearchEngine, SearchResult } from 'agent-toolkit/services/search-engine';
import { BrowserService } from '../browser.js';
import { createLogger } from 'agent-toolkit/logger';

const log = createLogger('duckduckgo');

export class DuckDuckGoSearchEngine implements SearchEngine {
  public readonly name = 'duckduckgo';
  private browserService: BrowserService;

  constructor(browserService: BrowserService) {
    this.browserService = browserService;
  }

  async search(query: string, numResults = 10): Promise<SearchResult[]> {
    log.info('Searching', { query, numResults });
    const start = Date.now();
    const pageId = await this.browserService.newPage();
    try {
      await this.browserService.navigate(pageId, 'https://duckduckgo.com', {
        waitUntil: 'domcontentloaded',
      });

      const page = await this.browserService.getPage(pageId);
      await page.fill('input[name="q"]', query);
      await page.keyboard.press('Enter');

      // Wait for results to appear — try multiple known selectors
      const resultSelectors = ['.results .result', '[data-result]', 'article'];
      let matchedSelector: string | null = null;

      for (const sel of resultSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 10000 });
          matchedSelector = sel;
          log.debug('Matched result selector', { selector: sel });
          break;
        } catch {
          log.debug('Selector not found, trying next', { selector: sel });
        }
      }

      let results: SearchResult[];

      if (matchedSelector) {
        results = await page.$$eval(matchedSelector, (elements) => {
          return elements.map((el) => {
            const anchor = el.querySelector('a[href]') as HTMLAnchorElement | null;
            const title =
              el.querySelector('h2')?.textContent?.trim() ??
              anchor?.textContent?.trim() ??
              '';
            const href = anchor?.href ?? '';
            const snippet =
              el.querySelector('.snippet, .result__snippet, p')?.textContent?.trim() ??
              el.textContent?.trim() ??
              '';
            return { title, url: href, snippet };
          });
        });
      } else {
        // Fallback: extract from all anchor elements
        results = await page.$$eval('a[href]', (anchors) => {
          return anchors
            .filter((a) => {
              const href = (a as HTMLAnchorElement).href;
              return (
                href.startsWith('http') &&
                !href.includes('duckduckgo.com') &&
                a.textContent?.trim()
              );
            })
            .map((a) => ({
              title: a.textContent?.trim() ?? '',
              url: (a as HTMLAnchorElement).href,
              snippet: '',
            }));
        });
      }

      // Filter out empty results and limit
      const filtered = results
        .filter((r) => r.title && r.url)
        .slice(0, numResults);

      log.info('Search complete', { query, resultsFound: filtered.length, durationMs: Date.now() - start });
      return filtered;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('Search failed', { query, error: message, durationMs: Date.now() - start });
      throw new Error(`DuckDuckGo search failed for "${query}": ${message}`);
    } finally {
      await this.browserService.closePage(pageId);
    }
  }
}
