# SAVOY GIRAFA — RunPod resume info (pod pus pe STOP intre sesiuni)

## Cont / credite
- RunPod cont: Solaas Tech Srl (login browser "red"), balanta ~$15
- API key: in ~/savoy-content-studio/.env (RUNPOD_API_KEY, rpa_...)

## Resurse persistente
- Network volume: id `jkqv0ko3sx` (60GB, EU-SE-1) — MODELELE WAN 2.2 stau aici, nu se re-descarca
- Pod: id `tb48rqwvx4uwad` (A40 48GB, $0.44/h, EU-SE-1)
- SSH key local: ~/.ssh/runpod_savoy

## Cum REPORNESC podul (cand se intoarce Alex)
K=$(grep RUNPOD_API_KEY ~/savoy-content-studio/.env | cut -d= -f2)
# start:
curl -s -X POST "https://rest.runpod.io/v1/pods/tb48rqwvx4uwad/start" -H "Authorization: Bearer $K"
# ia IP+port SSH nou (se schimba la restart):
curl -s "https://api.runpod.io/graphql?api_key=$K" -H 'Content-Type: application/json' \
 -d '{"query":"query{pod(input:{podId:\"tb48rqwvx4uwad\"}){runtime{ports{ip privatePort publicPort type}}}}"}'
# apoi ssh -i ~/.ssh/runpod_savoy -p <PORT> root@<IP>
# porneste comfy: cd /workspace/ComfyUI && nohup python3 main.py --listen 0.0.0.0 --port 8188 >/workspace/comfy.log 2>&1 &

## Cum OPRESC podul (nu mai consuma GPU; modelele raman pe volum)
curl -s -X POST "https://rest.runpod.io/v1/pods/tb48rqwvx4uwad/stop" -H "Authorization: Bearer $K"

## Assets pe pod: /workspace/assets , scripturi /workspace/scripts , anchor /workspace/ComfyUI/input/anchor.png

## SERVERLESS ENDPOINT (Faza 1b) — creat 2026-07-01
- Endpoint id: `gpnfpqh7oyz2ox` (name savoy-giraffe)
- Template id: `pgewt3lrmg` (imagine runpod/worker-comfyui:5.8.6-base + start command care leaga /runpod-volume/ComfyUI/{models,custom_nodes/VHS,input/girafa_master.png} in /comfyui/ + pip VHS deps)
- Volum: jkqv0ko3sx (EU-SE-1), pool GPU: A40/A6000/L40/L40S/6000Ada
- **BAZA CORECTA DE INVOCARE = https://api.runpod.ai/v2/{id}  (NU api.runpod.io — ala da 404!)**
- Run:   POST https://api.runpod.ai/v2/gpnfpqh7oyz2ox/run   body {"input":{"workflow":<API-format>,"images":[{"name":"background.png","image":"<base64>"}]}}
- Status: GET https://api.runpod.ai/v2/gpnfpqh7oyz2ox/status/{jobid}
- Health: GET https://api.runpod.ai/v2/gpnfpqh7oyz2ox/health
- Output: base64 mp4 in output.images[] (type base64). Pt fisiere mari: seteaza S3 env pe template -> type s3_url
- GOTCHA: python-urllib e blocat de Cloudflare (403 code 1010) -> foloseste User-Agent normal sau fetch/undici din Node (studio)
- Workflow builder: ~/savoy-content-studio/runpod-giraffe/build_workflow.py

## PIVOT ARHITECTURA (2026-07-02) — IMAGINE COAPTA (serverless adevarat)
- DE CE: WAN 14B (28GB) pe volum de retea = worker serverless atarna la incarcarea modelului (cold start lent). Solutie = coacem modelele in imagine.
- Worker repo: **savoyagent11-cmd/savoy-giraffe-worker** (PRIVAT) — Dockerfile FROM runpod/worker-comfyui:5.8.6-base + WAN 2.2 i2v high/low + umt5 + vae + clip_vision + Lightning loras + VideoHelperSuite + girafa_master.png baked. Build via GitHub Actions (easimon/maximize-build-space pt 35GB) -> GHCR ghcr.io/savoyagent11-cmd/savoy-giraffe-worker:latest
- Token savoyagent11-cmd (repo+workflow+packages) in ~/savoy-content-studio/.env ca SAVOY_GH_TOKEN (dubla folosinta: push + RunPod registry auth pt pull GHCR privat)
- DUPA build: reconfigureaza endpoint gpnfpqh7oyz2ox -> imageName GHCR + registry auth + SCOATE networkVolumeId (modele coapte) -> devine REGION-FREE (orice DC cu GPU 48GB) -> dispare penuria A40 EU-SE-1. containerDiskInGb ~50 (imagine ~40GB).
- Workflow trimis la endpoint: build_workflow.py (compositing girafa in ComfyUI + WAN i2v lightning), doar poza fundal ca input base64.

