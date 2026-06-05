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
    await exec(FF, [
      '-y', '-i', bg, '-i', pose,
      '-filter_complex',
      `[1]scale=-1:1110[g];[0][g]overlay=x=(W-w)/2:y=H-h-96`,
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
