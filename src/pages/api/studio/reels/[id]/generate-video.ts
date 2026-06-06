// ── Step 3: motion — only AFTER approval. One anchored clip per scene. ───────
// Giraffe mode: full dialogue → ElevenLabs first (sync, cheap), then per-scene
// clips. The character moves in every clip, but identity cannot drift because
// each clip starts from an approved identity-locked still.

import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/api-utils';
import { getReel, updateReel, setStoryboard } from '../../../../../lib/studio/db';
import { generateSpeech, submitVideo } from '../../../../../lib/studio/providers';

const ALLOWED = new Set(['approved', 'video_failed']);

export const POST: APIRoute = async ({ locals, params }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const reel = await getReel(params.id!, user.id);
  if (!reel) return json({ error: 'Not found' }, 404);
  if (!ALLOWED.has(reel.status)) {
    return json({ error: 'Aprobă imaginile înainte de a genera videoul.' }, 409);
  }
  if (!reel.storyboard) return json({ error: 'Lipsește storyboard-ul.' }, 409);

  const storyboard = reel.storyboard;

  try {
    // Voice first (giraffe): one TTS per scene line. Assembly aligns each
    // line to the START of its own clip — a single full read drifts out of
    // sync with the scenes it belongs to (verified on the talking test).
    if (reel.mode === 'giraffe' && reel.dialogue) {
      const missing = storyboard.scenes.filter(s => s.dialogue && !s.audioUrl);
      if (missing.length > 0) {
        await updateReel(reel.id, { status: 'audio_generating' },
          { stage: 'audio', msg: 'Generare voce ElevenLabs (română), pe scene' });
        for (const scene of missing) {
          scene.audioUrl = await generateSpeech(scene.dialogue!, `${reel.id}/s${scene.n}`);
        }
        await setStoryboard(reel.id, storyboard);
        await updateReel(reel.id, {}, { stage: 'audio', msg: `Voce generată: ${missing.length} replici` });
      }
    }

    let submitted = 0;
    for (const scene of storyboard.scenes) {
      if (scene.video.status === 'ready') continue;
      if (scene.image.status !== 'ready' || !scene.image.url) continue;
      try {
        // Platform lip-sync models (speak/infinitalk) reject the cartoon
        // mascot (no detectable human face — verified live), so dialogue
        // scenes get an explicit talking direction instead: the mouth visibly
        // moves while the mixed-in voice plays. Reads as speech on camera.
        const talking = reel.mode === 'giraffe' && scene.dialogue
          ? ' The giraffe is TALKING to the camera the whole time: mouth clearly opening and closing as it speaks, lively friendly facial expression, small head gestures that match natural speech rhythm.'
          : '';
        const { jobId, provider } = await submitVideo({
          imageUrl: scene.image.url,
          motionPrompt: `${scene.motion}${talking}`,
        });
        scene.video = { status: 'generating', provider, jobId, url: null };
        submitted++;
      } catch (e: any) {
        scene.video = { status: 'failed', error: e?.message };
      }
    }
    if (submitted === 0) return json({ error: 'Nicio scenă de animat.' }, 409);

    await setStoryboard(reel.id, storyboard);
    await updateReel(reel.id, { status: 'video_generating', bump: 'video_attempts', clearError: true },
      { stage: 'video', msg: `Generare video: ${submitted} scen${submitted === 1 ? 'ă' : 'e'} ancorate` });
    return json({ ok: true, submitted });
  } catch (e: any) {
    console.error('[studio/generate-video] error:', e?.message);
    await updateReel(reel.id, { status: 'video_failed', error_message: e?.message },
      { stage: 'video', msg: `Eroare: ${e?.message}` });
    return json({ error: 'Generarea videoului a eșuat. Încearcă din nou.' }, 500);
  }
};
