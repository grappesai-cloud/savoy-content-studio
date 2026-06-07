// Reel 5x5 cu QC per clip: genereaza fiecare scena INDEPENDENT, verifica cu Claude vision
// contra referintei oficiale, regenereaza pana trece (max 3 incercari), apoi asambleaza.
// State: /tmp/savoy-5x5-qc-state.json (id-uri + verdicte salvate imediat).
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
const env = {};
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const AUTH = `Key ${env.HIGGSFIELD_API_KEY}:${env.HIGGSFIELD_API_SECRET}`;
const STATE = '/tmp/savoy-5x5-qc-state.json';
const FF = '/opt/homebrew/bin/ffmpeg';
const REF = '/Users/alexandrucojanu/Downloads/ChatGPT_Image_Apr_28__2026_at_01_49_26_PM-removebg-preview.png';
const MAX_TRIES = 3;

const SCENES = [
  { name: 's1', anchor: 'https://hchm8ghkdqg43yc0.public.blob.vercel-storage.com/studio/test/anchor-s1.png', voice: '/tmp/savoy-v5b-1.mp3', vdur: 4.64 },
  { name: 's2', anchor: 'https://hchm8ghkdqg43yc0.public.blob.vercel-storage.com/studio/test/anchor-s2.png', voice: '/tmp/savoy-v5b-2.mp3', vdur: 4.09 },
  { name: 's3', anchor: 'https://hchm8ghkdqg43yc0.public.blob.vercel-storage.com/studio/test/anchor-s3.png', voice: '/tmp/savoy-v5b-3.mp3', vdur: 4.60 },
  { name: 's4', anchor: 'https://hchm8ghkdqg43yc0.public.blob.vercel-storage.com/studio/test/5x5-s4-anchor.png', voice: '/tmp/savoy-v5b-4.mp3', vdur: 3.99 },
  { name: 's5', anchor: 'https://hchm8ghkdqg43yc0.public.blob.vercel-storage.com/studio/test/5x5-s5-anchor.png', voice: '/tmp/savoy-v5b-5.mp3', vdur: 4.23 },
];
const TALK = `The flat 2D cartoon giraffe character is SPEAKING from the very FIRST frame, mouth clearly opening and closing continuously like a TV host presenting, never pauses talking. Secondary subtle motion ONLY: slight head bobs, gentle weight shifts. Its arms stay completely still at its sides for the entire clip, NO gestures, NO waving. The character has EXACTLY two arms, two legs and one tail, all visible limbs ending in black hooves — no limb is ever added, duplicated or split. It stays a flat 2D hand-drawn cartoon with black ink outlines, design 100% identical to the input image. The real inflatable playground background stays static, no people enter the frame.`;
const NEG = 'extra limbs, third arm, extra hand, extra leg, two tails, second tail, new arm appearing, limbs splitting, waving, gesturing, big gestures, closed mouth, static mouth, human fingers, deformed, 3D render, realistic giraffe';

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));
const b64 = p => readFileSync(p).toString('base64');

async function submitKling(anchor) {
  const res = await fetch('https://platform.higgsfield.ai/kling-video/v2.1/pro/image-to-video', {
    method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: anchor, prompt: TALK, duration: 5, negative_prompt: NEG }),
  });
  const j = await res.json();
  if (!j.request_id) throw new Error(`submit failed: ${res.status} ${JSON.stringify(j)}`);
  return j.request_id;
}
async function pollVideo(id, out) {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const s = await (await fetch(`https://platform.higgsfield.ai/requests/${id}/status`, { headers: { Authorization: AUTH } })).json();
    const url = s.video?.url || s.video || s.videos?.[0]?.url;
    if (s.status === 'completed' || url) { writeFileSync(out, Buffer.from(await (await fetch(url)).arrayBuffer())); return; }
    if (s.status === 'failed') throw new Error(`kling failed: ${JSON.stringify(s)}`);
  }
  throw new Error('poll timeout');
}

