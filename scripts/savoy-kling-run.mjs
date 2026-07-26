// Savoy giraffe — Kling i2v on the clean cutout anchor (skip flux; my compositor
// already has a clean contact shadow). Resumable; request_id saved immediately.
import { put } from '@vercel/blob';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const env = {};
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const AUTH = `Key ${env.HIGGSFIELD_API_KEY}:${env.HIGGSFIELD_API_SECRET}`;
const FF = '/Users/alexandrucojanu/savoy-content-studio/node_modules/ffmpeg-static/ffmpeg';
const STATE = '/tmp/savoy-kling-run-state.json';
const COMP = '/tmp/savoy-anchor-comp.png';
const VOICE = '/tmp/savoy_greet.mp3';
const OUT = '/Users/alexandrucojanu/Desktop/savoy-girafa-kling-NEW.mp4';

const TALK = `A small flat 2D cartoon giraffe character stands in a hotel lobby and SPEAKS warmly from the very FIRST frame, mouth opening and closing continuously like a friendly TV host welcoming guests, never pausing. Only subtle secondary motion: gentle head bobs and tilts, slow blinks, soft neck sway. Its body, legs and tail stay COMPLETELY STILL, hooves planted — no walking, no gestures, no waving, no floating. The character keeps EXACTLY four legs and one tail at all times; no limb is ever added, duplicated or split. It stays a flat 2D hand-drawn cartoon with black ink outlines, identical to the input image. The real lobby background stays static, no people walk in.`;
const NEG = 'extra limbs, fifth leg, extra leg, second tail, duplicated limbs, limbs splitting, walking, waving, gesturing, big gestures, floating, levitating, closed mouth, static mouth, hidden mouth, deformed, 3D render, realistic giraffe, redesigned character, restyled, background people moving, morphing, blurry';

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));

async function poll(id, label) {
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 8000));
    const s = await (await fetch(`https://platform.higgsfield.ai/requests/${id}/status`, { headers: { Authorization: AUTH } })).json();
    const url = s.video?.url || s.video || s.videos?.[0]?.url || s.images?.[0]?.url;
    if (s.status === 'completed' || url) return url;
    if (s.status === 'failed' || s.status === 'nsfw') throw new Error(`${label} ${id} failed: ${JSON.stringify(s).slice(0, 200)}`);
    if (i % 4 === 0) console.log(`  ${label} ${id} ... ${s.status || '?'}`);
  }
  throw new Error(`poll timeout ${label} ${id}`);
}

if (!state.anchorUrl) {
  state.anchorUrl = (await put('studio/test/kling-anchor.png', readFileSync(COMP), { access: 'public', token: env.BLOB_READ_WRITE_TOKEN, addRandomSuffix: true })).url;
  save(); console.log('anchor uploaded:', state.anchorUrl);
}
if (!state.clipDone) {
  if (!state.klingId) {
    const res = await fetch('https://platform.higgsfield.ai/kling-video/v2.1/pro/image-to-video', {
      method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: state.anchorUrl, prompt: TALK, duration: 10, negative_prompt: NEG }),
    });
    const j = await res.json();
    if (!j.request_id) throw new Error(`kling submit: ${res.status} ${JSON.stringify(j)}`);
    state.klingId = j.request_id; save(); console.log('kling submitted:', state.klingId);
  }
  const vurl = await poll(state.klingId, 'kling');
  writeFileSync('/tmp/savoy-kling-clip.mp4', Buffer.from(await (await fetch(vurl)).arrayBuffer()));
  state.clipDone = true; save(); console.log('clip downloaded');
}
const vdur = parseFloat(execSync(`${FF} -i ${VOICE} 2>&1 | grep Duration | sed -E 's/.*Duration: ([0-9:.]+),.*/\\1/' | awk -F: '{print ($1*3600)+($2*60)+$3}'`).toString().trim()) || 7.6;
const tdur = Math.min(vdur + 0.4, 10);
execSync(`${FF} -y -i /tmp/savoy-kling-clip.mp4 -i ${VOICE} -filter_complex "[0:v]trim=0:${tdur.toFixed(2)},setpts=PTS-STARTPTS[v];[1:a]volume=4dB,apad=whole_dur=${tdur.toFixed(2)}[a]" -map "[v]" -map "[a]" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -ac 2 -movflags +faststart ${OUT}`, { stdio: 'inherit', shell: '/bin/bash' });
console.log('DONE:', OUT);
