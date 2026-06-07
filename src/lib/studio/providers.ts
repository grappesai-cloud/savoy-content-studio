// ─── Savoy Content Studio: generation providers ──────────────────────────────
//
// All heavy generation is external (submit → jobId → poll), which keeps our
// Vercel functions short-lived. Three seams:
//   image:   text + giraffe reference image → identity-locked still (Higgsfield)
//   tts:     Romanian dialogue → mp3 (ElevenLabs — synchronous, fully specced)
//   video:   approved image (+ audio for lip-sync) → 9:16 clip (Kling / HeyGen)
//
// STUDIO_MOCK=1 (or missing keys) routes everything to deterministic mock jobs
// backed by placeholder assets in /public/studio/ — the full UX flow works
// before the sponsor's config.yaml + API keys arrive.

import { put } from '@vercel/blob';
import { e } from '../env';
import {
  STUDIO_MOCK,
  GIRAFFE_IDENTITY_LOCK,
  ELEVEN_VOICE_ID,
  ELEVEN_MODEL,
  ELEVEN_VOICE_SETTINGS,
  REEL_FORMAT,
} from './config';

export type JobStatus =
  | { state: 'pending'; progress?: number }
  | { state: 'complete'; url: string }
  | { state: 'failed'; error: string };

// ── Mock provider ─────────────────────────────────────────────────────────────
// jobId encodes its own completion time: `mock:<readyAtMs>:<kind>`. Polling is
// pure — no state, survives serverless cold starts.

const MOCK_ASSETS: Record<string, string> = {
  image: '/studio/mock-image.jpg',
  video: '/studio/mock-video.mp4',
};

function mockSubmit(kind: 'image' | 'video', delayMs: number): string {
  return `mock:${Date.now() + delayMs}:${kind}`;
}

function mockPoll(jobId: string): JobStatus {
  const [, readyAt, kind] = jobId.split(':');
  const remaining = Number(readyAt) - Date.now();
  if (remaining > 0) {
    return { state: 'pending', progress: Math.max(5, Math.min(95, 100 - Math.round(remaining / 100))) };
  }
  return { state: 'complete', url: MOCK_ASSETS[kind] ?? MOCK_ASSETS.image };
}

// ── Image generation (Higgsfield platform) ────────────────────────────────────
// Real API (verified against docs.higgsfield.ai + live probes with our key):
//   auth:   Authorization: Key {key_id}:{key_secret}
//   submit: POST https://platform.higgsfield.ai/{model_path}
//   poll:   GET  https://platform.higgsfield.ai/requests/{request_id}/status
//           → { status: queued|in_progress|completed|failed|nsfw,
//               images: [...], video: {...} }
// Model paths confirmed live: higgsfield-ai/soul/standard, reve/text-to-image,
// kling-video/v2.1/pro/image-to-video. Nano Banana's exact path comes from the
// sponsor config.yaml → override via HIGGSFIELD_IMAGE_MODEL_GIRAFFE.

const HIGGSFIELD_BASE = e('HIGGSFIELD_API_BASE') || 'https://platform.higgsfield.ai';
const IMAGE_MODEL_SCENE = e('HIGGSFIELD_IMAGE_MODEL_SCENE') || 'higgsfield-ai/soul/standard';
const IMAGE_MODEL_GIRAFFE = e('HIGGSFIELD_IMAGE_MODEL_GIRAFFE') || 'google/nano-banana';
const VIDEO_MODEL = e('HIGGSFIELD_VIDEO_MODEL') || 'kling-video/v2.1/pro/image-to-video';

function hfAuth() {
  return { Authorization: `Key ${e('HIGGSFIELD_API_KEY')}:${e('HIGGSFIELD_API_SECRET')}` };
}

