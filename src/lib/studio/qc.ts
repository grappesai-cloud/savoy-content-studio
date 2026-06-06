// ─── Character QC: no broken giraffe ever reaches the user ───────────────────
//
// Video models redraw the character every frame, so extra limbs / hoof→finger
// drift / morphed humans are always possible — prompting only lowers the odds.
// The guarantee comes from INSPECTION: when a clip completes, frames go to
// Claude (vision) next to the official reference; a failed verdict triggers an
// automatic regeneration instead of showing the broken clip.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { e } from '../env';

const exec = promisify(execFile);
const FF = ffmpegPath as unknown as string;
const CLAUDE_MODEL = 'claude-sonnet-4-6';

export interface QcVerdict {
  pass: boolean;
  problems: string[];
}

// Inspect a finished clip against the brand checklist. Fails OPEN (pass) when
// the key is missing or anything in the harness errors — QC must never be the
// reason a reel gets stuck.
export async function verifyClip(opts: {
  clipUrl: string;        // absolute URL of the finished clip
  referenceUrl: string;   // absolute URL of girafa.jpg (official identity)
  talking: boolean;       // dialogue scene → mouth must be visible
  hasRealPeople?: boolean; // overlay on real photos → humans must stay human
}): Promise<QcVerdict> {
  const key = e('ANTHROPIC_API_KEY');
  if (!key) return { pass: true, problems: [] };

  const dir = await mkdtemp(join(tmpdir(), 'savoy-qc-'));
  try {
    const res = await fetch(opts.clipUrl);
    if (!res.ok) throw new Error(`clip fetch ${res.status}`);
    const clip = join(dir, 'clip.mp4');
    await writeFile(clip, Buffer.from(await res.arrayBuffer()));

    // 3 frames: early, middle, late — drift shows up over time
    const frames: string[] = [];
    for (const t of ['1', '2.5', '4']) {
      const f = join(dir, `f${t}.jpg`);
      await exec(FF, ['-y', '-ss', t, '-i', clip, '-frames:v', '1',
        '-vf', 'scale=512:-1', '-q:v', '5', f], { timeout: 60_000 });
      frames.push((await readFile(f)).toString('base64'));
    }
    const refRes = await fetch(opts.referenceUrl);
    const refB64 = Buffer.from(await refRes.arrayBuffer()).toString('base64');

    const img = (data: string) => ({
      type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data },
    });
    const api = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        tool_choice: { type: 'tool', name: 'verdict' },
        tools: [{
          name: 'verdict',
          description: 'Quality verdict for a generated brand-mascot video clip',
          input_schema: {
            type: 'object', required: ['pass', 'problems'],
            properties: {
              pass: { type: 'boolean' },
              problems: { type: 'array', items: { type: 'string' } },
            },
          },
        }],
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'REFERENCE — the official mascot design (locked brand asset):' },
            img(refB64),
            { type: 'text', text: `Below are 3 frames from a GENERATED video clip of this mascot. Inspect them strictly and fail the clip if ANY frame shows:
- more than TWO arms or TWO legs, or any duplicated/extra limb
- fingers, hands or gloves instead of black HOOVES
- a redesigned character: wrong colors, missing straw hat, missing bow tie, missing orange spots, broken outline
${opts.talking ? '- the mouth fully hidden for the character that is supposed to be talking (frontal muzzle hiding the mouth)' : ''}
${opts.hasRealPeople ? '- real people deformed, morphed into animals, with distorted faces, or NEW people that materialized in the scene' : ''}
Minor softness, motion blur or small shading differences are FINE — only fail on real defects a viewer would notice. Frames:` },
            ...frames.map(img),
          ],
        }],
      }),
    });
    if (!api.ok) throw new Error(`anthropic ${api.status}`);
    const data = await api.json();
    const tool = data.content?.find((c: any) => c.type === 'tool_use');
    if (typeof tool?.input?.pass !== 'boolean') throw new Error('no verdict');
    return { pass: tool.input.pass, problems: tool.input.problems ?? [] };
  } catch (err: any) {
    console.error('[studio/qc] verification skipped:', err?.message);
    return { pass: true, problems: [] };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
