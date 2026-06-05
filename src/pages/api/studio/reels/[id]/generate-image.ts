// ── Step 2: anchor stills, one per scene (identity-locked in giraffe mode) ───
// POST without body → submit every scene that lacks a ready image.
// POST {scene: n}  → regenerate just that scene (before approval).

import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/api-utils';
import { getReel, updateReel, setStoryboard } from '../../../../../lib/studio/db';
import { submitImage } from '../../../../../lib/studio/providers';
import { GIRAFFE_MASTER_IMAGE, GIRAFFE_POSES } from '../../../../../lib/studio/config';

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
  let submitted = 0;

  for (const scene of storyboard.scenes) {
    if (onlyScene !== null && scene.n !== onlyScene) continue;
    if (onlyScene === null && scene.image.status === 'ready') continue;

    const pose = GIRAFFE_POSES.find(p => p.id === scene.pose);
    const refImageUrls = withGiraffe
      ? [
          new URL(GIRAFFE_MASTER_IMAGE, url.origin).toString(),
          ...(pose ? [new URL(pose.file, url.origin).toString()] : []),
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
  await updateReel(reel.id, { status: 'image_generating', bump: 'image_attempts', clearError: true },
    { stage: 'image', msg: `Generare imagini: ${submitted} scen${submitted === 1 ? 'ă' : 'e'}` });
  return json({ ok: true, submitted });
};
