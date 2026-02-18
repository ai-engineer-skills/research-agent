import { chromium, Browser, Page } from 'playwright';
import { randomUUID } from 'node:crypto';

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
      this.browser = await chromium.launch({ headless: this.headless });
    }
  }

  async newPage(id?: string): Promise<string> {
    await this.ensureBrowser();
    const pageId = id ?? randomUUID();
    const page = await this.browser!.newPage();
    this.pages.set(pageId, page);
    return pageId;
  }

  async getPage(id: string): Promise<Page> {
    const page = this.pages.get(id);
    if (!page) {
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
    await page.goto(url, { waitUntil: options?.waitUntil ?? 'load' });
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
    }
  }

  async close(): Promise<void> {
    for (const [id, page] of this.pages) {
      await page.close();
      this.pages.delete(id);
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async listPages(): Promise<string[]> {
    return Array.from(this.pages.keys());
  }
}
