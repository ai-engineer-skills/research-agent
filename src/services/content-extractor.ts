import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

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
      } else {
        // Fallback: extract body text
        const body = dom.window.document.body;
        markdown = body?.textContent?.trim() ?? '';
      }

      if (markdown.length > maxLength) {
        markdown = markdown.slice(0, maxLength);
      }

      return markdown;
    } catch {
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
    } catch {
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
    } catch {
      return { title: '', description: '', author: '' };
    }
  }
}
