// ── Step 3: motion — only AFTER approval. One anchored clip per scene. ───────
// Giraffe mode: full dialogue → ElevenLabs first (sync, cheap), then per-scene
// clips. The character moves in every clip, but identity cannot drift because
// each clip starts from an approved identity-locked still.

import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/api-utils';
import { getReel, updateReel, setStoryboard } from '../../../../../lib/studio/db';
import { generateSpeech, submitVideo } from '../../../../../lib/studio/providers';
import { getCharacter } from '../../../../../lib/studio/characters';

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
  const character = reel.character_id ? await getCharacter(reel.character_id, user.id) : null;
  // "the cartoon giraffe" / "the cartoon character (Numele)" in motion prompts
  const charLabel = character ? `cartoon character ("${character.name}")` : 'cartoon giraffe';

  try {
    // Voice first: one TTS per scene line. Assembly aligns each line to the
    // START of its own clip — a single full read drifts out of sync with the
    // scenes it belongs to (verified on the talking test). Gate on the scenes
    // themselves: in the dashboard flow Claude wrote the lines, not the user.
    if (reel.mode === 'giraffe' && storyboard.scenes.some(s => s.dialogue)) {
      const missing = storyboard.scenes.filter(s => s.dialogue && !s.audioUrl);
      if (missing.length > 0) {
        await updateReel(reel.id, { status: 'audio_generating' },
          { stage: 'audio', msg: 'Generare voce ElevenLabs (română), pe scene' });
        // IN ORDER, with neighbor lines as context: previous_text/next_text
        // keep the prosody continuous across separate TTS calls — without
        // them multilingual_v2 reinterprets the voice per call and scenes
        // can sound like different speakers (caught by ear, 2026-06-07).
        const spoken = storyboard.scenes.filter(s => s.dialogue);
        for (const scene of missing) {
          const at = spoken.findIndex(s => s.n === scene.n);
          scene.audioUrl = await generateSpeech(scene.dialogue!, `${reel.id}/s${scene.n}`, {
            previousText: at > 0 ? spoken[at - 1].dialogue! : undefined,
            nextText: at >= 0 && at < spoken.length - 1 ? spoken[at + 1].dialogue! : undefined,
          });
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
        // scenes are directed as TALKING-FIRST: speech is the primary action
        // and the scene's own motion is demoted to secondary, otherwise Kling
        // prioritizes the gesture and only opens the mouth near the end
        // (A/B-verified live on the reception anchor).
        const talking = reel.mode === 'giraffe' && scene.dialogue;
        const motionPrompt = talking
          ? `The ${charLabel} is SPEAKING to the camera from the very FIRST frame to the very LAST frame, continuously: mouth opening and closing the entire clip, like an enthusiastic TV host delivering lines non-stop. The talking never pauses. The head stays in THREE-QUARTER view toward the camera for the WHOLE clip — the mouth is clearly visible side-on at all times; the muzzle NEVER points straight into the lens and the head never turns away. WIDE shot the entire clip: the FULL character stays in frame at a distance, never a close-up. The character MOVES with energy through the whole clip while talking: ${scene.motion} The movement is lively and continuous — never standing still.`
          : scene.motion;
        const { jobId, provider } = await submitVideo({
          imageUrl: scene.image.url,
          motionPrompt,
          talking: Boolean(talking),
          characterName: character?.name,
        });
        scene.video = {
          status: 'generating', provider, jobId, url: null,
          prompt: motionPrompt, talking: Boolean(talking), retries: 0,
        };
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
