export interface SubQuestion {
  question: string;
  searchQueries: string[];
}

export interface SearchHit {
  question: string;
  title: string;
  url: string;
  snippet: string;
}

export interface Finding {
  url: string;
  title: string;
  facts: string[];
  content?: string;
}

export interface CheckpointState {
  version: number;
  sessionId: string;
  topic: string;
  depth: 'quick' | 'standard' | 'deep';
  createdAt: string;
  updatedAt: string;
  lastCompletedStep: number;
  visitedUrls: string[];
  subQuestions?: SubQuestion[];
  searchResults?: SearchHit[];
  findings?: Finding[];
  analysis?: string;
  allFindings?: Finding[];
  report?: string;
}
