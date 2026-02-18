export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchEngine {
  search(query: string, numResults?: number): Promise<SearchResult[]>;
  name: string;
}

export class SearchService {
  private engine: SearchEngine;

  constructor(engine: SearchEngine) {
    this.engine = engine;
  }

  async search(query: string, numResults?: number): Promise<SearchResult[]> {
    return this.engine.search(query, numResults);
  }

  getEngineName(): string {
    return this.engine.name;
  }
}