async function hfSubmit(modelPath: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${HIGGSFIELD_BASE}/${modelPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...hfAuth() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Higgsfield ${modelPath} failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const id = data.request_id ?? data.id;
  if (!id) throw new Error(`Higgsfield ${modelPath}: no request_id in response`);
  return id;
}

async function hfPoll(requestId: string, kind: 'image' | 'video'): Promise<JobStatus> {
  const res = await fetch(`${HIGGSFIELD_BASE}/requests/${requestId}/status`, { headers: hfAuth() });
  if (!res.ok) return { state: 'failed', error: `Higgsfield poll failed: ${res.status}` };
  const data = await res.json();
  if (data.status === 'completed') {
    const img = Array.isArray(data.images) ? data.images[0] : null;
    const url = kind === 'video'
      ? (data.video?.url ?? data.video)
      : (typeof img === 'string' ? img : img?.url);
    if (url) return { state: 'complete', url };
    return { state: 'failed', error: 'Completed but no output URL' };
  }
  if (data.status === 'failed' || data.status === 'nsfw') {
    return { state: 'failed', error: data.error ?? `Generation ${data.status}` };
  }
  return { state: 'pending' };
}

export async function submitImage(opts: {
  scenePrompt: string;
  withGiraffe: boolean;
  refImageUrls?: string[]; // absolute URLs: [0] = girafa.jpg master, [1] = optional pose reference
  identityLock?: string;   // custom character lock; default = the giraffe's
}): Promise<{ jobId: string; provider: string }> {
  if (STUDIO_MOCK()) {
    return { jobId: mockSubmit('image', 6_000), provider: 'mock' };
  }

  const poseHint = opts.refImageUrls && opts.refImageUrls.length > 1
    ? '\nThe second reference image shows the EXACT pose to use. Copy the pose from it; copy the identity (colors, hat, bow tie, proportions) from the first reference image.'
    : '';
  const prompt = opts.withGiraffe
    ? `${opts.scenePrompt}\n\n${opts.identityLock ?? GIRAFFE_IDENTITY_LOCK}${poseHint}`
    : `${opts.scenePrompt}\n\nStyle: bright, premium hotel marketing photo-illustration, ${REEL_FORMAT.aspect} vertical composition.`;

  const jobId = await hfSubmit(opts.withGiraffe ? IMAGE_MODEL_GIRAFFE : IMAGE_MODEL_SCENE, {
    prompt,
    aspect_ratio: REEL_FORMAT.aspect,
    // Nano Banana edit-style reference inputs; exact field name may need the
    // sponsor config.yaml — input_images is the common shape on this platform.
    ...(opts.withGiraffe && opts.refImageUrls?.length
      ? { input_images: opts.refImageUrls, image_urls: opts.refImageUrls }
      : {}),
  });
  return { jobId, provider: 'higgsfield' };
}

// ── Anchor integration (FLUX Kontext, path verified live) ────────────────────
// Takes the deterministic composite and adds ONLY a contact shadow. The prompt
// is deliberately minimal: any "integrate naturally / match lighting" wording
// makes Kontext 3D-ify the flat official artwork (ink outline lost, bow tie
// dropped, plastic-toy look — caught on the 2026-06-07 reel). The soft-shaded
// pose pack masked this; the flat brand artwork exposes it. 9:16 honored via
// aspect_ratio (A/B verified; without it the model returns landscape).

export async function submitIntegrate(imageUrl: string): Promise<{ jobId: string; provider: string }> {
  const jobId = await hfSubmit('flux-kontext', {
    prompt: "ONLY add a soft elliptical contact shadow on the ground under the cartoon giraffe's hooves. Do NOT redraw, restyle or modify the giraffe in ANY way: it must stay a FLAT 2D hand-drawn cartoon illustration with black ink outlines, flat yellow fill, flat orange spots, the exact same straw hat and orange bow tie, exact same pose, exact same pixels, exact same size and position. It is a 2D sticker placed on the photo and must remain looking like a 2D drawing. Do not make it 3D, do not add volume, do not change its lighting. Background photo unchanged.",
    image_url: imageUrl,
    input_image: { type: 'image_url', image_url: imageUrl },
    aspect_ratio: '9:16',
  });
  return { jobId, provider: 'higgsfield' };
}

// ── Custom-character anchors (FLUX Kontext from the master image) ────────────
// Custom mascots have no official pose pack, so the anchor is generated: the
// master image goes in as the edit input and Kontext places the character into
// the scene while preserving the design (its specialty — same path that
// re-lights the giraffe composites, verified live).

export async function submitCharacterAnchor(opts: {
  masterImageUrl: string;
  scenePrompt: string;
  identityLock: string;
}): Promise<{ jobId: string; provider: string }> {
  if (STUDIO_MOCK()) {
    return { jobId: mockSubmit('image', 6_000), provider: 'mock' };
  }
  const jobId = await hfSubmit('flux-kontext', {
    prompt: `Place this exact character into a new scene: ${opts.scenePrompt}\nFull character visible in frame, wide vertical 9:16 composition, scene lighting matching the environment, soft contact shadow under the character.\n\n${opts.identityLock}`,
    image_url: opts.masterImageUrl,
    input_image: { type: 'image_url', image_url: opts.masterImageUrl },
    aspect_ratio: '9:16',
  });
  return { jobId, provider: 'higgsfield' };
}

export async function pollImage(provider: string, jobId: string): Promise<JobStatus> {
  if (provider === 'mock') return mockPoll(jobId);
  return hfPoll(jobId, 'image');
}

// ── TTS (ElevenLabs) — synchronous, returns audio bytes ───────────────────────
// Voice + settings are LOCKED by the brief. Returns a Vercel Blob URL.

export async function generateSpeech(
  text: string,
  reelId: string,
  // Neighbor lines from the storyboard. multilingual_v2 reinterprets the voice
  // on every isolated call (sounds like a different speaker between scenes);
  // previous_text/next_text give ElevenLabs the surrounding script so the
  // prosody stays continuous, as one narration. Generate scene lines IN ORDER.
  ctx?: { previousText?: string; nextText?: string }
): Promise<string> {
  // Voice goes real as soon as the ElevenLabs key exists — independent of
  // STUDIO_MOCK, which only gates the (credit-burning) image/video providers.
  if (!e('ELEVENLABS_API_KEY')) {
    return '/studio/mock-audio.mp3';
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': e('ELEVENLABS_API_KEY')!,
      },
      body: JSON.stringify({
        text,
        model_id: ELEVEN_MODEL,
        voice_settings: ELEVEN_VOICE_SETTINGS,
        ...(ctx?.previousText ? { previous_text: ctx.previousText } : {}),
        ...(ctx?.nextText ? { next_text: ctx.nextText } : {}),
      }),
    }
  );
  if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${res.status} ${await res.text()}`);

  const audio = Buffer.from(await res.arrayBuffer());
  const blob = await put(`studio/${reelId}/voice.mp3`, audio, {
    access: 'public',
    contentType: 'audio/mpeg',
    addRandomSuffix: true,
    token: e('BLOB_READ_WRITE_TOKEN'),
  });
  return blob.url;
}

// ── Video generation ──────────────────────────────────────────────────────────
// Mode 'scene':   image → ~8s motion clip (Higgsfield/Seedance image-to-video).
// Mode 'giraffe': image + voice mp3 → lip-synced talking clip (HeyGen/Kling).
// TODO(kickoff): confirm payload shapes against config.yaml.

const HEYGEN_BASE = e('HEYGEN_API_BASE') || 'https://api.heygen.com/v2';

export async function submitVideo(opts: {
  imageUrl: string;     // anchor: the approved identity-locked still
  motionPrompt: string; // ONE character action + camera move for this 8s clip
  talking?: boolean;    // dialogue scene → harden negatives against closed/static mouth
  audioUrl?: string;    // present → lip-sync path (per-scene line)
  endImageUrl?: string; // optional second anchor: Kling start+end frame interpolation
  characterName?: string; // custom mascot → drop the giraffe-specific anatomy rules
}): Promise<{ jobId: string; provider: string }> {
  if (STUDIO_MOCK()) {
    return { jobId: mockSubmit('video', 9_000), provider: 'mock' };
  }

  if (opts.audioUrl) {
    // Lip-sync: HeyGen photo-avatar from the approved giraffe image + ElevenLabs mp3.
    const res = await fetch(`${HEYGEN_BASE}/video/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': e('HEYGEN_API_KEY')!,
      },
      body: JSON.stringify({
        dimension: { width: REEL_FORMAT.width, height: REEL_FORMAT.height },
        video_inputs: [
          {
            character: { type: 'talking_photo_image', image_url: opts.imageUrl },
            voice: { type: 'audio', audio_url: opts.audioUrl },
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HeyGen submit failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return { jobId: data.data?.video_id ?? data.video_id, provider: 'heygen' };
  }

  // Motion: image-to-video anchored on the approved still, via Kling on the
  // Higgsfield platform (path verified live). With endImageUrl the model
  // interpolates between two identity-locked anchors — near-zero drift.
  const anatomy = opts.characterName
    ? `The character "${opts.characterName}" keeps EXACTLY two arms, two legs and one tail at all times — no limb is ever added, duplicated or split.`
    : `The giraffe has black HOOVES, never fingers, never hands, never gloves. It keeps EXACTLY two arms, two legs and one tail at all times — no limb is ever added, duplicated or split.`;
  // Talking scenes: body COMPLETELY still, hooves planted — gestures are what
  // makes Kling invent extra limbs (third arm appeared exactly when a
  // "welcoming nod" was directed; validated 2026-06-07). The background is a
  // photo: any painted/inflatable faces in it must stay frozen, or Kling
  // animates them too (caught on the playground mascot slide).
  const stillness = opts.talking
    ? ' Its body, arms, legs and tail stay COMPLETELY STILL, hooves planted on the ground — no gestures, no walking, no floating; only the head and mouth move.'
    : '';
  const jobId = await hfSubmit(VIDEO_MODEL, {
    image_url: opts.imageUrl,
    ...(opts.endImageUrl ? { end_image_url: opts.endImageUrl } : {}),
    prompt: `${opts.motionPrompt} The cartoon character keeps EXACTLY this design, no redesign. It stays a flat 2D hand-drawn cartoon with black ink outlines, naturally integrated in the scene with its contact shadow.${stillness} ${anatomy} EVERYTHING else in the frame is a still photograph and stays COMPLETELY FROZEN: any painted face or cartoon decoration in the background is PRINTED and must never move, blink or animate. No people enter the frame.`,
    // Kling honors negative_prompt on this platform; unknown fields are
    // silently ignored, so this is safe even if the model path changes.
    negative_prompt: `${opts.talking ? 'close-up, extreme close-up, face filling the frame, closed mouth, static mouth, hidden mouth, muzzle pointing at the camera, frontal muzzle view, head turning away, waving, gesturing, big gestures, walking, floating, levitating, ' : ''}extra limbs, extra arms, third arm, extra hand, extra leg, second tail, duplicated limbs, limbs splitting, new arm appearing, deformed hands, fingers, gloves, mutated anatomy, redesigned character, 3D render, realistic giraffe, background face moving, painted face animating, morphing`,
    duration: 5,
  });
  return { jobId, provider: 'higgsfield' };
}

export async function pollVideo(provider: string, jobId: string): Promise<JobStatus> {
  if (provider === 'mock') return mockPoll(jobId);

  if (provider === 'heygen') {
    const res = await fetch(`${HEYGEN_BASE.replace('/v2', '/v1')}/video_status.get?video_id=${jobId}`, {
      headers: { 'X-Api-Key': e('HEYGEN_API_KEY')! },
    });
    if (!res.ok) return { state: 'failed', error: `HeyGen poll failed: ${res.status}` };
    const data = await res.json();
    const s = data.data?.status ?? data.status;
    if (s === 'completed') return { state: 'complete', url: data.data?.video_url ?? data.video_url };
    if (s === 'failed') return { state: 'failed', error: data.data?.error?.message ?? 'Video generation failed' };
    return { state: 'pending' };
  }

  return hfPoll(jobId, 'video'); // Higgsfield: same status endpoint, video output field
}

// ── Persist external artifacts to our Blob (provider URLs expire) ────────────

export async function archiveToBlob(externalUrl: string, path: string, contentType: string): Promise<string> {
  if (externalUrl.startsWith('/')) return externalUrl; // local mock asset
  const res = await fetch(externalUrl);
  if (!res.ok) throw new Error(`Archive fetch failed: ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const blob = await put(path, bytes, { access: 'public', contentType, addRandomSuffix: true, token: e('BLOB_READ_WRITE_TOKEN') });
  return blob.url;
}
