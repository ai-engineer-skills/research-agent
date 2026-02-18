import { createLogger } from '../logger.js';

const log = createLogger('llm');

export interface LLMCompletionResult {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LLMProvider {
  name: string;
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  complete(systemPrompt: string, userPrompt: string): Promise<LLMCompletionResult>;
}

export class LLMService {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async initialize(): Promise<void> {
    log.info('Initializing LLM provider', { provider: this.provider.name });
    const start = Date.now();
    await this.provider.initialize();
    log.info('LLM provider initialized', { provider: this.provider.name, durationMs: Date.now() - start });
  }

  async dispose(): Promise<void> {
    log.info('Disposing LLM provider', { provider: this.provider.name });
    await this.provider.dispose();
    log.info('LLM provider disposed', { provider: this.provider.name });
  }

  async complete(systemPrompt: string, userPrompt: string): Promise<LLMCompletionResult> {
    log.debug('LLM completion request', {
      provider: this.provider.name,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
    });
    const start = Date.now();
    try {
      const result = await this.provider.complete(systemPrompt, userPrompt);
      log.info('LLM completion complete', {
        provider: this.provider.name,
        model: result.model,
        contentLength: result.content.length,
        usage: result.usage,
        durationMs: Date.now() - start,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('LLM completion failed', { provider: this.provider.name, error: message, durationMs: Date.now() - start });
      throw error;
    }
  }

  getProviderName(): string {
    return this.provider.name;
  }
}
