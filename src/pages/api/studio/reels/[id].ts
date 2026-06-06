// ── Reel status — advances every in-flight scene job on each poll ────────────
//
// Serverless-friendly: no background worker. The client polls; we poll the
// providers for each generating scene, archive finished artifacts to Blob, and
// when the LAST scene completes a stage we advance the reel status. When all
// clips are in, assembly concats the anchored scenes + lays the voice over.

import type { APIRoute } from 'astro';
import { json } from '../../../../lib/api-utils';
import { getReel, updateReel, setStoryboard, claimAssembly } from '../../../../lib/studio/db';
import { pollImage, pollVideo, archiveToBlob } from '../../../../lib/studio/providers';
import { assembleReel } from '../../../../lib/studio/assemble';

async function runAssembly(
  reel: NonNullable<Awaited<ReturnType<typeof getReel>>>,
  sb: NonNullable<NonNullable<Awaited<ReturnType<typeof getReel>>>['storyboard']>,
  origin: string,
) {
  const abs = (u: string) => (u.startsWith('/') ? new URL(u, origin).toString() : u);
  let finalUrl: string;
  let msg: string;
  try {
    finalUrl = await assembleReel({
      clipUrls: sb.scenes.map(s => abs(s.video.url!)),
      audioUrl: reel.audio_url ? abs(reel.audio_url) : null, // legacy full read
      sceneAudioUrls: sb.scenes.map(s => (s.audioUrl ? abs(s.audioUrl) : null)),
      reelId: reel.id,
    });
    msg = `Reel finalizat: ${sb.scenes.length} scene ancorate, ~${sb.scenes.length * 8}s`;
  } catch (e: any) {
    console.error('[studio/assemble] fallback to first clip:', e?.message);
    finalUrl = sb.scenes[0].video.url!;
    msg = 'Reel finalizat (asamblarea a eșuat, primul clip)';
  }
  await updateReel(reel.id, { status: 'complete', video_url: finalUrl, clearError: true },
    { stage: 'video', msg });
}

export const GET: APIRoute = async ({ locals, params, url }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  let reel = await getReel(params.id!, user.id);
  if (!reel) return json({ error: 'Not found' }, 404);

  try {
    const sb = reel.storyboard;

    if (sb && reel.status === 'image_generating') {
      let changed = false;
      for (const scene of sb.scenes) {
        if (scene.image.status !== 'generating' || !scene.image.provider || !scene.image.jobId) continue;
        const st = await pollImage(scene.image.provider, scene.image.jobId);
        if (st.state === 'complete') {
          scene.image.url = await archiveToBlob(st.url, `studio/${reel.id}/scene${scene.n}.jpg`, 'image/jpeg');
          scene.image.status = 'ready';
          changed = true;
        } else if (st.state === 'failed') {
          scene.image.status = 'failed';
          scene.image.error = st.error;
          changed = true;
        }
      }
      if (changed) {
        await setStoryboard(reel.id, sb);
        const failed = sb.scenes.filter(s => s.image.status === 'failed');
        const pending = sb.scenes.filter(s => ['pending', 'generating'].includes(s.image.status));
        if (pending.length === 0) {
          if (failed.length > 0) {
            await updateReel(reel.id, { status: 'image_failed', error_message: failed[0].image.error ?? 'Imagine eșuată' },
              { stage: 'image', msg: `Scenele ${failed.map(s => s.n).join(', ')} au eșuat` });
          } else {
            await updateReel(reel.id, { status: 'image_ready', image_url: sb.scenes[0].image.url ?? null, clearError: true },
              { stage: 'image', msg: 'Toate imaginile gata, așteaptă aprobare' });
          }
        }
      }
    } else if (sb && reel.status === 'video_generating') {
      let changed = false;
      for (const scene of sb.scenes) {
        if (scene.video.status !== 'generating' || !scene.video.provider || !scene.video.jobId) continue;
        const st = await pollVideo(scene.video.provider, scene.video.jobId);
        if (st.state === 'complete') {
          scene.video.url = await archiveToBlob(st.url, `studio/${reel.id}/scene${scene.n}.mp4`, 'video/mp4');
          scene.video.status = 'ready';
          changed = true;
        } else if (st.state === 'failed') {
          scene.video.status = 'failed';
          scene.video.error = st.error;
          changed = true;
        }
      }
      if (changed) await setStoryboard(reel.id, sb);
      {
        // Completion check runs on EVERY poll (not only when a scene just
        // flipped) — if the process died between "last scene ready" and
        // assembly, the next poll picks it up instead of stalling forever.
        const failed = sb.scenes.filter(s => s.video.status === 'failed');
        const pending = sb.scenes.filter(s => ['pending', 'generating'].includes(s.video.status));
        if (pending.length === 0) {
          if (failed.length > 0) {
            await updateReel(reel.id, { status: 'video_failed', error_message: failed[0].video.error ?? 'Video eșuat' },
              { stage: 'video', msg: `Scenele ${failed.map(s => s.n).join(', ')} au eșuat` });
          } else if (await claimAssembly(reel.id)) {
            // Exactly ONE invocation runs the final cut. Without the claim,
            // every concurrent poll launched its own ffmpeg on the same Fluid
            // instance → memory thrash → 800s runtime timeouts (prod logs).
            await runAssembly(reel, sb, url.origin);
          }
        }
      }
    } else if (sb && reel.status === 'assembling') {
      // Normally a no-op (the claimant is working); claimAssembly only
      // succeeds here when the previous claim is >5 min old, i.e. the
      // assembling function died — then this poll takes over.
      if (await claimAssembly(reel.id)) {
        await runAssembly(reel, sb, url.origin);
      }
    }
  } catch (e: any) {
    console.error('[studio/status] poll error:', e?.message);
    // Leave state as-is; client keeps polling.
  }

  reel = await getReel(params.id!, user.id);
  return json({ reel });
};
