// ── Characters: list + create ─────────────────────────────────────────────────
// POST {name, imageUrl} — imageUrl is a Blob URL from the client-direct upload.
// Claude writes the identity-lock block from the image; the character is then
// usable on any new reel (character_id).

import type { APIRoute } from 'astro';
import { json } from '../../../lib/api-utils';
import { listCharacters, createCharacter, writeIdentityLock } from '../../../lib/studio/characters';

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  return json({ characters: await listCharacters(user.id) });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => null);
  const name = (body?.name ?? '').trim();
  const imageUrl = (body?.imageUrl ?? '').trim();
  const refUrls: string[] = Array.isArray(body?.referenceImageUrls)
    ? body.referenceImageUrls.map((u: unknown) => String(u).trim()).filter(Boolean).slice(0, 7)
    : [];

  if (name.length < 2 || name.length > 60) return json({ error: 'Numele caracterului: 2-60 de caractere.' }, 400);
  for (const url of [imageUrl, ...refUrls]) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { return json({ error: 'Imaginea master lipsește.' }, 400); }
    if (parsed.protocol !== 'https:') return json({ error: 'Imaginile trebuie să fie URL-uri https.' }, 400);
  }

  const identityLock = await writeIdentityLock(name, imageUrl, refUrls);
  const character = await createCharacter({ userId: user.id, name, masterImageUrl: imageUrl, referenceImageUrls: refUrls, identityLock });
  return json({ character }, 201);
};
