# Pitch Hack A Ton 2026 · Savoy Content Studio (în doi)

**Format: voi doi prezentați, produsul livrează momentele.** Unul ține povestea (STORY), celălalt mâinile pe tastatură (DEMO). Schimbul de voci ține energia sus: nimeni nu vorbește mai mult de 60 de secunde fără ca celălalt să intre. Reel-urile generate cu produsul apar ca probe, nu ca prezentatori.

Grila juriului și unde lovim fiecare punct:

| Criteriu | % | Unde îl câștigăm |
|---|---|---|
| Working demo | 25% | Demo live pe prod, date reale, cap-coadă (min. 1-2:30) |
| Problem & Impact | 20% | Deschiderea STORY (min. 0-1) |
| Solution & Innovation | 20% | Demo + arhitectură: identitate prin construcție + agent QC |
| Technology & architecture | 15% | 75 de secunde de arhitectură, cât generează produsul |
| Pitch & communication | 10% | Doi prezentatori, ping-pong, zero slide-uri moarte |
| Post-event feasibility | 10% | Închiderea: white-label + autopost + cost per reel |

## Structura (5 minute)

**[0:00] STORY · Problema (60s)**
> „Acesta e Domnul Girafă. *(pe ecran: artwork-ul oficial)* Mascota înregistrată a hotelului Savoy din Mamaia. Copiii îl caută pe plajă, dar pe Instagram apare o dată pe lună. De ce? Pentru că un singur reel cu el înseamnă agenție, zile de lucru și sute de euro. Și mai rău: de fiecare dată iese ALT Domnul Girafă, că AI-urile nu respectă brandul.
> Echipa de marketing are idei în fiecare zi. Noi le-am construit unealta care le transformă în reels: în minute, nu în zile; la 3 dolari, nu la sute de euro; și cu garanția că girafa rămâne mereu girafa lor. Îți arătăm acum, live."

