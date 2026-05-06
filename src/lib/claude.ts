import Anthropic from '@anthropic-ai/sdk';

export interface ClaudeClientOptions {
  apiKey: string;
  model?: string;
}

export function createClaudeClient({ apiKey }: ClaudeClientOptions): Anthropic {
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

export const DEFAULT_MODEL = 'claude-sonnet-4-6';
