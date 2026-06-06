# Savoy Content Studio 🦒

**Hack A Ton 2026 · ThePlace, Mamaia · Challenge: Savoy Content Studio (Savoy Hotel Mamaia)**

Text idea → identity-locked image of **Domnul Girafă** → human approval → finished **9:16 reel (15-30s)**, scheduled into a posting calendar. Operated end-to-end by a marketing team with zero technical skills.

## What's inside

| Route | What it is |
|---|---|
| `/savoy` | Public site: redesign of savoyhotel.ro (editorial serif, cream→night scroll transition, parallax mascot) |
| `/savoy/admin` | Marketing dashboard: stats, reel library, post scheduler (caption + platforms + datetime) |
| `/studio` | The Content Studio tool: two modes, prompt library, pose picker, approval gate, live progress |
| `/sign-in` | Better-Auth email login (required by the brief) |

## The two modes

**Mode 1 · Hotel Scene** — free prompt or library pick → image (Higgsfield GPT Image 2) → human approval → ~8s motion clip (Seedance 2.0) → **looped 3x via ffmpeg stream-copy to a 24s final** (the brief requires 15-30s).

**Mode 2 · The Giraffe Speaks** — dialogue + scene → identity-locked image (Nano Banana, master `girafa.jpg` + optional official pose as second reference) → approval → ElevenLabs Romanian TTS (voice `g8YRbOlJsPkrezcSUiCM`, settings pinned from the brief) → lip-synced video (HeyGen).

## Identity lock

`src/lib/studio/config.ts` carries the verbatim "LOCKED visual asset — DO NOT redesign" block (neon-yellow body, orange spots, straw hat, bow tie, ~40% neck) appended to **every** giraffe prompt, plus the sponsor master image and the 7 official poses (`public/studio/`, pose picker in the UI: identity from reference A, pose from reference B).

## Cost discipline

The approval gate is **server-enforced**: calling video generation before a human approves the image returns `409`. Every paid attempt is counted (`image_attempts`, `video_attempts`) and every step lands in an append-only `events` audit log.

## Architecture

```
Astro (SSR, Vercel) ── Better-Auth ── Neon Postgres ── Vercel Blob
        │
        ├── POST /api/studio/reels                     create (scene | giraffe, optional pose)
        ├── POST /api/studio/reels/:id/generate-image  identity-locked submit → provider job id
        ├── GET  /api/studio/reels/:id                 poll: advances jobs, archives artifacts,
        │                                              assembles 24s final for scene mode
        ├── POST /api/studio/reels/:id/approve         ★ the gate
        ├── POST /api/studio/reels/:id/generate-video  TTS (sync) → video submit
        └── /api/studio/posts                          post scheduler CRUD
```

No background worker: providers are async (submit → poll), so each request stays short and the whole thing runs serverless. Artifacts are archived from expiring provider URLs into Vercel Blob.

## Run it

```bash
npm install
cp .env.example .env          # fill DATABASE_URL (Postgres) + BETTER_AUTH secrets
node scripts/migrate.mjs      # applies the studio schema (additive, idempotent)
STUDIO_MOCK=1 npm run dev     # full flow on placeholder assets, zero API keys needed
```

With the sponsor keys (kickoff `config.yaml`): set `HIGGSFIELD_API_KEY`, `ELEVENLABS_API_KEY`, `HEYGEN_API_KEY` and drop `STUDIO_MOCK`. Provider payloads live behind one seam (`src/lib/studio/providers.ts`); ElevenLabs is fully implemented per the brief's locked voice settings.

## Verified

- Mock pipeline end-to-end: create → image → premature video rejected with 409 → approve → TTS → video → complete
- Scene assembly: 24.02s, 1080×1920, H.264 on Blob
- Build green, UI screenshot-verified (LP hero, night chapter, admin, pose picker)

---
Built with the Grappes render/credits infrastructure patterns. Team: Alexandru Cojanu.

## Credite

Muzică: "Carefree" — Kevin MacLeod (incompetech.com), licență [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Font subtitrări: Poppins (OFL).
