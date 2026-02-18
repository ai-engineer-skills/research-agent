import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { createLogger } from '../logger.js';

const log = createLogger('extractor');

export class ContentExtractor {
  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
  }

  extractMarkdown(html: string, url?: string, maxLength = 50000): string {
    try {
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      let markdown: string;
      if (article && article.content) {
        markdown = this.turndown.turndown(article.content);
        log.debug('Readability extraction succeeded', { url, titleFound: article.title ?? 'none', length: markdown.length });
      } else {
        // Fallback: extract body text
        const body = dom.window.document.body;
        markdown = body?.textContent?.trim() ?? '';
        log.warn('Readability failed, falling back to body text', { url, length: markdown.length });
      }

      if (markdown.length > maxLength) {
        log.debug('Content truncated', { url, originalLength: markdown.length, maxLength });
        markdown = markdown.slice(0, maxLength);
      }

      return markdown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('Markdown extraction failed', { url, error: message });
      return '';
    }
  }

  extractLinks(html: string, baseUrl?: string): Array<{ text: string; href: string }> {
    try {
      const dom = new JSDOM(html, { url: baseUrl });
      const anchors = dom.window.document.querySelectorAll('a[href]');
      const links: Array<{ text: string; href: string }> = [];

      for (const anchor of anchors) {
        const el = anchor as HTMLAnchorElement;
        const text = el.textContent?.trim() ?? '';
        let href = el.getAttribute('href') ?? '';

        // Resolve relative URLs
        if (baseUrl && href && !href.startsWith('http') && !href.startsWith('//')) {
          try {
            href = new URL(href, baseUrl).href;
          } catch {
            // leave href as-is if URL construction fails
          }
        }

        links.push({ text, href });
      }

      return links;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('Link extraction failed', { baseUrl, error: message });
      return [];
    }
  }

  extractMetadata(html: string): { title: string; description: string; author: string } {
    try {
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      const title = doc.querySelector('title')?.textContent?.trim() ?? '';

      const descriptionMeta =
        doc.querySelector('meta[name="description"]')?.getAttribute('content') ??
        doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ??
        '';

      const author =
        doc.querySelector('meta[name="author"]')?.getAttribute('content') ??
        doc.querySelector('meta[property="article:author"]')?.getAttribute('content') ??
        '';

      return { title, description: descriptionMeta, author };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('Metadata extraction failed', { error: message });
      return { title: '', description: '', author: '' };
    }
  }
}
