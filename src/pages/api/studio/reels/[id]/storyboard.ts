// ── Step 1: the idea becomes a 3-scene storyboard (Claude when key present).
// POST = (re)generate · PATCH = save user edits to scene texts.

import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/api-utils';
import { getReel, updateReel, setStoryboard } from '../../../../../lib/studio/db';
import { generateStoryboard } from '../../../../../lib/studio/storyboard';
import { getCharacter } from '../../../../../lib/studio/characters';
import { GIRAFFE_POSES, BACKDROPS } from '../../../../../lib/studio/config';

export const POST: APIRoute = async ({ locals, params, request }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const reel = await getReel(params.id!, user.id);
  if (!reel) return json({ error: 'Not found' }, 404);
  if (!['draft', 'storyboard_ready'].includes(reel.status)) {
    return json({ error: 'Storyboard-ul se generează doar înainte de imagini.' }, 409);
  }

  // {fresh: true} = dashboard's "alt text": ignore the previously auto-written
  // dialogue so Claude writes a new script instead of re-splitting the old one.
  const body = await request.json().catch(() => ({}));
  const fresh = body?.fresh === true;

  try {
    const character = reel.character_id ? await getCharacter(reel.character_id, user.id) : null;
    const storyboard = await generateStoryboard({
      mode: reel.mode,
      scenePrompt: reel.scene_prompt,
      dialogue: fresh ? null : reel.dialogue,
      characterName: character?.name ?? null,
    });
    await setStoryboard(reel.id, storyboard);
    // Dashboard flow: Claude wrote the script — persist the joined text so the
    // TTS stage and the reel record both see the real dialogue.
    const writtenDialogue = (fresh || !reel.dialogue)
      ? storyboard.scenes.map(s => s.dialogue).filter(Boolean).join(' ') || null
      : null;
    await updateReel(reel.id, {
      status: 'storyboard_ready',
      ...(writtenDialogue ? { dialogue: writtenDialogue } : {}),
      clearError: true,
    }, { stage: 'storyboard', msg: `Storyboard generat: ${storyboard.scenes.length} scene` });
    return json({ storyboard });
  } catch (e: any) {
    console.error('[studio/storyboard] error:', e?.message);
    return json({ error: 'Generarea storyboard-ului a eșuat. Încearcă din nou.' }, 500);
  }
};

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const reel = await getReel(params.id!, user.id);
  if (!reel?.storyboard) return json({ error: 'Not found' }, 404);
  if (reel.status !== 'storyboard_ready') {
    return json({ error: 'Scenele se editează doar înainte de generarea imaginilor.' }, 409);
  }

  const body = await request.json().catch(() => null);
  const edits: any[] = Array.isArray(body?.scenes) ? body.scenes : [];
  const poseIds = new Set(GIRAFFE_POSES.map(p => p.id));

  const backdropIds = new Set(BACKDROPS.map(b => b.id));
  const storyboard = reel.storyboard;
  for (const edit of edits) {
    const scene = storyboard.scenes.find(s => s.n === edit.n);
    if (!scene) continue;
    if (typeof edit.description === 'string' && edit.description.trim()) scene.description = edit.description.trim();
    if (typeof edit.dialogue === 'string') scene.dialogue = edit.dialogue.trim() || null;
    if (edit.pose === null || poseIds.has(edit.pose)) scene.pose = edit.pose;
    if (edit.backdrop === null || edit.backdrop === 'none' || backdropIds.has(edit.backdrop)) {
      scene.backdrop = edit.backdrop === 'none' ? null : edit.backdrop;
    }
  }
  await setStoryboard(reel.id, storyboard);
  return json({ storyboard });
};
