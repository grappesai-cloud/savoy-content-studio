// ── Characters: delete + add reference images ─────────────────────────────────
// DELETE — removes the character (reels keep working: character_id → NULL = giraffe).
// POST {referenceImageUrls: [...]} — appends extra reference images and re-writes
// the identity-lock block with Claude looking at ALL the images.

import type { APIRoute } from 'astro';
import { json } from '../../../../lib/api-utils';
import { getCharacter, deleteCharacter, addReferenceImages, writeIdentityLock } from '../../../../lib/studio/characters';

export const DELETE: APIRoute = async ({ locals, params }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const ok = await deleteCharacter(params.id!, user.id);
  if (!ok) return json({ error: 'Caracterul nu există.' }, 404);
  return json({ ok: true });
};

export const POST: APIRoute = async ({ locals, params, request }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const character = await getCharacter(params.id!, user.id);
  if (!character) return json({ error: 'Caracterul nu există.' }, 404);

  const body = await request.json().catch(() => null);
  const refUrls: string[] = Array.isArray(body?.referenceImageUrls)
    ? body.referenceImageUrls.map((u: unknown) => String(u).trim()).filter(Boolean).slice(0, 7)
    : [];
  if (!refUrls.length) return json({ error: 'Nicio imagine de referință.' }, 400);
  for (const url of refUrls) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { return json({ error: 'URL de imagine invalid.' }, 400); }
    if (parsed.protocol !== 'https:') return json({ error: 'Imaginile trebuie să fie URL-uri https.' }, 400);
  }
  const existing = Array.isArray(character.reference_image_urls) ? character.reference_image_urls : [];
  if (existing.length + refUrls.length > 7) return json({ error: 'Maxim 7 imagini de referință pe lângă cea master.' }, 400);

  // Re-write the lock from master + all refs (old + new) so it captures what
  // stays constant across every angle the client has provided.
  const identityLock = await writeIdentityLock(character.name, character.master_image_url, [...existing, ...refUrls]);
  const updated = await addReferenceImages(params.id!, user.id, refUrls, identityLock);
  return json({ character: updated });
};
