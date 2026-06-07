// ─── Custom characters ────────────────────────────────────────────────────────
//
// The dashboard lets a client swap Domnul Girafă for their own mascot: a name
// plus a master image. The identity-lock block (the same "LOCKED visual asset"
// guarantee the giraffe gets) is written automatically by Claude looking at the
// uploaded image; a deterministic template covers the no-key case.
//
// NULL character_id on a reel = the built-in Domnul Girafă.

import { getPg } from '../supabase';
import { e } from '../env';

export interface StudioCharacter {
  id: string;
  user_id: string;
  name: string;
  master_image_url: string;
  reference_image_urls: string[];  // extra refs beyond the master (jsonb)
  identity_lock: string;
  created_at: string;
}

const CLAUDE_MODEL = 'claude-sonnet-4-6';

// jsonb can come back double-encoded (string inside jsonb — same gotcha as
// storyboard); always hand callers a real array.
function hydrate(row: any): StudioCharacter {
  let refs = row.reference_image_urls;
  if (typeof refs === 'string') { try { refs = JSON.parse(refs); } catch { refs = []; } }
  return { ...row, reference_image_urls: Array.isArray(refs) ? refs : [] };
}

export async function listCharacters(userId: string): Promise<StudioCharacter[]> {
  const sql = getPg();
  const rows = await sql`
    SELECT * FROM studio_characters WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 20
  `;
  return (rows as any[]).map(hydrate);
}

export async function getCharacter(id: string, userId: string): Promise<StudioCharacter | null> {
  const sql = getPg();
  const rows = await sql`
    SELECT * FROM studio_characters WHERE id = ${id} AND user_id = ${userId} LIMIT 1
  `;
  return rows[0] ? hydrate(rows[0]) : null;
}

export async function createCharacter(opts: {
  userId: string;
  name: string;
  masterImageUrl: string;
  referenceImageUrls?: string[];
  identityLock: string;
}): Promise<StudioCharacter> {
  const sql = getPg();
  const rows = await sql`
    INSERT INTO studio_characters (user_id, name, master_image_url, reference_image_urls, identity_lock)
    VALUES (${opts.userId}, ${opts.name}, ${opts.masterImageUrl}, ${JSON.stringify(opts.referenceImageUrls ?? [])}::text::jsonb, ${opts.identityLock})
    RETURNING *
  `;
  return hydrate(rows[0]);
}

export async function deleteCharacter(id: string, userId: string): Promise<boolean> {
  // studio_reels.character_id is ON DELETE SET NULL — old reels fall back to the giraffe.
  const sql = getPg();
  const rows = await sql`
    DELETE FROM studio_characters WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `;
  return rows.length > 0;
}

export async function addReferenceImages(
  id: string,
  userId: string,
  urls: string[],
  identityLock?: string
): Promise<StudioCharacter | null> {
  const sql = getPg();
  const rows = identityLock
    ? await sql`
        UPDATE studio_characters
        SET reference_image_urls = reference_image_urls || ${JSON.stringify(urls)}::text::jsonb,
            identity_lock = ${identityLock}
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING *
      `
    : await sql`
        UPDATE studio_characters
        SET reference_image_urls = reference_image_urls || ${JSON.stringify(urls)}::text::jsonb
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING *
      `;
  return rows[0] ? hydrate(rows[0]) : null;
}

// ── Identity lock authoring ───────────────────────────────────────────────────
// Claude looks at the master image and writes the same kind of lock block the
// giraffe has: colors, accessories, proportions, art style — everything an
// image model must NOT change.

export async function writeIdentityLock(name: string, masterImageUrl: string, referenceImageUrls: string[] = []): Promise<string> {
  const fallback = `
CHARACTER IDENTITY — LOCKED VISUAL ASSET, DO NOT REDESIGN:
The character "${name}" must match the reference image EXACTLY: same colors,
same accessories, same proportions, same facial features, same art style.
Never change colors, proportions, accessories or art style. Same character in every frame.
`.trim();

  const key = e('ANTHROPIC_API_KEY');
  if (!key) return fallback;

  try {
    // Fetch the images ourselves and send base64 — the url source made the
    // Anthropic call hang ("fetch failed" after ~77s, verified locally).
    // First image is the master; extra references show the character from
    // more angles so the lock captures what stays constant across all of them.
    const allUrls = [masterImageUrl, ...referenceImageUrls].slice(0, 8);
    const imageBlocks = await Promise.all(allUrls.map(async (url) => {
      const imgRes = await fetch(url);
      if (!imgRes.ok) throw new Error(`reference image fetch ${imgRes.status}`);
      const mediaType = imgRes.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
      const imgB64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
      return { type: 'image', source: { type: 'base64', media_type: mediaType, data: imgB64 } };
    }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: `${imageBlocks.length > 1 ? `These are ${imageBlocks.length} reference images (the first is the master) of a brand mascot called "${name}". Describe only what stays CONSTANT across all of them.` : `This is the master reference image of a brand mascot called "${name}".`} Write an identity-lock block for image-generation prompts, in English, following EXACTLY this shape (replace the giraffe specifics with what you SEE in ${imageBlocks.length > 1 ? 'these images' : 'this image'} — colors, accessories, eyes, outline/art style, proportions):

CHARACTER IDENTITY — LOCKED VISUAL ASSET, DO NOT REDESIGN:
The cartoon giraffe "Domnul Girafă" must match the reference image EXACTLY:
- Body: glossy neon-yellow/gold
- Spots: orange, on legs, back and neck
- Hat: beige/brown straw hat, tilted for comic effect
- Bow tie: orange to red-orange
- Eyes: large and expressive, blue pupils, white sclera, sweet expression
- Outline: clean black outline, 90s–2000s cartoon style
- Proportions: very long neck (~40% of total height), small body, black hooves
Never change colors, proportions, accessories or art style. Same character in every frame.

Return ONLY the block, nothing else.` },
          ],
        }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = await res.json();
    const text = data.content?.find((c: any) => c.type === 'text')?.text?.trim();
    return text || fallback;
  } catch (err: any) {
    console.error('[studio/characters] identity lock via Claude failed, using template:', err?.message);
    return fallback;
  }
}
