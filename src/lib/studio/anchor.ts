// ─── Composite anchors: the giraffe inside the REAL hotel ───────────────────
//
// Deterministic ffmpeg compositing: the alpha-cut official pose goes over a
// real 9:16 hotel photo. The result is the scene's anchor still — Kling then
// animates the whole frame, so the character moves inside the real hotel and
// identity is guaranteed by construction (the pixels are the brand asset).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { put } from '@vercel/blob';
import ffmpegPath from 'ffmpeg-static';
import { e } from '../env';

const exec = promisify(execFile);
const FF = ffmpegPath as unknown as string;

// FLUX Kontext returns 752×1392; Kling follows its input, so a lanczos
// upscale to full 1080×1920 (+ light unsharp) buys real sharpness on a big
// screen for free. Returns a Blob URL.
export async function upscaleAnchor(imageUrl: string, reelId: string, sceneN: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'savoy-up-'));
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Upscale fetch failed: ${res.status}`);
    const src = join(dir, 'in.png');
    await writeFile(src, Buffer.from(await res.arrayBuffer()));
    const out = join(dir, 'out.jpg');
    await exec(FF, [
      '-y', '-i', src,
      '-vf', 'scale=1080:1920:flags=lanczos,unsharp=5:5:0.4:5:5:0.0',
      '-frames:v', '1', '-q:v', '2', out,
    ], { timeout: 60_000 });
    const blob = await put(`studio/${reelId}/anchor-s${sceneN}-hd.jpg`, await readFile(out), {
      access: 'public',
      contentType: 'image/jpeg',
      addRandomSuffix: true,
      token: e('BLOB_READ_WRITE_TOKEN'),
    });
    return blob.url;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function compositeAnchor(opts: {
  backdropUrl: string;  // absolute URL, 1080x1920
  poseAlphaUrl: string; // absolute URL, alpha-cut pose
  reelId: string;
  sceneN: number;
}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'savoy-anchor-'));
  try {
    const fetchTo = async (url: string, name: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Anchor fetch failed (${name}): ${res.status}`);
      const p = join(dir, name);
      await writeFile(p, Buffer.from(await res.arrayBuffer()));
      return p;
    };
    const bg = await fetchTo(opts.backdropUrl, 'bg.jpg');
    const pose = await fetchTo(opts.poseAlphaUrl, 'pose.png');
    const out = join(dir, 'anchor.jpg');

    // Giraffe at ~58% of frame height (1110px of 1920), bottom-center,
    // feet ~96px above the bottom edge so it sits on the floor line.
    // Anti-sticker: a soft contact shadow grounds the character — the pose's
    // alpha is flattened to black, squashed to an ellipse at the feet and
    // blurred, then the character lands on top of it.
    await exec(FF, [
      '-y', '-i', bg, '-i', pose,
      '-filter_complex',
      [
        `[1]scale=-1:1110,format=rgba,split[g][gs]`,
        // shadow: silhouette → black @60% → squash to 11% height → soft blur
        // (geq mangles RGBA channels — colorchannelmixer keeps true black)
        `[gs]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.6,scale=iw*1.2:ih*0.11,boxblur=12:6[sh]`,
        `[0][sh]overlay=x=(W-w)/2:y=H-h-40[bgsh]`,
        `[bgsh][g]overlay=x=(W-w)/2:y=H-h-96`,
      ].join(';'),
      '-frames:v', '1', '-q:v', '3',
      out,
    ], { timeout: 60_000 });

    const blob = await put(`studio/${opts.reelId}/anchor-s${opts.sceneN}.jpg`, await readFile(out), {
      access: 'public',
      contentType: 'image/jpeg',
      addRandomSuffix: true,
      token: e('BLOB_READ_WRITE_TOKEN'),
    });
    return blob.url;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
