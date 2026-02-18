import { chromium, Browser, Page } from 'playwright';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../logger.js';

const log = createLogger('browser');

export interface BrowserServiceOptions {
  headless?: boolean;
}

export class BrowserService {
  private browser: Browser | null = null;
  private pages: Map<string, Page> = new Map();
  private headless: boolean;

  constructor(options?: BrowserServiceOptions) {
    this.headless = options?.headless ?? true;
  }

  async ensureBrowser(): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      log.info('Launching chromium browser', { headless: this.headless });
      this.browser = await chromium.launch({ headless: this.headless });
      log.info('Browser launched successfully');
    }
  }

  async newPage(id?: string): Promise<string> {
    await this.ensureBrowser();
    const pageId = id ?? randomUUID();
    const page = await this.browser!.newPage();
    this.pages.set(pageId, page);
    log.debug('New page created', { pageId });
    return pageId;
  }

  async getPage(id: string): Promise<Page> {
    const page = this.pages.get(id);
    if (!page) {
      log.error('Page not found', { pageId: id, activePages: this.pages.size });
      throw new Error(`Page not found: ${id}`);
    }
    return page;
  }

  async navigate(
    pageId: string,
    url: string,
    options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' },
  ): Promise<void> {
    const page = await this.getPage(pageId);
    const waitUntil = options?.waitUntil ?? 'load';
    log.info('Navigating', { pageId, url, waitUntil });
    const start = Date.now();
    await page.goto(url, { waitUntil });
    log.info('Navigation complete', { pageId, url, durationMs: Date.now() - start });
  }

  async getContent(pageId: string): Promise<string> {
    const page = await this.getPage(pageId);
    return page.content();
  }

  async getUrl(pageId: string): Promise<string> {
    const page = await this.getPage(pageId);
    return page.url();
  }

  async screenshot(
    pageId: string,
    options?: { fullPage?: boolean },
  ): Promise<Buffer> {
    const page = await this.getPage(pageId);
    const buffer = await page.screenshot({ fullPage: options?.fullPage ?? false });
    return Buffer.from(buffer);
  }

  async click(pageId: string, selector: string): Promise<void> {
    const page = await this.getPage(pageId);
    await page.click(selector);
  }

  async fill(pageId: string, selector: string, value: string): Promise<void> {
    const page = await this.getPage(pageId);
    await page.fill(selector, value);
  }

  async evaluate<T>(pageId: string, script: string): Promise<T> {
    const page = await this.getPage(pageId);
    return page.evaluate(script) as Promise<T>;
  }

  async closePage(pageId: string): Promise<void> {
    const page = this.pages.get(pageId);
    if (page) {
      await page.close();
      this.pages.delete(pageId);
      log.debug('Page closed', { pageId });
    }
  }

  async close(): Promise<void> {
    log.info('Closing browser', { activePages: this.pages.size });
    for (const [id, page] of this.pages) {
      await page.close();
      this.pages.delete(id);
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      log.info('Browser closed');
    }
  }

  async listPages(): Promise<string[]> {
    return Array.from(this.pages.keys());
  }
}
