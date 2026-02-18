import { LLMProvider, LLMCompletionResult } from '../llm-provider.js';
import { createLogger } from '../../logger.js';

const log = createLogger('llm:copilot');

export class CopilotLLMProvider implements LLMProvider {
  public readonly name = 'copilot';
  private client: any = null;
  private model: string;
  private githubToken: string;

  constructor(options?: { githubToken?: string; model?: string }) {
    this.githubToken =
      options?.githubToken ??
      process.env.COPILOT_GITHUB_TOKEN ??
      process.env.GITHUB_TOKEN ??
      process.env.GH_TOKEN ??
      '';
    this.model = options?.model ?? process.env.LLM_MODEL ?? 'gpt-4o';
  }

  async initialize(): Promise<void> {
    let CopilotClient: any;
    try {
      // Dynamic import — package is optional
      const sdk = await (Function('return import("@github/copilot-sdk")')() as Promise<any>);
      CopilotClient = sdk.CopilotClient;
    } catch {
      throw new Error(
        'Failed to load @github/copilot-sdk. Install it with: npm install @github/copilot-sdk',
      );
    }

    const clientOptions: Record<string, unknown> = {};
    if (this.githubToken) {
      clientOptions.githubToken = this.githubToken;
    }

    this.client = new CopilotClient(clientOptions);
    await this.client.start();
    log.info('Copilot client started', { model: this.model });
  }

  async dispose(): Promise<void> {
    if (this.client) {
      await this.client.stop();
      this.client = null;
      log.info('Copilot client stopped');
    }
  }

  async complete(systemPrompt: string, userPrompt: string): Promise<LLMCompletionResult> {
    if (!this.client) {
      throw new Error('Copilot client not initialized — call initialize() first');
    }

    const session = await this.client.createSession({
      model: this.model,
      systemMessage: { mode: 'replace', content: systemPrompt },
    });
    try {
      const response = await session.sendAndWait({ prompt: userPrompt }, 120_000);
      const content = response?.data?.content ?? '';
      return {
        content,
        model: this.model,
      };
    } finally {
      await session.destroy();
    }
  }
}