async function qcClip(clip, name) {
  // 4 frame-uri pe durata vorbita, zoom pe girafa
  for (let i = 0; i < 4; i++) {
    const t = (0.5 + i * 1.3).toFixed(1);
    execSync(`${FF} -y -ss ${t} -i ${clip} -vf "crop=iw*0.7:ih*0.75:iw*0.14:ih*0.22,scale=600:-1" -frames:v 1 /tmp/qcf-${name}-${i}.png 2>/dev/null`, { shell: '/bin/bash' });
  }
  const content = [
    { type: 'text', text: 'IMAGINE DE REFERINTA (caracterul oficial):' },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64(REF) } },
    { type: 'text', text: 'FRAME-URI DIN CLIPUL GENERAT:' },
    ...[0,1,2,3].flatMap(i => [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64(`/tmp/qcf-${name}-${i}.png`) } }]),
    { type: 'text', text: `Verifica STRICT fiecare frame contra referintei. Caracterul oficial are EXACT: 2 brate cu copite negre, 2 picioare cu copite negre, 1 coada cu smoc, 1 cap cu palarie de paie si papion portocaliu, stil 2D flat cu contur negru. FAIL daca in ORICE frame: apare un membru in plus (al 3-lea brat/mana, al 3-lea picior, a 2-a coada), un membru se dubleaza/despica, dispare papionul/palaria, stilul devine 3D, sau anatomia difera vizibil de referinta. Numara membrele cu atentie in fiecare frame. Raspunde DOAR cu JSON: {"pass": true/false, "reason": "explicatie scurta per frame daca fail"}` },
  ];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 300, messages: [{ role: 'user', content }] }),
  });
  const j = await res.json();
  if (!j.content) throw new Error('qc api: ' + JSON.stringify(j).slice(0, 300));
  const txt = j.content[0].text;
  const m = txt.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { pass: false, reason: 'unparseable: ' + txt.slice(0, 100) };
}

for (const sc of SCENES) {
  state[sc.name] = state[sc.name] || { tries: [] };
  if (state[sc.name].passed) { console.log(`${sc.name}: deja trecut`); continue; }
  let ok = false;
  for (let attempt = state[sc.name].tries.length; attempt < MAX_TRIES && !ok; attempt++) {
    const id = await submitKling(sc.anchor);
    state[sc.name].tries.push({ id }); save();
    console.log(`${sc.name} attempt ${attempt + 1} submitted: ${id}`);
    const clip = `/tmp/savoy-5x5-${sc.name}-try${attempt + 1}.mp4`;
    await pollVideo(id, clip);
    const verdict = await qcClip(clip, sc.name);
    state[sc.name].tries[attempt].verdict = verdict; save();
    console.log(`${sc.name} attempt ${attempt + 1} QC: ${verdict.pass ? 'PASS' : 'FAIL — ' + verdict.reason}`);
    if (verdict.pass) { state[sc.name].passed = clip; save(); ok = true; }
  }
  if (!ok) console.log(`${sc.name}: ${MAX_TRIES} incercari esuate — il marchez pentru decizie manuala`);
}

const ready = SCENES.filter(sc => state[sc.name].passed);
if (ready.length < SCENES.length) { console.log(`DOAR ${ready.length}/5 au trecut QC — nu asamblez. Vezi ${STATE}`); process.exit(2); }

const vparts = [], aparts = [], inputs = [];
SCENES.forEach((sc, i) => {
  const dur = Math.min(sc.vdur + 0.35, 5.04);
  inputs.push(`-i ${state[sc.name].passed} -i ${sc.voice}`);
  vparts.push(`[${i * 2}:v]trim=0:${dur.toFixed(2)},setpts=PTS-STARTPTS[v${i}]`);
  aparts.push(`[${i * 2 + 1}:a]apad=whole_dur=${dur.toFixed(2)}[a${i}]`);
});
const fc = `${vparts.join(';')};${aparts.join(';')};${SCENES.map((_, i) => `[v${i}]`).join('')}concat=n=5:v=1:a=0[v];${SCENES.map((_, i) => `[a${i}]`).join('')}concat=n=5:v=0:a=1[a]`;
execSync(`${FF} -y ${inputs.join(' ')} -filter_complex "${fc}" -map "[v]" -map "[a]" -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 128k ~/Desktop/savoy-reel-5x5-qc.mp4 2>/dev/null`, { stdio: 'inherit', shell: '/bin/bash' });
console.log('REEL DONE: ~/Desktop/savoy-reel-5x5-qc.mp4');