*(Problem & Impact bifat: problema, costul, cine câștigă. Fraza „iese alt Domnul Girafă" pregătește terenul pentru QC, asul de mai târziu.)*

**[1:00] DEMO LIVE pe savoy-content-studio.vercel.app (90s, partea de 25%)**
DEMO tastează, STORY narează scurt peste umărul lui. Cont real, producție, nu mock:
1. Login, dashboard. **Pasul 01:** „Domnul Girafă e doar default-ul. Clientul poate încărca ORICE mascotă, cu mai multe imagini de referință, iar AI-ul îi scrie singur contractul de identitate." *(o frază, sămânța pentru feasibility)*
2. **Pasul 02-03:** DEMO tastează o idee în fața juriului. Claude scrie textul în ~10 secunde. **Editează o replică pe loc**: „omul rămâne șeful textului."
3. **Pasul 04, poarta de aprobare:** imaginea ancoră cu girafa în recepția REALĂ a hotelului, fotografiată de noi. Lovitura: DEMO cere generarea video ÎNAINTE de aprobare și serverul refuză cu 409. STORY: „Nu e un buton gri. E o regulă de server. Banii nu pleacă fără OK-ul clientului."
4. Aprobă, pornește generarea. STORY: „Cât lucrează mașina, vă arătăm ce e sub capotă."

**[2:30] STORY+DEMO · Arhitectura (75s, partea de 15% + jumătate din inovație)**
Trei idei, alternând vocile, una de căciulă:
1. *(STORY)* **Identitatea nu e o rugăminte în prompt, e o garanție de construcție.** Fiecare video pornește dintr-o imagine aprobată a personajului, compusă în fotografia reală a hotelului. Niciun cadru generat nu e departe de o ancoră aprobată, driftul nu are unde să se acumuleze.
2. *(DEMO)* **Agentul de control al calității.** Brandul e marcă înregistrată, deci nu acceptăm „aproape el". La fiecare clip generat, un agent cu vedere compară cadrele cu imaginea oficială: două brațe, două picioare, copite, gura se mișcă dacă vorbește, oamenii rămân oameni. Pică testul? Scena se regenerează singură, înainte s-o vadă cineva.
3. *(STORY)* **Disciplina de cost și stack-ul.** Aprobare impusă de server, fiecare încercare plătită numărată, jurnal de evenimente pe fiecare reel. Astro pe Vercel, Neon Postgres, montaj ffmpeg în funcții serverless cu lock atomic de asamblare, generare Kling + Flux Kontext + ElevenLabs, scenarii și QC prin Claude.

**[3:45] PROBA · reel-uri finite (30s)**
DEMO rulează 2 reel-uri scurte generate cu produsul: unul în modul clasic (girafa în recepție, vorbind cu voce reală) și unul în modul overlay (girafa peste filmarea reală a hotelului). STORY, o singură frază:
> „Tot ce ați văzut e generat cu produsul, în hotelul real, cu vocea oficială a personajului."

**[4:15] STORY · Închiderea (30s, partea de feasibility)**
> „Cerința minimă era login, o imagine și o voce. Noi livrăm: scenarii scrise de AI, trei moduri de producție, agent de QC pe brand, caractere white-label pentru orice mascotă, și social media integrat: pui reel-ul în coadă, AI-ul scrie caption-ul în vocea brandului și îl programează singur pe Instagram, TikTok și Facebook. Un reel de 30 de secunde costă circa 3 dolari și jumătate. Luni dimineață, Savoy poate posta primul reel adevărat. Iar marți, orice alt brand cu o mascotă poate face la fel."

**[4:45] Q&A.** Pe ecran: cadru static cu adresa live + cod QR.

## Împărțirea rolurilor

- **STORY** deschide și închide: problema, impactul, feasibility. Ține cronometrul.
- **DEMO** nu vorbește cât tastează decât ce face („scriu ideea... aprob textul..."), explicațiile vin de la STORY. La arhitectură, DEMO ia partea de QC (cea mai tehnică, cea mai memorabilă).
- Regula de aur: când unul vorbește, celălalt face ceva vizibil (tastează, pregătește reel-ul, arată ecranul). Niciodată doi oameni care stau.

## De ce câștigă pe fiecare criteriu (cheat-sheet pentru Q&A)

- **Working demo (25%):** totul rulează pe prod, cu DB real, fotografii reale din hotel, voce reală. Nimic „ar urma să". Dacă juriul cere, generăm în fața lor.
- **Problem & Impact (20%):** mascotele de brand sunt active moarte pe social media: scumpe de animat, imposibil de menținut consistente. Soluția le transformă în prezentatori zilnici. Piața: orice brand cu personaj (hoteluri, retail, banking pentru copii, FMCG).
- **Solution & Innovation (20%):** trei lucruri pe care wrapper-ele de prompt nu le au: identitate prin construcție (ancoră aprobată), agent QC cu vedere care respinge automat clipurile off-brand, poartă de cost impusă de server.
- **Technology & architecture (15%):** serverless cap-coadă fără workers (poll pattern), lock atomic de asamblare, ffmpeg în funcții, jurnal de evenimente, identitate white-label scrisă de Claude din imaginile de referință.
- **Pitch & communication (10%):** doi prezentatori în ping-pong, demo în loc de slide-uri, fraze scurte care se țin minte.
- **Post-event feasibility (10%):** deja white-label (orice caracter, multi-referință), dashboard pentru marketeri non-tehnici, autopost integrat, cost marginal ~$3.25/reel de 30s, infrastructura ține (Vercel + Neon). Continuarea cu sponsorul e un click: contul lor există.

## Muniție pentru întrebări previzibile

- **„Cât costă un reel?"** ~$3.25 pentru 30s (clipuri Kling + relighting Flux Kontext + voce). O agenție: sute de euro și zile.
- **„Ce se întâmplă dacă generarea scoate altă girafă?"** Agentul QC o prinde înainte de afișare și regenerează scena automat; dacă pică din nou, omul decide. Fails open, nu blochează producția.
- **„De ce nu lip-sync?"** Am testat modelele de lip-sync disponibile: refuză mascotele de desen (cer față umană). Soluția noastră: regie de vorbire în prompt + încadrare ¾ care vinde iluzia. Pragmatic, nu dogmatic.
- **„Drepturile pe personaj?"** Mascota e marcă înregistrată a sponsorului; imaginea master și pozele oficiale vin de la ei. Exact de asta există lock-ul de identitate și QC-ul.
- **„Se scalează?"** Coada de social media e pe cron-uri; generarea e async pe provideri externi; serverless = zero servere de administrat.

## Checklist în ziua prezentării

1. Cele 2 reel-uri probă (clasic + overlay) descărcate pe laptop ȘI pe telefon (dacă pică internetul, pitch-ul trăiește).
2. Cont demo curat: istoricul gol în afară de reel-urile probă + un caracter custom pregătit (altă mascotă decât girafa, pentru momentul white-label).
3. Un reel pre-generat „de rezervă" în starea gate-ready: dacă demo-ul live întârzie, comuți pe el și aprobi acolo.
4. Tab-uri pregătite: /dashboard (demo), /social (autopost), cadrul final cu QR.
5. Repetiție cu cronometru, de două ori, cu schimburile de voce marcate: demo-ul live nu are voie să treacă de 90 de secunde.
6. Artwork-ul oficial al girafei ca prim ecran (pentru deschiderea STORY).
