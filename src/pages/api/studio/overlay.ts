// ── Mode 3: giraffe over the user's own footage — synchronous ffmpeg job ─────

import type { APIRoute } from 'astro';
import { getPg } from '../../../lib/supabase';
import { json } from '../../../lib/api-utils';
import { generateSpeech } from '../../../lib/studio/providers';
import { overlayGiraffe } from '../../../lib/studio/overlay';
import { GIRAFFE_POSES } from '../../../lib/studio/config';

export const POST: APIRoute = async ({ locals, request, url }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => null);
  const videoUrl = body?.videoUrl;
  const title = (body?.title ?? '').trim() || 'Girafa peste video';
  const dialogue = (body?.dialogue ?? '').trim() || null;
  const pose = GIRAFFE_POSES.find(p => p.id === body?.pose) ?? GIRAFFE_POSES[0];

  if (!videoUrl || typeof videoUrl !== 'string' || !videoUrl.startsWith('https://')) {
    return json({ error: 'Încarcă un video întâi.' }, 400);
  }

  const sql = getPg();
  const rows = await sql`
    INSERT INTO studio_reels (user_id, mode, title, scene_prompt, dialogue, pose, status, events)
    VALUES (${user.id}, 'overlay', ${title}, ${'Suprapunere pe video propriu'}, ${dialogue}, ${pose.id}, 'video_generating',
            ${JSON.stringify([{ at: new Date().toISOString(), stage: 'overlay', msg: 'Compunere pornită' }])}::jsonb)
    RETURNING id
  `;
  const reelId = rows[0].id as string;

  try {
    const audioUrl = dialogue ? await generateSpeech(dialogue, reelId) : null;
    const absAudio = audioUrl?.startsWith('/') ? new URL(audioUrl, url.origin).toString() : audioUrl;
    const finalUrl = await overlayGiraffe({
      videoUrl,
      poseAlphaUrl: new URL(`/studio/poses/alpha/${pose.id}.png`, url.origin).toString(),
      audioUrl: absAudio,
      reelId,
    });
    await sql`
      UPDATE studio_reels SET status = 'complete', video_url = ${finalUrl}, audio_url = ${audioUrl},
        events = events || ${JSON.stringify([{ at: new Date().toISOString(), stage: 'overlay', msg: 'Compunere finalizată' }])}::jsonb,
        updated_at = now()
      WHERE id = ${reelId}
    `;
    return json({ id: reelId, videoUrl: finalUrl });
  } catch (e: any) {
    console.error('[studio/overlay] error:', e?.message);
    await sql`
      UPDATE studio_reels SET status = 'video_failed', error_message = ${e?.message ?? 'Eroare'}, updated_at = now()
      WHERE id = ${reelId}
    `;
    return json({ error: 'Compunerea a eșuat. Încearcă alt video.' }, 500);
  }
};
