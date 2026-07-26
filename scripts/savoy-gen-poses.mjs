// Generate clean, brand-consistent KEY POSES of the giraffe via flux-kontext (cheap ~$0.03 each).
// Strict prompts: change ONLY the named part, keep the rest pixel-identical. Resumable.
import { put } from '@vercel/blob';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const env = {};
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const AUTH = `Key ${env.HIGGSFIELD_API_KEY}:${env.HIGGSFIELD_API_SECRET}`;
const STATE = '/Users/alexandrucojanu/grappes-app-studio/assets-3d/render/poses-state.json';
const BASE = '/Users/alexandrucojanu/grappes-app-studio/assets-3d/puppet-2d/girafa-stand.png';
const OUTDIR = '/Users/alexandrucojanu/grappes-app-studio/assets-3d/poses';

const KEEP = `Keep the EXACT same flat 2D hand-drawn cartoon giraffe with thick black ink outlines, flat yellow fill, flat orange spots, same yellow hat, same orange bow tie, same big friendly eyes (do NOT enlarge or redraw the eyes), same head, same neck, same body, same legs, same pose, same size, same position — everything pixel-identical EXCEPT the change requested. Plain white background. Do not make it 3D, do not restyle, no teeth.`;
const POSES = [
  { name: 'ah',    prompt: `Change ONLY the mouth of this cartoon giraffe to be clearly OPEN saying "AH" — a rounded dark open mouth with a small soft pink tongue inside, friendly. ${KEEP}` },
  { name: 'oh',    prompt: `Change ONLY the mouth of this cartoon giraffe to a small ROUND "OH" shape, a little dark oval opening. ${KEEP}` },
  { name: 'ee',    prompt: `Change ONLY the mouth of this cartoon giraffe to a wide friendly "EE" — mouth stretched wide and slightly open, a thin dark line of opening. ${KEEP}` },
  { name: 'blink', prompt: `Change ONLY the eyes of this cartoon giraffe to be gently CLOSED (relaxed closed eyelids with soft curved lashes), as in a slow blink. ${KEEP}` },
];

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));
import { mkdirSync } from 'fs'; mkdirSync(OUTDIR, { recursive: true });

async function submit(path, body) {
  const res = await fetch(`https://platform.higgsfield.ai/${path}`, { method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json(); if (!j.request_id) throw new Error(`submit ${path}: ${res.status} ${JSON.stringify(j)}`); return j.request_id;
}
async function poll(id, label) {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 6000));
    const s = await (await fetch(`https://platform.higgsfield.ai/requests/${id}/status`, { headers: { Authorization: AUTH } })).json();
    const url = s.images?.[0]?.url || s.video?.url;
    if (s.status === 'completed' || url) return url;
    if (s.status === 'failed' || s.status === 'nsfw') throw new Error(`${label} failed: ${JSON.stringify(s).slice(0,160)}`);
  }
  throw new Error(`timeout ${label}`);
}

if (!state.baseUrl) { state.baseUrl = (await put('studio/test/pose-base.png', readFileSync(BASE), { access: 'public', token: env.BLOB_READ_WRITE_TOKEN, addRandomSuffix: true })).url; save(); console.log('base uploaded'); }

for (const pz of POSES) {
  state[pz.name] = state[pz.name] || {};
  const st = state[pz.name];
  if (st.done) { console.log(pz.name, 'cached'); continue; }
  if (!st.id) { st.id = await submit('flux-kontext', { prompt: pz.prompt, image_url: state.baseUrl, input_image: { type: 'image_url', image_url: state.baseUrl }, aspect_ratio: '2:3' }); save(); console.log(pz.name, 'submitted', st.id); }
  const url = await poll(st.id, pz.name);
  writeFileSync(`${OUTDIR}/${pz.name}.png`, Buffer.from(await (await fetch(url)).arrayBuffer()));
  st.done = true; save(); console.log(pz.name, 'saved');
}
console.log('ALL POSES DONE ->', OUTDIR);
