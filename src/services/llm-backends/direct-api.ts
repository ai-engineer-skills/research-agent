import { LLMProvider, LLMCompletionResult } from '../llm-provider.js';
import { createLogger } from '../../logger.js';

const log = createLogger('llm:direct-api');

interface DirectAPIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export class DirectAPILLMProvider implements LLMProvider {
  public readonly name = 'direct-api';
  private config: DirectAPIConfig;

  constructor(config?: Partial<DirectAPIConfig>) {
    this.config = {
      apiKey: config?.apiKey ?? process.env.LLM_API_KEY ?? '',
      baseUrl: config?.baseUrl ?? process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
      model: config?.model ?? process.env.LLM_MODEL ?? 'gpt-4o',
      maxTokens: config?.maxTokens ?? parseInt(process.env.LLM_MAX_TOKENS ?? '4096', 10),
    };
  }

  async initialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('LLM_API_KEY is required for the direct API backend');
    }
    log.info('Direct API provider ready', { baseUrl: this.config.baseUrl, model: this.config.model });
  }

  async dispose(): Promise<void> {
    // Stateless HTTP — nothing to clean up
  }

  async complete(systemPrompt: string, userPrompt: string): Promise<LLMCompletionResult> {
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const body = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };

    log.debug('Calling chat completions', { url, model: this.config.model });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;

    if (!data.choices || data.choices.length === 0) {
      throw new Error('LLM API returned no choices');
    }

    return {
      content: data.choices[0].message.content,
      model: data.model,
      usage: data.usage
        ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
        : undefined,
    };
  }
}