## DECIZIE FINALA (2026-07-02) — livrare pe POD-PER-SESIUNE fp8 (calitate identica)
- HF Xet CDN e down/lent -> build imagine serverless blocat (GHA 300KB/s, Mac 0B, pod RunPod fara namespaces). AUTO-RETRY build pe Mac: /tmp/autobuild.sh (nohup), se termina singur cand Xet revine -> ghcr.io/savoyagent11-cmd/savoy-giraffe-worker:latest (fp8). Log: /tmp/autobuild_master.log
- PRODUS = pod-per-sesiune fp8 (motorul dovedit, modele deja pe volum jkqv0ko3sx, workflow build_workflow.py). Calitate = IDENTICA cu reel-ul aprobat (SAVOY_GIRAFA_receptie_FINAL.mp4).
- NEXT (Faza 2 wiring Content Studio): buton Genereaza -> start pod tb48rqwvx4uwad (sau redeploy A40 EU-SE-1, retry pt capacitate) -> upload fundal in ComfyUI input -> submit build_workflow (compositing girafa + WAN i2v lightning, length=durata voce*16) -> poll history -> download mp4 -> ElevenLabs voce (g8YRbOlJsPkrezcSUiCM, RO) -> assemble.ts muxeaza -> stop pod. Provider 'runpod-pod' in providers.ts (submitVideo/pollVideo), fara migratie (storyboard JSONB).
- Cand imaginea serverless e gata pe GHCR: comut pe endpoint gpnfpqh7oyz2ox (reconfig cu imageName GHCR + registry auth savoyagent11-cmd + scoate volum -> region-free). Zero schimbare calitate (tot fp8).

## PRODUS OPERATOR — GATA & VALIDAT (2026-07-02)
Aplicatie in ~/savoy-content-studio/runpod-giraffe/:
- generate.mjs = orchestrator (un apel -> reel): voce ElevenLabs -> ensurePod (start; daca host plin -> terminate+deployFresh pe volum jkqv0ko3sx EU-SE-1, pool GPU 48GB) -> ensureComfy (instaleaza requirements.txt+cv2+gguf pe container fresh, porneste in tmux) -> upload fundal -> build_workflow.py (compositing girafa fp8 + WAN i2v lightning, length=voce*16) -> poll -> download -> mux 1080x1920 -> stop pod. Pod id dinamic in .pod_id.
- server.mjs + public/index.html = web app operator (upload poza + replica + Genereaza -> reel, poll live). Port 8080. GET / , POST /api/generate {background dataURL, dialogue, placement}, GET /api/job/:id, GET /reels/:file.
- VALIDAT cap-coada pe 2 fundaluri (receptie + plaja): girafa brand-perfect, vorbeste, ~2min warm / ~6-15min cold (redeploy+deps). Livrate: ~/Desktop/SAVOY_ORCHESTRATOR_test.mp4, SAVOY_APP_plaja_test.mp4.
- RULEAZA PE COOLIFY (are nevoie de node + ssh client + ffmpeg + ~/.ssh/runpod_savoy + .env cu RUNPOD_API_KEY+ELEVENLABS_API_KEY). NU pe Vercel (orchestratorul are nevoie de ssh/ffmpeg/proces lung).
- DE FACUT ca sa fie live: Dockerfile pt app + deploy pe Coolify (copiaza cheia SSH + .env ca secrets); optional link/embed din Content Studio principal. UPGRADE: cand autobuild.sh termina imaginea serverless (HF Xet revine), pot comuta orchestratorul sa cheme endpoint serverless in loc de pod (mai rapid, fara pornit pod) - aceeasi calitate fp8.

