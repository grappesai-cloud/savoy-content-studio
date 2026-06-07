// ─── Storyboard generation ────────────────────────────────────────────────────
//
// The user's idea becomes 2-3 scenes. Each scene gets: a still-image
// description (anchored, identity-locked), a MOTION prompt for image-to-video,
// a suggested official pose, and (giraffe mode) its slice of the dialogue.
//
// Uses Claude when ANTHROPIC_API_KEY is present — even while image/video run
// on mock, the creative step is real. Falls back to a deterministic template.

import { e } from '../env';
import { GIRAFFE_POSES, BACKDROPS } from './config';

export interface SceneJob {
  provider?: string;
  jobId?: string;
  url?: string | null;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  error?: string;
  // video QC: the submit params are stashed so a failed inspection can
  // resubmit the exact same job without re-deriving the prompt
  prompt?: string;
  talking?: boolean;
  retries?: number;
}

export interface StoryScene {
  n: number;
  description: string;   // still image: where the giraffe is, what the frame looks like
  motion: string;        // what MOVES in this clip (character action + camera)
  pose: string | null;   // official pose id used as identity/pose reference
  backdrop: string | null; // real hotel photo id — giraffe gets composited into it
  dialogue: string | null; // giraffe mode: this scene's line
  audioUrl?: string | null; // per-scene TTS of `dialogue` — aligned to this clip in assembly
  image: SceneJob;
  video: SceneJob;
}

export interface Storyboard { scenes: StoryScene[] }

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const POSE_IDS = GIRAFFE_POSES.map(p => p.id);
const BACKDROP_IDS = BACKDROPS.map(b => b.id);

export interface StoryboardOpts {
  mode: 'scene' | 'giraffe';
  scenePrompt: string;
  dialogue: string | null;       // null in giraffe mode → Claude WRITES the script
  characterName?: string | null; // custom character name; null/undefined = Domnul Girafă
}

export async function generateStoryboard(opts: StoryboardOpts): Promise<Storyboard> {
  const key = e('ANTHROPIC_API_KEY');
  if (key) {
    try { return await claudeStoryboard(key, opts); }
    catch (err: any) { console.error('[storyboard] Claude failed, using template:', err?.message); }
  }
  return templateStoryboard(opts);
}

