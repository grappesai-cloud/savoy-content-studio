// Fetch-based Anthropic shim — savoy ships without @anthropic-ai/sdk (deps
// slimmed to fit the 250MB function limit with ffmpeg-static). Same surface
// the Social Lab code expects: createMessage(params) + HAIKU_MODEL, with the
// 429/529 retry loop from grappes' lib/anthropic.ts.

import { e } from './env';

export const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

interface MessageResult {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model: string;
}

export async function createMessage(params: {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: string; content: unknown }>;
}): Promise<MessageResult> {
  const key = e('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(params),
    });

    if (res.ok) return (await res.json()) as MessageResult;

    const isOverloaded = res.status === 529;
    const isRateLimit = res.status === 429;
    if ((isOverloaded || isRateLimit) && attempt < 2) {
      const wait = isRateLimit ? 15000 : (attempt + 1) * 8000;
      console.warn(`[anthropic] ${res.status}, retrying in ${wait / 1000}s (attempt ${attempt + 1}/3)`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  throw new Error('Anthropic API unreachable after retries');
}
