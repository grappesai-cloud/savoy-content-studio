// ── Bring-your-own anchor: the client uploads a still instead of generating ──
// POST {scene: n, imageUrl} — imageUrl is a Blob URL from the client-direct
// upload. Zero generation cost; the image still passes through the same
// human-approval gate before any video money is spent.

import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/api-utils';
import { getReel, updateReel, setStoryboard } from '../../../../../lib/studio/db';
import { compositeAnchor } from '../../../../../lib/studio/anchor';
import { submitIntegrate } from '../../../../../lib/studio/providers';
import { GIRAFFE_POSES, STUDIO_MOCK, publicAssetBase } from '../../../../../lib/studio/config';

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

  // Simple flow: {background: true, imageUrl} — the upload is a BACKGROUND
  // photo, not a finished anchor. The giraffe is composited into it at
  // mid-ground (validated recipe), FLUX adds the contact shadow, and the one
  // resulting anchor serves EVERY scene.
  if (body?.background === true && reel.mode === 'giraffe') {
    const pose = GIRAFFE_POSES.find(p => p.id === storyboard.scenes[0]?.pose) ?? GIRAFFE_POSES[0];
    try {
      const anchorUrl = await compositeAnchor({
        backdropUrl: imageUrl,
        poseAlphaUrl: new URL(`/studio/poses/alpha/${pose.id}.png`, publicAssetBase(new URL(request.url).origin)).toString(),
        reelId: reel.id,
        sceneN: 0,
        midGround: true,
      });
      if (STUDIO_MOCK()) {
        for (const s of storyboard.scenes) s.image = { status: 'ready', provider: 'composite', url: anchorUrl };
      } else {
        try {
          const { jobId, provider } = await submitIntegrate(anchorUrl);
          for (const s of storyboard.scenes) s.image = { status: 'generating', provider, jobId, url: null };
        } catch {
          // shadow pass failed → the raw composite is still a valid anchor
          for (const s of storyboard.scenes) s.image = { status: 'ready', provider: 'composite', url: anchorUrl };
        }
      }
      await setStoryboard(reel.id, storyboard);
      const ready = storyboard.scenes[0].image.status === 'ready';
      await updateReel(reel.id, ready
        ? { status: 'image_ready', image_url: storyboard.scenes[0].image.url ?? null, clearError: true }
        : { status: 'image_generating', clearError: true },
        { stage: 'image', msg: 'Fundal încărcat de client — girafa compusă în cadru' });
      return json({ ok: true, allReady: ready });
    } catch (err: any) {
      return json({ error: `Compunerea în fundal a eșuat: ${err?.message}` }, 502);
    }
  }

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
