// ── Bring-your-own anchor: the client uploads a still instead of generating ──
// POST {scene: n, imageUrl} — imageUrl is a Blob URL from the client-direct
// upload. Zero generation cost; the image still passes through the same
// human-approval gate before any video money is spent.

import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/api-utils';
import { getReel, updateReel, setStoryboard } from '../../../../../lib/studio/db';

const ALLOWED = new Set(['storyboard_ready', 'image_generating', 'image_ready', 'image_failed']);

export const POST: APIRoute = async ({ locals, params, request }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const reel = await getReel(params.id!, user.id);
  if (!reel) return json({ error: 'Not found' }, 404);
  if (!reel.storyboard) return json({ error: 'Generează storyboard-ul întâi.' }, 409);
  if (!ALLOWED.has(reel.status)) {
    return json({ error: `Nu pot seta imagini din starea "${reel.status}".` }, 409);
  }

  const body = await request.json().catch(() => null);
  const sceneN = Number(body?.scene);
  const imageUrl = (body?.imageUrl ?? '').trim();
  let parsed: URL;
  try { parsed = new URL(imageUrl); } catch { return json({ error: 'Imaginea lipsește.' }, 400); }
  if (parsed.protocol !== 'https:') return json({ error: 'Imaginea trebuie să fie un URL https.' }, 400);

  const storyboard = reel.storyboard;
  const scene = storyboard.scenes.find(s => s.n === sceneN);
  if (!scene) return json({ error: 'Scena nu există.' }, 400);

  scene.image = { status: 'ready', provider: 'upload', url: imageUrl };
  await setStoryboard(reel.id, storyboard);

  const pending = storyboard.scenes.filter(s => ['pending', 'generating'].includes(s.image.status));
  const failed = storyboard.scenes.filter(s => s.image.status === 'failed');
  const allReady = storyboard.scenes.every(s => s.image.status === 'ready');
  await updateReel(reel.id, {
    ...(allReady
      ? { status: 'image_ready' as const, image_url: storyboard.scenes[0].image.url ?? null }
      : pending.length > 0 ? { status: 'image_generating' as const } : {}),
    clearError: allReady && failed.length === 0,
  }, { stage: 'image', msg: `Scena ${sceneN}: imagine încărcată de client` });

  return json({ ok: true, allReady });
};
