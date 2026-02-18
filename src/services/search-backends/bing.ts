import { SearchEngine, SearchResult } from '../search-engine.js';
import { BrowserService } from '../browser.js';
import { createLogger } from '../../logger.js';

const log = createLogger('bing');

/**
 * Decode Bing redirect URLs to extract the real destination URL.
 * Bing wraps results in /ck/a?...&u=a1<base64url>...&ntb=1
 */
function decodeBingUrl(bingUrl: string): string {
  try {
    const url = new URL(bingUrl);
    const encoded = url.searchParams.get('u');
    if (!encoded) return bingUrl;

    // Strip the 'a1' prefix Bing adds before the base64 payload
    const base64 = encoded.startsWith('a1') ? encoded.slice(2) : encoded;
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    // Validate it looks like a URL
    if (decoded.startsWith('http')) return decoded;
    return bingUrl;
  } catch {
    return bingUrl;
  }
}

export class BingSearchEngine implements SearchEngine {
  public readonly name = 'bing';
  private browserService: BrowserService;

  constructor(browserService: BrowserService) {
    this.browserService = browserService;
  }

  async search(query: string, numResults = 10): Promise<SearchResult[]> {
    log.info('Searching', { query, numResults });
    const start = Date.now();
    const pageId = await this.browserService.newPage();
    try {
      const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${numResults}`;
      await this.browserService.navigate(pageId, searchUrl, {
        waitUntil: 'domcontentloaded',
      });

      const page = await this.browserService.getPage(pageId);

      // Wait for results container
      try {
        await page.waitForSelector('#b_results', { timeout: 10000 });
      } catch {
        log.warn('Results container not found, page may be blocked');
        const currentUrl = page.url();
        log.warn('Current URL', { url: currentUrl });
      }

      // Extract results from Bing's standard layout
      const rawResults = await page.$$eval('#b_results .b_algo', (elements) => {
        return elements.map((el) => {
          const anchor = el.querySelector('h2 a') as HTMLAnchorElement | null;
          const title = anchor?.textContent?.trim() ?? '';
          const href = anchor?.href ?? '';
          const snippet =
            el.querySelector('.b_caption p')?.textContent?.trim() ??
            el.querySelector('.b_caption')?.textContent?.trim() ??
            '';
          return { title, url: href, snippet };
        });
      });

      // Decode Bing redirect URLs to get real destinations
      const results: SearchResult[] = rawResults
        .filter((r) => r.title && r.url)
        .slice(0, numResults)
        .map((r) => ({
          ...r,
          url: decodeBingUrl(r.url),
        }));

      log.info('Search complete', {
        query,
        resultsFound: results.length,
        durationMs: Date.now() - start,
      });
      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('Search failed', { query, error: message, durationMs: Date.now() - start });
      throw new Error(`Bing search failed for "${query}": ${message}`);
    } finally {
      await this.browserService.closePage(pageId);
    }
  }
}