## FIX-URI CALITATE (2026-07-02)
- HARAIT VOCE: cauza = muxarea scotea AAC la 96000 Hz (loudnorm fara resample) -> harait pe playere. FIX in generate.mjs muxReel: aresample=48000 + -ar 48000 (NU folosi resampler=soxr, nu-i in ffmpeg-static -> eroare). Audio acum 48kHz curat.
- LIPSYNC: ramane talking-style (gura pe ritm WAN potrivita pe voce), NU pe foneme (S2V strica fata, respins). Imbunatatit prin prompt in build_workflow.py: gura clar/continuu deschisa-inchisa, expresiv, din primul frame. Reel demo: ~/Desktop/SAVOY_FIX_lipsync_audio.mp4

## PLATFORMA DEPLOYATA LIVE (2026-07-02)
- Server Hetzner: root@116.203.89.201 (Ubuntu 26.04, Docker 29.6, 4CPU/7.6GB). Deploy prin SSH cu parola (paramiko /tmp/psh.py; NU am instalat cheie persistenta - blocat de policy, corect).
- Container: `savoy-giraffe` (docker, restart unless-stopped, -p 8090:8080, --env-file /root/savoy-giraffe.env, -v /root/savoy-reels:/app/reels). Imagine: ghcr.io/savoyagent11-cmd/savoy-giraffe-app:latest.
- Env pe server /root/savoy-giraffe.env: RUNPOD_API_KEY, ELEVENLABS_API_KEY, RUNPOD_SSH_KEY_B64 (base64 din ~/.ssh/runpod_savoy - containerul il scrie in /tmp/runpod_savoy ca sa dea SSH la pod-uri RunPod).
- **LINK OPERATOR LIVE: http://116.203.89.201:8090** (port 8080 era ocupat). UI: upload fundal + replica + Genereaza -> reel FINAL-quality.
- Update app: rebuild ghcr.io/.../savoy-giraffe-app (docker buildx -f Dockerfile.app --push) -> pe server: docker pull + docker rm -f savoy-giraffe + docker run (aceeasi comanda). 
- TODO optional: domeniu + HTTPS (Caddy/nginx reverse proxy pe server) in loc de IP:8090; auth simpla pe UI daca e public.

