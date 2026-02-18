import { SearchEngine, SearchResult } from '../search-engine.js';
import { BrowserService } from '../browser.js';

export class DuckDuckGoSearchEngine implements SearchEngine {
  public readonly name = 'duckduckgo';
  private browserService: BrowserService;

  constructor(browserService: BrowserService) {
    this.browserService = browserService;
  }

  async search(query: string, numResults = 10): Promise<SearchResult[]> {
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
          break;
        } catch {
          // selector not found, try next
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
      return results
        .filter((r) => r.title && r.url)
        .slice(0, numResults);
    } catch (error) {
      throw error;
    } finally {
      await this.browserService.closePage(pageId);
    }
  }
}