async function claudeStoryboard(key: string, opts: StoryboardOpts): Promise<Storyboard> {
  const giraffe = opts.mode === 'giraffe';
  const custom = Boolean(opts.characterName);          // custom mascot: no pose pack, no Savoy backdrops
  const charName = opts.characterName ?? 'Domnul Girafă';
  const poseEnum = giraffe && !custom ? POSE_IDS : ['none'];
  const backdropEnum = giraffe && !custom ? [...BACKDROP_IDS, null] : [null];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      tool_choice: { type: 'tool', name: 'storyboard' },
      tools: [{
        name: 'storyboard',
        description: 'Return the storyboard for a 9:16 Instagram reel',
        input_schema: {
          type: 'object',
          required: ['scenes'],
          properties: {
            scenes: {
              type: 'array', minItems: 3, maxItems: 3,
              items: {
                type: 'object',
                required: ['description', 'motion', 'pose', 'backdrop', 'dialogue'],
                properties: {
                  description: { type: 'string', description: 'The STILL image: setting, framing, light. Romanian. 9:16 vertical. Do NOT describe the character design.' },
                  motion: { type: 'string', description: 'What moves in this 8s clip: ONE simple character action + subtle camera move. English, for a video model.' },
                  pose: { type: 'string', enum: poseEnum, description: 'Closest official pose for this scene' },
                  backdrop: { type: ['string', 'null'], enum: backdropEnum, description: 'Real hotel photo to place the character into, if one fits the scene; null = clean brand background' },
                  dialogue: { type: ['string', 'null'], description: giraffe
                    ? (opts.dialogue
                        ? 'This scene\'s slice of the dialogue, verbatim words from the original, split naturally.'
                        : 'This scene\'s line, written by you in Romanian: short, warm, spoken-word, 1-2 sentences in the character\'s voice.')
                    : 'null' },
                },
              },
            },
          },
        },
      }],
      messages: [{
        role: 'user',
        content: `${custom ? 'Ești regizor de conținut pentru reels de brand.' : 'Ești regizorul de conținut al hotelului Savoy Mamaia.'} Sparge ideea de mai jos într-un reel de 3 scene a câte 8 secunde (total 24s), pentru Instagram 9:16.${giraffe
  ? ` Personajul este mascota ${charName} (designul e fix, NU îl descrie).${opts.dialogue
      ? ' Împarte replica EXACT pe scene, cuvintele originale, fără să adaugi text.'
      : ` SCRIE TU replica personajului, în română: ton cald, vorbit, cu personalitate, 1-2 propoziții scurte pe scenă (total ~50-70 de cuvinte = 20-25s de vorbire). Replica e despre IDEEA de mai jos, la persoana întâi, ca și cum ${charName} vorbește cu publicul.`}`
  : ' Fără personaje, doar atmosfera hotelului (plajă, piscină, restaurant, apus).'}

IDEE: ${opts.scenePrompt}
${giraffe && opts.dialogue ? `REPLICA INTEGRALĂ: ${opts.dialogue}` : ''}
${custom ? '' : `
FUNDALURI REALE DISPONIBILE (fotografii adevărate din hotel, personajul poate fi plasat în ele): receptie = recepția elegantă cu marmură verde, receptie-wide = lobby-ul larg, loc-de-joaca = locul de joacă gonflabil de pe plajă. Folosește-le când scena se potrivește (ex: bun venit → receptie, distracție copii → loc-de-joaca); null pentru fundal curat de brand.
`}
Reguli: scena 1 e hook-ul (cea mai spectaculoasă), scena 3 închide cu CTA vizual. O singură acțiune pe scenă, dar AMPLĂ și dinamică: personajul traversează cadrul, pășește spre cameră, dansează, se rotește — niciodată static. Camera mereu în mișcare lentă (tracking lateral, orbit, push-in/pull-back) și mereu la distanță: personajul întreg în cadru, fără close-up.`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const tool = data.content?.find((c: any) => c.type === 'tool_use');
  if (!tool?.input?.scenes) throw new Error('No storyboard in response');

  return {
    scenes: tool.input.scenes.slice(0, 3).map((s: any, i: number): StoryScene => ({
      n: i + 1,
      description: String(s.description ?? ''),
      motion: String(s.motion ?? ''),
      pose: giraffe && !custom && POSE_IDS.includes(s.pose) ? s.pose : null,
      backdrop: giraffe && !custom && BACKDROP_IDS.includes(s.backdrop) ? s.backdrop : null,
      dialogue: opts.mode === 'giraffe' ? (s.dialogue ? String(s.dialogue) : null) : null,
      image: { status: 'pending' },
      video: { status: 'pending' },
    })),
  };
}

function templateStoryboard(opts: StoryboardOpts): Storyboard {
  const giraffe = opts.mode === 'giraffe';
  const custom = Boolean(opts.characterName);
  const charName = opts.characterName ?? 'Domnul Girafă';
  // Split dialogue roughly in three at sentence boundaries; without a dialogue
  // (and without a Claude key) fall back to a generic three-line script.
  const parts = giraffe
    ? splitInThree(opts.dialogue ?? `Salutare, eu sunt ${charName}! ${opts.scenePrompt}. Vă aștept cu drag, pe curând!`)
    : [null, null, null];
  const poses = giraffe && !custom ? ['walk', 'selfie', 'dance'] : [null, null, null];
  const beats = [
    { d: `${opts.scenePrompt}, cadru larg de deschidere, lumină aurie`, m: giraffe ? 'The cartoon giraffe walks toward the camera, friendly. Slow push-in. Flat 2D cartoon character, design unchanged.' : 'Slow cinematic push-in, golden light, gentle water movement.' },
    { d: `${opts.scenePrompt}, cadru mediu, alt unghi`, m: giraffe ? 'The cartoon giraffe gestures while talking, relaxed. Camera static. Design unchanged.' : 'Lateral dolly, soft parallax, ambient motion.' },
    { d: `${opts.scenePrompt}, cadru de final cu energie, apus`, m: giraffe ? 'The cartoon giraffe does a small happy dance. Slow pull-back. Design unchanged.' : 'Slow pull-back reveal at sunset.' },
  ];
  return {
    scenes: beats.map((b, i): StoryScene => ({
      n: i + 1,
      description: b.d,
      motion: b.m,
      pose: poses[i],
      backdrop: null,
      dialogue: parts[i],
      image: { status: 'pending' },
      video: { status: 'pending' },
    })),
  };
}

// Simple flow: ONE continuous spoken text → scenes of ≤ ~90 chars each
// (≈ 4.5s of Romanian TTS at the locked voice settings, fits a 5s Kling clip
// with the 120ms lead + tail). Splits at sentence boundaries, packs greedily.
export function rebuildScenesFromText(text: string, base?: Partial<StoryScene>): Storyboard {
  const MAX = 90;
  const sentences = text.match(/[^.!?]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) ?? [text.trim()];
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur.length + 1 + s.length) > MAX) { chunks.push(cur); cur = s; }
    else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) chunks.push(cur);
  return {
    scenes: chunks.map((dialogue, i): StoryScene => ({
      n: i + 1,
      description: base?.description ?? 'Același cadru pe toată durata reelului',
      motion: 'The cartoon giraffe speaks to the camera. Flat 2D cartoon character, design unchanged.',
      pose: base?.pose ?? 'walk',
      backdrop: base?.backdrop ?? null,
      dialogue,
      image: { status: 'pending' },
      video: { status: 'pending' },
    })),
  };
}

function splitInThree(text: string): (string | null)[] {
  const sentences = text.match(/[^.!?]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) ?? [text];
  if (sentences.length <= 3) {
    return [sentences[0] ?? null, sentences[1] ?? null, sentences[2] ?? null];
  }
  const per = Math.ceil(sentences.length / 3);
  return [
    sentences.slice(0, per).join(' '),
    sentences.slice(per, per * 2).join(' '),
    sentences.slice(per * 2).join(' '),
  ];
}
