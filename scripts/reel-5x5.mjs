// Reel 5x5: 5 scene de 5s, voce per scena, sync prin trim la durata vocii.
// Rulare: node scripts/reel-5x5.mjs        (submit + poll, reia din state daca exista)
// State: /tmp/savoy-5x5-state.json — request_id-urile se scriu IMEDIAT la submit.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
const env = {};
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const AUTH = `Key ${env.HIGGSFIELD_API_KEY}:${env.HIGGSFIELD_API_SECRET}`;
const STATE = '/tmp/savoy-5x5-state.json';
const FF = '/opt/homebrew/bin/ffmpeg';

// Anchors (flux-shadow gata, pe Blob) + voci (durate masurate)
const SCENES = [
  { name: 's1', anchor: 'https://hchm8ghkdqg43yc0.public.blob.vercel-storage.com/studio/test/anchor-s1.png', voice: '/tmp/savoy-v5b-1.mp3', vdur: 4.64 },
  { name: 's2', anchor: 'https://hchm8ghkdqg43yc0.public.blob.vercel-storage.com/studio/test/anchor-s2.png', voice: '/tmp/savoy-v5b-2.mp3', vdur: 4.09 },
  { name: 's3', anchor: 'https://hchm8ghkdqg43yc0.public.blob.vercel-storage.com/studio/test/anchor-s3.png', voice: '/tmp/savoy-v5b-3.mp3', vdur: 4.60 },
  { name: 's4', anchor: 'https://hchm8ghkdqg43yc0.public.blob.vercel-storage.com/studio/test/5x5-s4-anchor.png', voice: '/tmp/savoy-v5b-4.mp3', vdur: 3.99 },
  { name: 's5', anchor: 'https://hchm8ghkdqg43yc0.public.blob.vercel-storage.com/studio/test/5x5-s5-anchor.png', voice: '/tmp/savoy-v5b-5.mp3', vdur: 4.23 },
];
const TALK = `The flat 2D cartoon giraffe character is SPEAKING from the very FIRST frame, mouth clearly opening and closing continuously like a TV host presenting, never pauses talking. Secondary subtle motion ONLY: slight head bobs, gentle weight shifts. Its arms stay completely still at its sides for the entire clip, NO gestures, NO waving, NO new limbs ever appear. The character has exactly TWO arms and TWO legs with black hooves, and stays a flat 2D hand-drawn cartoon with black ink outlines, design 100% identical to the input image. The real inflatable playground background stays static, no people enter the frame.`;
const NEG = 'extra limbs, third arm, extra hand, new arm appearing, waving, gesturing, big gestures, closed mouth, static mouth, human fingers, deformed, 3D render, realistic giraffe';

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));

for (const sc of SCENES) {
  if (state[sc.name]?.done) continue;
  if (!state[sc.name]?.id) {
    const res = await fetch('https://platform.higgsfield.ai/kling-video/v2.1/pro/image-to-video', {
      method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: sc.anchor, prompt: TALK, duration: 5, negative_prompt: NEG }),
    });
    const j = await res.json();
    if (!j.request_id) { console.error(`${sc.name} submit FAILED: ${res.status} ${JSON.stringify(j)}`); save(); process.exit(1); }
    state[sc.name] = { id: j.request_id };
    save(); // ID pe disc INAINTE de poll
    console.log(`${sc.name} submitted: ${j.request_id}`);
  }
}
for (const sc of SCENES) {
  if (state[sc.name]?.done) continue;
  const id = state[sc.name].id;
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const s = await (await fetch(`https://platform.higgsfield.ai/requests/${id}/status`, { headers: { Authorization: AUTH } })).json();
    const url = s.video?.url || s.video || s.videos?.[0]?.url;
    if (s.status === 'completed' || url) {
      writeFileSync(`/tmp/savoy-5x5-${sc.name}.mp4`, Buffer.from(await (await fetch(url)).arrayBuffer()));
      state[sc.name].done = true; save();
      console.log(`${sc.name} done`);
      break;
    }
    if (s.status === 'failed') { console.error(`${sc.name} FAILED: ${JSON.stringify(s)}`); process.exit(1); }
  }
}

// Asamblare: fiecare scena = clip taiat la vocea ei + 0.35s
const vparts = [], aparts = [], inputs = [];
SCENES.forEach((sc, i) => {
  const dur = Math.min(sc.vdur + 0.35, 5.04);
  inputs.push(`-i /tmp/savoy-5x5-${sc.name}.mp4 -i ${sc.voice}`);
  vparts.push(`[${i * 2}:v]trim=0:${dur.toFixed(2)},setpts=PTS-STARTPTS[v${i}]`);
  aparts.push(`[${i * 2 + 1}:a]apad=whole_dur=${dur.toFixed(2)}[a${i}]`);
});
const fc = `${vparts.join(';')};${aparts.join(';')};${SCENES.map((_, i) => `[v${i}]`).join('')}concat=n=5:v=1:a=0[v];${SCENES.map((_, i) => `[a${i}]`).join('')}concat=n=5:v=0:a=1[a]`;
execSync(`${FF} -y ${inputs.join(' ')} -filter_complex "${fc}" -map "[v]" -map "[a]" -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 128k ~/Desktop/savoy-reel-5x5.mp4`, { stdio: 'inherit', shell: '/bin/bash' });
console.log('REEL DONE: ~/Desktop/savoy-reel-5x5.mp4');
