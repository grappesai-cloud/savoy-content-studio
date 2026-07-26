// Savoy giraffe — ULTRA-REAL route: Higgsfield Kling image-to-video on the real
// flat-2D artwork (validated recipe: small mid-shot giraffe, body still, only head/mouth
// move). Resumable; request_ids saved to disk IMMEDIATELY (credits were lost once when a
// script died before saving them).
import { put } from '@vercel/blob';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const env = {};
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const AUTH = `Key ${env.HIGGSFIELD_API_KEY}:${env.HIGGSFIELD_API_SECRET}`;
const FF = '/opt/homebrew/bin/ffmpeg';
const STATE = '/Users/alexandrucojanu/grappes-app-studio/assets-3d/render/kling-state.json';
const COMP = '/tmp/savoy-anchor-comp.png';
const VOICE = '/Users/alexandrucojanu/grappes-app-studio/assets-3d/render/voice.mp3';
const OUT = '/Users/alexandrucojanu/Desktop/savoy-girafa-kling.mp4';

const SHADOW = `ONLY add a soft elliptical contact shadow on the marble floor under the small cartoon giraffe's hooves. Do NOT redraw, restyle or modify the giraffe in ANY way: it must stay a FLAT 2D hand-drawn cartoon illustration with black ink outlines, flat yellow fill, flat orange spots, the exact same yellow hat and orange bow tie, exact same pose, exact same pixels, exact same size and position. Do not make it 3D. Background photo unchanged.`;
const TALK = `A small flat 2D cartoon giraffe character stands in the middle distance of a hotel lobby and SPEAKS warmly from the very FIRST frame, mouth opening and closing continuously like a friendly TV host welcoming guests, never pauses talking. Only subtle secondary motion: gentle head bobs and tilts, slow blinks, soft neck sway. Its body, arms, legs and tail stay COMPLETELY STILL, hooves planted — no gestures, no walking, no waving, no floating. The character keeps EXACTLY two arms, two legs and one tail at all times; no limb is ever added, duplicated or split. It stays a flat 2D hand-drawn cartoon with black ink outlines, identical to the input image. The real lobby background stays static, no people walk in.`;
const NEG = 'extra limbs, third arm, extra hand, extra leg, second tail, duplicated limbs, limbs splitting, walking, waving, gesturing, big gestures, floating, levitating, closed mouth, static mouth, hidden mouth, muzzle pointing at camera, deformed, 3D render, realistic giraffe, redesigned character, background people moving, morphing';

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));

async function submit(path, body) {
  const res = await fetch(`https://platform.higgsfield.ai/${path}`, {
    method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!j.request_id) throw new Error(`submit ${path}: ${res.status} ${JSON.stringify(j)}`);
  return j.request_id;
}
async function poll(id, label) {
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 8000));
    const s = await (await fetch(`https://platform.higgsfield.ai/requests/${id}/status`, { headers: { Authorization: AUTH } })).json();
    const url = s.images?.[0]?.url || s.video?.url || s.video || s.videos?.[0]?.url;
    if (s.status === 'completed' || url) return url;
    if (s.status === 'failed' || s.status === 'nsfw') throw new Error(`${label} ${id} failed: ${JSON.stringify(s).slice(0,200)}`);
    if (i % 5 === 0) console.log(`  ${label} ${id} ... ${s.status || '?'}`);
  }
  throw new Error(`poll timeout ${label} ${id}`);
}

// 1) upload composite
if (!state.compUrl) {
  state.compUrl = (await put(`studio/test/toon-comp.png`, readFileSync(COMP), { access: 'public', token: env.BLOB_READ_WRITE_TOKEN, addRandomSuffix: true })).url;
  save(); console.log('comp uploaded');
}
// 2) flux-kontext: add contact shadow, keep flat (this call also confirms credits)
if (!state.anchorUrl) {
  if (!state.fluxId) { state.fluxId = await submit('flux-kontext', { prompt: SHADOW, image_url: state.compUrl, input_image: { type: 'image_url', image_url: state.compUrl }, aspect_ratio: '9:16' }); save(); console.log('flux:', state.fluxId); }
  const url = await poll(state.fluxId, 'flux');
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync('/tmp/savoy-toon-anchor.png', buf);
  state.anchorUrl = (await put(`studio/test/toon-anchor.png`, buf, { access: 'public', token: env.BLOB_READ_WRITE_TOKEN, addRandomSuffix: true })).url;
  save(); console.log('anchor ready');
}
// 3) Kling image-to-video — talking
if (!state.clipDone) {
  if (!state.klingId) { state.klingId = await submit('kling-video/v2.1/pro/image-to-video', { image_url: state.anchorUrl, prompt: TALK, duration: 10, negative_prompt: NEG }); save(); console.log('kling:', state.klingId); }
  const vurl = await poll(state.klingId, 'kling');
  writeFileSync('/tmp/savoy-toon-clip.mp4', Buffer.from(await (await fetch(vurl)).arrayBuffer()));
  state.clipDone = true; save(); console.log('clip done');
}
// 4) mux voice (trim to voice length + tail), louder, faststart
const vdur = parseFloat(execSync(`${FF} -i ${VOICE} 2>&1 | grep Duration | sed -E 's/.*Duration: ([0-9:.]+),.*/\\1/' | awk -F: '{print ($1*3600)+($2*60)+$3}'`).toString().trim()) || 6.1;
const tdur = Math.min(vdur + 0.4, 10);
execSync(`${FF} -y -i /tmp/savoy-toon-clip.mp4 -i ${VOICE} -filter_complex "[0:v]trim=0:${tdur.toFixed(2)},setpts=PTS-STARTPTS[v];[1:a]volume=6dB,apad=whole_dur=${tdur.toFixed(2)}[a]" -map "[v]" -map "[a]" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -ac 2 -movflags +faststart ${OUT}`, { stdio: 'inherit', shell: '/bin/bash' });
console.log('DONE:', OUT);
