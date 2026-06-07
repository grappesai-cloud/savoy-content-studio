// ── Studio: create + list reels ───────────────────────────────────────────────

import type { APIRoute } from 'astro';
import { getPg } from '../../../lib/supabase';
import { json } from '../../../lib/api-utils';
import { listReels } from '../../../lib/studio/db';
import { getCharacter } from '../../../lib/studio/characters';

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  return json({ reels: await listReels(user.id) });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => null);
  const mode = body?.mode;
  const scenePrompt = (body?.scenePrompt ?? '').trim();
  const dialogue = (body?.dialogue ?? '').trim() || null;
  const title = (body?.title ?? '').trim() || 'Reel nou';

  if (mode !== 'scene' && mode !== 'giraffe') return json({ error: 'Mod invalid.' }, 400);
  if (scenePrompt.length < 10) return json({ error: 'Descrie scena în cel puțin 10 caractere.' }, 400);
  // Dialogue is optional in giraffe mode: without it, Claude writes the script
  // from the idea (the dashboard flow). When given, it is split verbatim.
  if (mode === 'giraffe' && dialogue && dialogue.length < 5) {
    return json({ error: 'Replica e prea scurtă.' }, 400);
  }
  if (dialogue && dialogue.length > 400) {
    return json({ error: 'Replica e prea lungă pentru un reel de 15-30s (max 400 caractere).' }, 400);
  }

  // Custom character (dashboard): must belong to this user. null = Domnul Girafă.
  let characterId: string | null = null;
  if (typeof body?.characterId === 'string' && body.characterId) {
    const character = await getCharacter(body.characterId, user.id);
    if (!character) return json({ error: 'Caracterul nu există.' }, 400);
    characterId = character.id;
  }

  const sql = getPg();
  const rows = await sql`
    INSERT INTO studio_reels (user_id, mode, title, scene_prompt, dialogue, character_id, events)
    VALUES (${user.id}, ${mode}, ${title}, ${scenePrompt}, ${dialogue}, ${characterId},
            ${JSON.stringify([{ at: new Date().toISOString(), stage: 'draft', msg: 'Reel creat' }])}::jsonb)
    RETURNING id
  `;
  return json({ id: rows[0].id }, 201);
};
