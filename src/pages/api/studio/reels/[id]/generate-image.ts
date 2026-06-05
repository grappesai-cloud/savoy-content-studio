// ── Step 2: anchor stills, one per scene (identity-locked in giraffe mode) ───
// POST without body → submit every scene that lacks a ready image.
// POST {scene: n}  → regenerate just that scene (before approval).

import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/api-utils';
import { getReel, updateReel, setStoryboard } from '../../../../../lib/studio/db';
import { submitImage } from '../../../../../lib/studio/providers';
import { GIRAFFE_MASTER_IMAGE, GIRAFFE_POSES, STUDIO_MOCK, publicAssetBase } from '../../../../../lib/studio/config';
import { e } from '../../../../../lib/env';

const ALLOWED = new Set(['storyboard_ready', 'image_generating', 'image_ready', 'image_failed']);

export const POST: APIRoute = async ({ locals, params, request, url }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const reel = await getReel(params.id!, user.id);
  if (!reel) return json({ error: 'Not found' }, 404);
  if (!reel.storyboard) return json({ error: 'Generează storyboard-ul întâi.' }, 409);
  if (!ALLOWED.has(reel.status)) {
    return json({ error: `Nu pot genera imagini din starea "${reel.status}".` }, 409);
  }

  const body = await request.json().catch(() => ({}));
  const onlyScene: number | null = typeof body?.scene === 'number' ? body.scene : null;

  const withGiraffe = reel.mode === 'giraffe';
  const storyboard = reel.storyboard;
  // Until the sponsor confirms the Nano Banana model path, giraffe anchors
  // come STRAIGHT from the official pose pack: identity is perfect by
  // definition (they ARE the brand asset) and Kling animates from them
  // beautifully (verified live). Flip by setting HIGGSFIELD_IMAGE_MODEL_GIRAFFE.
  const directAnchors = withGiraffe && !e('HIGGSFIELD_IMAGE_MODEL_GIRAFFE') && !STUDIO_MOCK();
  let submitted = 0;

  for (const scene of storyboard.scenes) {
    if (onlyScene !== null && scene.n !== onlyScene) continue;
    if (onlyScene === null && scene.image.status === 'ready') continue;

    const assetBase = publicAssetBase(url.origin);
    const pose = GIRAFFE_POSES.find(p => p.id === scene.pose);
    if (directAnchors) {
      const file = pose?.file ?? GIRAFFE_MASTER_IMAGE;
      scene.image = { status: 'ready', provider: 'pose-pack', url: new URL(file, assetBase).toString() };
      submitted++;
      continue;
    }

    const refImageUrls = withGiraffe
      ? [
          new URL(GIRAFFE_MASTER_IMAGE, assetBase).toString(),
          ...(pose ? [new URL(pose.file, assetBase).toString()] : []),
        ]
      : undefined;
    try {
      const { jobId, provider } = await submitImage({
        scenePrompt: scene.description,
        withGiraffe,
        refImageUrls,
      });
      scene.image = { status: 'generating', provider, jobId, url: null };
      submitted++;
    } catch (e: any) {
      scene.image = { status: 'failed', error: e?.message };
    }
  }

  if (submitted === 0) return json({ error: 'Nicio scenă de generat.' }, 409);

  await setStoryboard(reel.id, storyboard);
  const allReady = storyboard.scenes.every(s => s.image.status === 'ready');
  await updateReel(reel.id, {
    status: allReady ? 'image_ready' : 'image_generating',
    bump: 'image_attempts',
    clearError: true,
  }, { stage: 'image', msg: allReady
    ? 'Ancore directe din pozele oficiale, identitate garantată'
    : `Generare imagini: ${submitted} scen${submitted === 1 ? 'ă' : 'e'}` });
  return json({ ok: true, submitted });
};