## AI MESSAGE + DOMENIU (2026-07-02)
- MESAJ AI din idee: LIVE si functional. Modul claude.mjs (endpoint configurabil CLAUDE_BASE_URL, default anthropic; CLAUDE_MODEL claude-haiku-4-5), system prompt = savoy_kb.txt (facts hotel + reguli reel). Ruta /api/message {idea}->{message}. Cheie Anthropic REALA sk-ant-... setata in /root/savoy-giraffe.env pe server (cheia 5|... era proxy, abandonata). Test live OK ("oferta weekend -> replica pe brand cu tel corect").
- UI: card 2 = "Ideea ta" + buton "Genereaza mesajul cu AI" -> replica editabila -> Genereaza video. Card 1 accepta poza SAU video (video da inca "vine curand" - conducta chroma-key de construit).
- App image ghcr.io/savoyagent11-cmd/savoy-giraffe-app:latest (Dockerfile.app include claude.mjs+savoy_kb.txt). Redeploy: docker pull + rm + run (aceeasi cmd, port 8090).
- DOMENIU Cloudflare: cont grappes.ai@gmail.com (acc b21ceaf662c7dab743bee9dce9580c79), wrangler autentificat (OAuth, poate deploya Workers DAR OAuth token NU merge ca bearer pe API REST -> auth error). Worker proxy "savoy-girafa" (worker.js -> proxy la http://116.203.89.201:8090) UPLOADAT dar workers.dev subdomain NEinregistrat. CF dashboard atarna in browserul automatizat. RAMAS: user inregistreaza subdomeniu workers.dev (1 camp la /workers/onboarding) SAU da token CF API (Workers Scripts:Edit + Workers Subdomain/Zone DNS) -> apoi `cd /tmp/savoy-worker && npx wrangler deploy` -> savoy-girafa.<sub>.workers.dev.

## DOMENIU FINAL LIVE (2026-07-02)
- **LINK PUBLIC: https://savoy-girafa.savoymamaia.workers.dev** (permanent, gratis, HTTPS)
- Cont Cloudflare SAVOY dedicat: Savoyagent11@gmail.com, account id 0abf0d630277823b278a6894d8badc9c. Token API (Edit Workers, All account) creat — valoarea NU se tine aici, sta in ~/savoy-content-studio/.env ca CLOUDFLARE_API_TOKEN. Subdomeniu workers.dev inregistrat: savoymamaia.
- Worker "savoy-girafa" (/tmp/savoy-worker, worker.js) = proxy -> http://116.203.89.201.nip.io:8880 (GOTCHA: Workers fetch NU merge pe IP brut -> error 1003; foloseste hostname nip.io. Port trebuie sa fie din lista permisa Workers: 8880 nu 8090). Redeploy: cd /tmp/savoy-worker; CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=0abf0d63... npx wrangler deploy.
- App pe server ruleaza pe DOUA porturi: 8090 (direct) + 8880 (pt Worker). Container savoy-giraffe -p 8090:8080 -p 8880:8080.
- UI actualizat: scos card "Pozitia girafei" (placement default). Card 1 poza/video, Card 2 idee->mesaj AI.

## FIX DEFINITIV (region-free) — 95%, blocat pe dispatch (2026-07-02)
- Imagine COAPTA construita FARA HF: am tras modelele fp8 de pe volum (pod viu) pe Mac (~37GB, models-local/), build local Dockerfile.baked -> ghcr.io/savoyagent11-cmd/savoy-giraffe-worker:latest (~50GB, push ~50min). GOTCHA: e manifest INDEX (provenance attestation) - suspect pt dispatch; de rebuild cu --provenance=false --sbom=false.
- Registry auth RunPod: id cmr3dxduk00o7e2gkbdbjgdvd (ghcr, savoyagent11-cmd + gh token). Template qecgtdidb3. Endpoint serverless region-free: **0grw9e0op1y2zo** (fara volum, fara datacenter fix, pool GPU 48GB larg).
- REGION-FREE CONFIRMAT: endpoint-ul a gasit A40 in CA-MTL-1 (Canada) desi EU-SE-1 era gol. Deci scapa de penuria de capacitate.
- DAR: acelasi bug ca la endpoint-ul cu volum -> workeri "ready/idle" dar jobul ramane IN_QUEUE, nu se dispatch-uieste (running=0), la infinit. Logs UI goale. Cancel+resubmit nu ajuta. workersMax=0 setat ca sa nu factureze idle-workerii.
- COD APP GATA pt serverless: build_workflow.mjs (port JS) + calea serverless in generate.mjs (activata de env SERVERLESS_ENDPOINT_ID) + Dockerfile.app include build_workflow.mjs. NEDEPLOYAT (astept sa mearga dispatch-ul).
- DE INVESTIGAT dispatch: (1) rebuild imagine --provenance=false (manifest simplu); (2) worker logs reale (RunPod log API / alt tab); (3) test cu workflow trivial; (4) alta versiune worker-comfyui; (5) RunPod support. PANA ATUNCI productia merge pe pod-per-sesiune (live, fix voce aplicat).

## FIX DEFINITIV SERVERLESS — FUNCTIONEAZA (2026-07-02)
- CAUZA "success_no_images": worker-comfyui handler capteaza DOAR "images" (SaveImage), IGNORA complet "gifs" (VHS_VideoCombine mp4). FIX: handler.py patchat (dupa `for node_id, node_output in outputs.items():` -> daca "gifs" si nu "images", node_output["images"]=node_output["gifs"]). mp4 se ia via /view (get_image_data), ~2MB base64. handler.py in repo.
- Layer subtire: Dockerfile.patch (FROM baked + COPY handler.py), build --provenance=false, tag :v2. GOTCHA: RunPod cache-uieste :latest pe masina -> NU re-trage la push pe acelasi tag. FOLOSESTE TAG NOU (:v2) + template nou + PATCH endpoint templateId ca sa forteze pull.
- Endpoint serverless REGION-FREE FUNCTIONAL: **0grw9e0op1y2zo** (template dr0c95wdtu -> imagine :v2, registry auth cmr3dxduk00o7e2gkbdbjgdvd, fara volum, pool GPU 48GB, idleTimeout 300s). Ruleaza pe orice GPU liber (dovedit: A40 CA-MTL-1). Cold start ~10-12min (pull 50GB prima data pe o masina noua), apoi cache-uit rapid.
- APP comutat pe serverless: env SERVERLESS_ENDPOINT_ID=0grw9e0op1y2zo pe /root/savoy-giraffe.env. generate.mjs -> serverlessClip (build_workflow.mjs JS + POST /run + poll + decode mp4 base64) -> muxReel boomerang. Pod-per-sesiune ramane fallback daca env-ul nu e setat.
- Output validat brand-perfect: ~/Desktop/SAVOY_SERVERLESS_ok.mp4.
