// ── Step 2: anchor stills, one per scene (identity-locked in giraffe mode) ───
// POST without body → submit every scene that lacks a ready image.
// POST {scene: n}  → regenerate just that scene (before approval).

import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/api-utils';
import { getReel, updateReel, setStoryboard } from '../../../../../lib/studio/db';
import { submitImage, submitIntegrate, submitCharacterAnchor } from '../../../../../lib/studio/providers';
import { GIRAFFE_MASTER_IMAGE, GIRAFFE_IDENTITY_LOCK, GIRAFFE_POSES, BACKDROPS, STUDIO_MOCK, publicAssetBase } from '../../../../../lib/studio/config';
import { compositeAnchor } from '../../../../../lib/studio/anchor';
import { getCharacter } from '../../../../../lib/studio/characters';
import { e } from '../../../../../lib/env';

const ALLOWED = new Set(['storyboard_ready', 'image_generating', 'image_ready', 'image_failed']);

export const POST: APIRoute = async ({ locals, params, request, url }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const reel = await getReel(params.id!, user.id);
  if (!reel) return json({ error: 'Not found' }, 404);
  if (!reel.storyboard) return json({ error: 'Generează storyboard-ul întâi.' }, 409);
  if (!ALLOWED.has(reel.status)) {
    return json({ error: `Nu pot genera imagini din starea "${reel.status}".` }, 409);
  }

  const body = await request.json().catch(() => ({}));
  const onlyScene: number | null = typeof body?.scene === 'number' ? body.scene : null;

  // Simple flow: ONE generated image for the whole reel. FLUX Kontext gets the
  // transparent pose alpha and paints the background around it from the idea
  // (validated live: identity survives, scene is invented). The single job is
  // assigned to EVERY scene — the poll route resolves each to the same still.
  if (body?.single === true && reel.mode === 'giraffe' && !STUDIO_MOCK()) {
    const storyboard1 = reel.storyboard;
    const pose1 = GIRAFFE_POSES.find(p => p.id === storyboard1.scenes[0]?.pose) ?? GIRAFFE_POSES[0];
    const poseAlpha = new URL(`/studio/poses/alpha/${pose1.id}.png`, publicAssetBase(url.origin)).toString();
    try {
      const { jobId, provider } = await submitCharacterAnchor({
        masterImageUrl: poseAlpha,
        scenePrompt: `${reel.scene_prompt}. The giraffe stands in the MIDDLE DISTANCE, small in the frame (about one third of the frame height), on the ground, with a soft contact shadow under its hooves. It must stay a FLAT 2D hand-drawn cartoon with black ink outlines — do not make it 3D.`,
        identityLock: GIRAFFE_IDENTITY_LOCK,
      });
      for (const scene of storyboard1.scenes) {
        scene.image = { status: 'generating', provider, jobId, url: null };
      }
      await setStoryboard(reel.id, storyboard1);
      await updateReel(reel.id, { status: 'image_generating', clearError: true },
        { stage: 'image', msg: 'Imagine unică generată pentru tot reelul' });
      return json({ submitted: storyboard1.scenes.length, single: true });
    } catch (err: any) {
      return json({ error: `Generarea imaginii a eșuat: ${err?.message}` }, 502);
    }
  }

  const withGiraffe = reel.mode === 'giraffe';
  const character = reel.character_id ? await getCharacter(reel.character_id, user.id) : null;
  const storyboard = reel.storyboard;
  // Until the sponsor confirms the Nano Banana model path, giraffe anchors
  // come STRAIGHT from the official pose pack: identity is perfect by
  // definition (they ARE the brand asset) and Kling animates from them
  // beautifully (verified live). Flip by setting HIGGSFIELD_IMAGE_MODEL_GIRAFFE.
  // Custom characters have no pose pack — their anchors are generated from the
  // master image via FLUX Kontext (design-preserving edit, verified live).
  const directAnchors = withGiraffe && !character && !e('HIGGSFIELD_IMAGE_MODEL_GIRAFFE') && !STUDIO_MOCK();
  let submitted = 0;

  for (const scene of storyboard.scenes) {
    if (onlyScene !== null && scene.n !== onlyScene) continue;
    if (onlyScene === null && scene.image.status === 'ready') continue;

    if (withGiraffe && character) {
      try {
        const { jobId, provider } = await submitCharacterAnchor({
          masterImageUrl: character.master_image_url,
          scenePrompt: scene.description,
          identityLock: character.identity_lock,
        });
        scene.image = { status: 'generating', provider, jobId, url: null };
        submitted++;
      } catch (err: any) {
        scene.image = { status: 'failed', error: err?.message };
      }
      continue;
    }

    const assetBase = publicAssetBase(url.origin);
    const pose = GIRAFFE_POSES.find(p => p.id === scene.pose);
    if (directAnchors) {
      const backdrop = BACKDROPS.find(b => b.id === scene.backdrop);
      if (backdrop) {
        // Giraffe composited INTO the real hotel photo (deterministic ffmpeg).
        // Inputs are fetched server-side (url.origin works even in local dev);
        // the OUTPUT anchor lands on Blob, which is what Kling fetches.
        try {
          const anchorUrl = await compositeAnchor({
            backdropUrl: new URL(backdrop.file, url.origin).toString(),
            poseAlphaUrl: new URL(`/studio/poses/alpha/${pose?.id ?? 'walk'}.png`, url.origin).toString(),
            reelId: reel.id,
            sceneN: scene.n,
            // Dialogue scenes go mid-ground: Kling corrupts hero-size detail
            // (extra limbs) and a distant mouth sells the sync illusion.
            midGround: !!scene.dialogue,
          });
          // Anti-sticker pass: FLUX Kontext re-lights the composite (ambient
          // light on the character, real shadow, reflection) while preserving
          // the design. Async job — the poll route archives the result. If the
          // submit fails, the raw composite is still a valid anchor.
          try {
            const { jobId, provider } = await submitIntegrate(anchorUrl);
            scene.image = { status: 'generating', provider, jobId, url: null };
          } catch (err: any) {
            console.error('[studio/integrate] kontext submit failed, raw composite kept:', err?.message);
            scene.image = { status: 'ready', provider: 'composite', url: anchorUrl };
          }
          submitted++;
          continue;
        } catch (err: any) {
          console.error('[studio/anchor] composite failed, falling back to pose:', err?.message);
        }
      }
      const file = pose?.file ?? GIRAFFE_MASTER_IMAGE;
      scene.image = { status: 'ready', provider: 'pose-pack', url: new URL(file, assetBase).toString() };
      submitted++;
      continue;
    }

    const refImageUrls = withGiraffe
      ? [
          new URL(GIRAFFE_MASTER_IMAGE, assetBase).toString(),
          ...(pose ? [new URL(pose.file, assetBase).toString()] : []),
        ]
      : undefined;
    try {
      const { jobId, provider } = await submitImage({
        scenePrompt: scene.description,
        withGiraffe,
        refImageUrls,
      });
      scene.image = { status: 'generating', provider, jobId, url: null };
      submitted++;
    } catch (e: any) {
      scene.image = { status: 'failed', error: e?.message };
    }
  }

  if (submitted === 0) return json({ error: 'Nicio scenă de generat.' }, 409);

  await setStoryboard(reel.id, storyboard);
  const allReady = storyboard.scenes.every(s => s.image.status === 'ready');
  await updateReel(reel.id, {
    status: allReady ? 'image_ready' : 'image_generating',
    bump: 'image_attempts',
    clearError: true,
  }, { stage: 'image', msg: allReady
    ? 'Ancore directe din pozele oficiale, identitate garantată'
    : `Generare imagini: ${submitted} scen${submitted === 1 ? 'ă' : 'e'}` });
  return json({ ok: true, submitted });
};
