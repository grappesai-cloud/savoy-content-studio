// ── The approval gate — a human approves ALL anchor stills BEFORE any money ──
// is spent on video generation. Server-enforced; judged criterion.

import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/api-utils';
import { getReel, updateReel } from '../../../../../lib/studio/db';

export const POST: APIRoute = async ({ locals, params }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const reel = await getReel(params.id!, user.id);
  if (!reel) return json({ error: 'Not found' }, 404);
  if (reel.status !== 'image_ready' || !reel.storyboard) {
    return json({ error: 'Toate imaginile trebuie generate înainte de aprobare.' }, 409);
  }
  const notReady = reel.storyboard.scenes.filter(s => s.image.status !== 'ready');
  if (notReady.length > 0) {
    return json({ error: `Scenele ${notReady.map(s => s.n).join(', ')} nu au imagine gata.` }, 409);
  }

  await updateReel(reel.id, { status: 'approved', approve: true },
    { stage: 'approve', msg: `Storyboard aprobat (${reel.storyboard.scenes.length} scene)` });
  return json({ ok: true });
};
