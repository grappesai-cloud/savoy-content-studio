// ─── Mode 3: Domnul Girafă over the user's own footage ───────────────────────
//
// Deterministic, zero generation cost: the official pose (pre-cut to real
// alpha — exterior flood fill, so the white of the eyes survives) is overlaid
// onto the uploaded video with a gentle idle bob, and the ElevenLabs line is
// mixed over the original audio. Pure ffmpeg; runs inside a Vercel function.

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

export async function overlayGiraffe(opts: {
  videoUrl: string;     // user upload (Blob URL)
  poseAlphaUrl: string; // absolute URL to poses/alpha/<pose>.png
  audioUrl?: string | null; // optional voice line
  reelId: string;
}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'savoy-ov-'));
  try {
    const fetchTo = async (url: string, name: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Fetch failed (${name}): ${res.status}`);
      const p = join(dir, name);
      await writeFile(p, Buffer.from(await res.arrayBuffer()));
      return p;
    };
    const video = await fetchTo(opts.videoUrl, 'in.mp4');
    const pose = await fetchTo(opts.poseAlphaUrl, 'pose.png');
    const voice = opts.audioUrl ? await fetchTo(opts.audioUrl, 'voice.mp3') : null;

    // Giraffe at ~38% of video height, bottom-right, gentle 12px bob.
    // shortest=1 is load-bearing: the -loop'ed PNG is an infinite stream, so
    // without it the overlay never EOFs and ffmpeg encodes forever.
    const filter =
      `[1]scale=-1:'min(ih*0.38,720)'[g];` +
      `[0][g]overlay=shortest=1:x='W-w-W*0.04':y='H-h-H*0.03+12*sin(t*1.8)'[v]`;

    const out = join(dir, 'out.mp4');
    const args = voice
      ? ['-y', '-i', video, '-loop', '1', '-i', pose, '-i', voice,
         '-filter_complex',
         `${filter};[0:a]volume=0.25[a0];[2:a]apad[a1];[a0][a1]amix=inputs=2:duration=first[a]`,
         '-map', '[v]', '-map', '[a]',
         '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '21',
         '-c:a', 'aac', '-shortest', '-movflags', '+faststart', out]
      : ['-y', '-i', video, '-loop', '1', '-i', pose,
         '-filter_complex', filter,
         '-map', '[v]', '-map', '0:a?',
         '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '21',
         '-c:a', 'aac', '-shortest', '-movflags', '+faststart', out];
    await exec(FF, args, { timeout: 600_000 });

    const blob = await put(`studio/${opts.reelId}/overlay.mp4`, await readFile(out), {
      access: 'public',
      contentType: 'video/mp4',
      addRandomSuffix: true,
      token: e('BLOB_READ_WRITE_TOKEN'),
    });
    return blob.url;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
