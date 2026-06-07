// ── The client's OK on the generated script — recorded BEFORE images ─────────
// The dashboard shows the Claude-written script; nothing visual is generated
// until the client explicitly approves the words. Timestamped + audited, same
// discipline as the image gate.

import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/api-utils';
import { getReel, updateReel } from '../../../../../lib/studio/db';

export const POST: APIRoute = async ({ locals, params }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const reel = await getReel(params.id!, user.id);
  if (!reel) return json({ error: 'Not found' }, 404);
  if (reel.status !== 'storyboard_ready' || !reel.storyboard) {
    return json({ error: 'Textul se aprobă după generarea storyboard-ului.' }, 409);
  }

  await updateReel(reel.id, { approveText: true },
    { stage: 'text', msg: 'Clientul a aprobat textul' });
  return json({ ok: true });
};
