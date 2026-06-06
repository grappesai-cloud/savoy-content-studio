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

// ffmpeg-static ships no ffprobe; `ffmpeg -i` exits non-zero but prints
// "Duration: 00:00:05.04" on stderr — parse it from the thrown error.
async function clipDuration(path: string): Promise<number> {
  try {
    await exec(FF, ['-i', path], { timeout: 30_000 });
  } catch (err: any) {
    const m = String(err?.stderr ?? '').match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  throw new Error(`Could not read duration of ${path}`);
}

export async function assembleReel(opts: {
  clipUrls: string[];       // absolute URLs, in scene order
  audioUrl?: string | null; // legacy: ONE full read laid over the whole cut
  sceneAudioUrls?: (string | null)[]; // per-scene lines — each aligned to its clip's start
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

    // 3a) Per-scene voice: each line padded with silence to EXACTLY its clip's
    //     duration, then concatenated — every replica starts the moment its
    //     scene starts. This is what makes the talking direction read as
    //     actual speech (a single full read drifts across scene cuts).
    let out = cut;
    const sceneAudio = opts.sceneAudioUrls ?? [];
    if (sceneAudio.some(Boolean)) {
      const segs: string[] = [];
      for (let i = 0; i < clips.length; i++) {
        const dur = await clipDuration(clips[i]);
        const seg = join(dir, `aseg${i}.m4a`);
        const lineUrl = sceneAudio[i];
        if (lineUrl) {
          const ares = await fetch(lineUrl);
          if (!ares.ok) throw new Error(`Scene ${i + 1} audio fetch failed: ${ares.status}`);
          const line = join(dir, `line${i}.mp3`);
          await writeFile(line, Buffer.from(await ares.arrayBuffer()));
          // pad to clip length; a line longer than its clip is trimmed
          await exec(FF, ['-y', '-i', line, '-af', 'apad', '-t', dur.toFixed(3),
            '-ar', '44100', '-ac', '2', '-c:a', 'aac', seg], { timeout: 60_000 });
        } else {
          await exec(FF, ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
            '-t', dur.toFixed(3), '-c:a', 'aac', seg], { timeout: 60_000 });
        }
        segs.push(seg);
      }
      const track = join(dir, 'voice-track.m4a');
      await exec(FF, [
        '-y', ...segs.flatMap(s => ['-i', s]),
        '-filter_complex', `${segs.map((_, i) => `[${i}:a]`).join('')}concat=n=${segs.length}:v=0:a=1[a]`,
        '-map', '[a]', '-c:a', 'aac', track,
      ], { timeout: 120_000 });
      const mixed = join(dir, 'final.mp4');
      await exec(FF, ['-y', '-i', cut, '-i', track,
        '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac',
        '-shortest', '-movflags', '+faststart', mixed], { timeout: 120_000 });
      out = mixed;
    } else if (opts.audioUrl) {
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
