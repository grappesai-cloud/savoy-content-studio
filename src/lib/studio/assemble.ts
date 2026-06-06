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

// drawtext is picky about special characters; typographic swaps beat escapes.
function drawtextEsc(s: string): string {
  return s.replace(/\\/g, '＼').replace(/'/g, '’').replace(/:/g, '\\:')
    .replace(/%/g, '\\%').replace(/,/g, '\\,');
}

// Wrap a replica into lines of ~26 chars so it reads at reel size.
function wrapText(s: string, max = 26): string {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

export async function assembleReel(opts: {
  clipUrls: string[];       // absolute URLs, in scene order
  audioUrl?: string | null; // legacy: ONE full read laid over the whole cut
  sceneAudioUrls?: (string | null)[]; // per-scene lines — each aligned to its clip's start
  sceneTexts?: (string | null)[];     // per-scene replicas — burned as subtitles
  musicUrl?: string | null;           // license-free bed, mixed under the voice
  fontUrl?: string | null;            // TTF for drawtext (serverless has no fonts)
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
      const durations: number[] = [];
      const segs: string[] = [];
      for (let i = 0; i < clips.length; i++) {
        const dur = await clipDuration(clips[i]);
        durations.push(dur);
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

      const total = durations.reduce((a, b) => a + b, 0);

      // Subtitles: each replica burned over ITS scene (timed via clip starts).
      // IG reels mostly play muted — the text carries the message, and it
      // makes phoneme-accuracy irrelevant. Needs the re-encode anyway.
      const texts = opts.sceneTexts ?? [];
      let vfilter = '[0:v]null[v]';
      let font: string | null = null;
      if (texts.some(Boolean) && opts.fontUrl) {
        try {
          const fres = await fetch(opts.fontUrl);
          if (!fres.ok) throw new Error(`font fetch ${fres.status}`);
          font = join(dir, 'font.ttf');
          await writeFile(font, Buffer.from(await fres.arrayBuffer()));
          const draws: string[] = [];
          let t0 = 0;
          for (let i = 0; i < clips.length; i++) {
            const text = texts[i];
            const t1 = t0 + durations[i];
            if (text) {
              draws.push(
                `drawtext=fontfile='${font}':text='${drawtextEsc(wrapText(text))}'` +
                `:fontsize=52:fontcolor=white:line_spacing=10` +
                `:box=1:boxcolor=black@0.45:boxborderw=18` +
                `:x=(w-text_w)/2:y=h*0.80-text_h/2` +
                `:enable='between(t,${t0.toFixed(2)},${(t1 - 0.05).toFixed(2)})'`
              );
            }
            t0 = t1;
          }
          if (draws.length) vfilter = `[0:v]${draws.join(',')}[v]`;
        } catch (err: any) {
          console.error('[studio/assemble] subtitles skipped:', err?.message);
        }
      }

      // Music bed under the voice: low volume, fade out on the last 1.5s.
      let music: string | null = null;
      if (opts.musicUrl) {
        try {
          const mres = await fetch(opts.musicUrl);
          if (!mres.ok) throw new Error(`music fetch ${mres.status}`);
          music = join(dir, 'bed.mp3');
          await writeFile(music, Buffer.from(await mres.arrayBuffer()));
        } catch (err: any) {
          console.error('[studio/assemble] music skipped:', err?.message);
        }
      }
      const afilter = music
        ? `[2:a]atrim=0:${total.toFixed(2)},volume=0.16,afade=t=out:st=${Math.max(0, total - 1.5).toFixed(2)}:d=1.5[m];[1:a][m]amix=inputs=2:duration=first:normalize=0[a]`
        : `[1:a]anull[a]`;

      const mixed = join(dir, 'final.mp4');
      await exec(FF, [
        '-y', '-i', cut, '-i', track, ...(music ? ['-i', music] : []),
        '-filter_complex', `${vfilter};${afilter}`,
        '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-shortest', '-movflags', '+faststart', mixed,
      ], { timeout: 300_000 });
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
