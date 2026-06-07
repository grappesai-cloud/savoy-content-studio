// Reel 5x5 mid-ground: girafa mica in plan mediu, 5 clipuri independente, lipire in cod.
import { put } from '@vercel/blob';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
const env = {};
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const AUTH = `Key ${env.HIGGSFIELD_API_KEY}:${env.HIGGSFIELD_API_SECRET}`;
const STATE = '/tmp/savoy-mid-state.json';
const FF = '/opt/homebrew/bin/ffmpeg';
const SCENES = [
  { name: 'm1', voice: '/tmp/savoy-v5b-1.mp3', vdur: 4.64 },
  { name: 'm2', voice: '/tmp/savoy-v5b-2.mp3', vdur: 4.09 },
  { name: 'm3', voice: '/tmp/savoy-v5b-3.mp3', vdur: 4.60 },
  { name: 'm4', voice: '/tmp/savoy-v5b-4.mp3', vdur: 3.99 },
  { name: 'm5', voice: '/tmp/savoy-v5b-5.mp3', vdur: 4.23 },
];
const SHADOW = `ONLY add a soft elliptical contact shadow on the gravel under the small cartoon giraffe's hooves. Do NOT redraw, restyle or modify the giraffe in ANY way: it must stay a FLAT 2D hand-drawn cartoon illustration with black ink outlines, flat yellow fill, flat orange spots, the exact same straw hat and orange bow tie, exact same pose, exact same pixels, exact same size and position. Do not make it 3D. Background photo unchanged.`;
const TALK = `A small flat 2D cartoon giraffe character stands in the middle distance and SPEAKS from the very FIRST frame, mouth opening and closing continuously like a TV host, never pauses talking. Only subtle secondary motion: slight head bobs. Its body, arms, legs and tail stay COMPLETELY STILL — no gestures, no walking, no waving. The character keeps EXACTLY two arms, two legs and one tail at all times; no limb is ever added, duplicated or split. It stays a flat 2D hand-drawn cartoon with black ink outlines, identical to the input image. The real playground background stays static, no people enter.`;
const NEG = 'extra limbs, third arm, extra hand, extra leg, second tail, duplicated limbs, limbs splitting, walking, waving, gesturing, closed mouth, static mouth, deformed, 3D render, realistic giraffe, morphing';

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));

async function submit(path, body) {
  const res = await fetch(`https://platform.higgsfield.ai/${path}`, { method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!j.request_id) throw new Error(`submit ${path}: ${res.status} ${JSON.stringify(j)}`);
  return j.request_id;
}
async function poll(id) {
  for (let i = 0; i < 150; i++) {
    await new Promise(r => setTimeout(r, 8000));
    const s = await (await fetch(`https://platform.higgsfield.ai/requests/${id}/status`, { headers: { Authorization: AUTH } })).json();
    const url = s.images?.[0]?.url || s.video?.url || s.video || s.videos?.[0]?.url;
    if (s.status === 'completed' || url) return url;
    if (s.status === 'failed') throw new Error(`job ${id} failed`);
  }
  throw new Error(`poll timeout ${id}`);
}

async function scene(sc) {
  state[sc.name] = state[sc.name] || {};
  const st = state[sc.name];
  if (!st.anchorUrl) {
    const comp = await put(`studio/test/mid-${sc.name}-comp.png`, readFileSync(`/tmp/savoy-mid-${sc.name}.png`), { access: 'public', token: env.BLOB_READ_WRITE_TOKEN });
    st.fluxId = await submit('flux-kontext', { prompt: SHADOW, image_url: comp.url, input_image: { type: 'image_url', image_url: comp.url }, aspect_ratio: '9:16' });
    save();
    const imgUrl = await poll(st.fluxId);
    const buf = Buffer.from(await (await fetch(imgUrl)).arrayBuffer());
    writeFileSync(`/tmp/savoy-mid-${sc.name}-anchor.png`, buf);
    st.anchorUrl = (await put(`studio/test/mid-${sc.name}-anchor.png`, buf, { access: 'public', token: env.BLOB_READ_WRITE_TOKEN })).url;
    save();
    console.log(`${sc.name} anchor ready`);
  }
  if (!st.clipDone) {
    if (!st.klingId) { st.klingId = await submit('kling-video/v2.1/pro/image-to-video', { image_url: st.anchorUrl, prompt: TALK, duration: 5, negative_prompt: NEG }); save(); console.log(`${sc.name} kling: ${st.klingId}`); }
    const vurl = await poll(st.klingId);
    writeFileSync(`/tmp/savoy-mid-${sc.name}.mp4`, Buffer.from(await (await fetch(vurl)).arrayBuffer()));
    st.clipDone = true; save();
    console.log(`${sc.name} clip done`);
  }
}
await Promise.all(SCENES.map(scene));

const vparts = [], aparts = [], inputs = [];
SCENES.forEach((sc, i) => {
  const dur = Math.min(sc.vdur + 0.35, 5.04);
  inputs.push(`-i /tmp/savoy-mid-${sc.name}.mp4 -i ${sc.voice}`);
  vparts.push(`[${i * 2}:v]trim=0:${dur.toFixed(2)},setpts=PTS-STARTPTS[v${i}]`);
  aparts.push(`[${i * 2 + 1}:a]apad=whole_dur=${dur.toFixed(2)}[a${i}]`);
});
const fc = `${vparts.join(';')};${aparts.join(';')};${SCENES.map((_, i) => `[v${i}]`).join('')}concat=n=5:v=1:a=0[v];${SCENES.map((_, i) => `[a${i}]`).join('')}concat=n=5:v=0:a=1[a]`;
execSync(`${FF} -y ${inputs.join(' ')} -filter_complex "${fc}" -map "[v]" -map "[a]" -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 128k ~/Desktop/savoy-reel-25s-mid.mp4 2>/dev/null`, { stdio: 'inherit', shell: '/bin/bash' });
console.log('REEL DONE: ~/Desktop/savoy-reel-25s-mid.mp4');
