// ─── Final assembly ───────────────────────────────────────────────────────────
//
// A reel = 2-3 anchored scene clips. We concat them (stream copy first — same
// provider, same params — with a re-encode fallback) and, when a voice track
// exists, lay the full ElevenLabs read over the cut. ffmpeg-static runs fine
// inside a Vercel function; a 24s 9:16 concat takes ~1-2s.

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

export async function assembleReel(opts: {
  clipUrls: string[];       // absolute URLs, in scene order
  audioUrl?: string | null; // full voice track (giraffe mode)
  reelId: string;
}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'savoy-'));
  try {
    // 1) Download every clip
    const clips: string[] = [];
    for (let i = 0; i < opts.clipUrls.length; i++) {
      const res = await fetch(opts.clipUrls[i]);
      if (!res.ok) throw new Error(`Clip ${i + 1} fetch failed: ${res.status}`);
      const p = join(dir, `clip${i}.mp4`);
      await writeFile(p, Buffer.from(await res.arrayBuffer()));
      clips.push(p);
    }

    // 2) Concat — stream copy, re-encode fallback if params mismatch
    const list = join(dir, 'list.txt');
    await writeFile(list, clips.map(c => `file '${c}'`).join('\n'));
    const cut = join(dir, 'cut.mp4');
    try {
      await exec(FF, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', cut], { timeout: 120_000 });
    } catch {
      await exec(FF, ['-y', '-f', 'concat', '-safe', '0', '-i', list,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '20',
        '-c:a', 'aac', cut], { timeout: 300_000 });
    }

    // 3) Voice over the cut (replaces clip audio; lip-synced clips carry their
    //    own track in real mode — there this becomes a per-scene mix, TODO(kickoff))
    let out = cut;
    if (opts.audioUrl) {
      const ares = await fetch(opts.audioUrl);
      if (ares.ok) {
        const voice = join(dir, 'voice.mp3');
        await writeFile(voice, Buffer.from(await ares.arrayBuffer()));
        const mixed = join(dir, 'final.mp4');
        await exec(FF, ['-y', '-i', cut, '-i', voice,
          '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac',
          '-af', 'apad', '-shortest', '-movflags', '+faststart', mixed], { timeout: 120_000 });
        out = mixed;
      }
    }

    const blob = await put(`studio/${opts.reelId}/reel-final.mp4`, await readFile(out), {
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
