# Pitch Hack A Ton 2026: prezentat de Domnul Girafă 🦒

**Concept: nu prezentăm noi produsul. L-am pus pe el să se prezinte singur.**
Deschiderea și închiderea sunt reels generate cu produsul, cu Domnul Girafă pe post de prezentator, cu vocea lui reală. Oamenii intervin la demo-ul live și la arhitectură. Juriul nu ascultă o promisiune, se uită la output.

Grila juriului și unde lovim fiecare punct:

| Criteriu | % | Unde îl câștigăm |
|---|---|---|
| Working demo | 25% | Demo live pe prod, cu date reale, cap-coadă (min. 2) |
| Problem & Impact | 20% | Reel 1 + primele 30s vorbite (min. 0-1) |
| Solution & Innovation | 20% | Demo + arhitectură: identitate prin construcție + agent QC (min. 2-3) |
| Technology & architecture | 15% | 90 de secunde de arhitectură, cât generează produsul (min. 3) |
| Pitch & communication | 10% | Formatul însuși: girafa prezintă, totul e poveste |
| Post-event feasibility | 10% | Închiderea: white-label + autopost + cost per reel (min. 4-5) |

## Structura (5 minute)

**[0:00] REEL 1, generat cu produsul: problema, spusă de cel care o trăiește**
> „Salutare, dragă juriu! Eu sunt Domnul Girafă, mascota înregistrată a hotelului Savoy din Mamaia. Copiii mă caută pe plajă. Dar pe Instagram apar o dată pe lună, pentru că un singur reel cu mine înseamnă agenție, zile de lucru și sute de euro. Echipa de marketing are idei în fiecare zi. Eu am timp în fiecare zi. Ne lipsea doar unealta. Priviți."

*(Acoperă Problem & Impact: problema e concretă, costul e numit, cine câștigă e evident: orice brand cu un personaj înregistrat, nu doar un hotel.)*

**[0:30] DEMO LIVE pe savoy-content-studio.vercel.app (partea de 25%)**
Cont real, date reale, producție, nu mock:
1. Login cu email și parolă, dashboard-ul client în față.
2. **Pasul 01, caracterul:** arăți că Domnul Girafă e doar default-ul. Ai și caractere custom: încarci imaginea oricărei mascote, cu mai multe imagini de referință, iar Claude scrie singur „contractul de identitate" al personajului. *(o frază, mină de aur pentru feasibility)*
3. **Pasul 02-03:** tastezi o idee în fața juriului. Claude scrie scenariul pe 3 scene în ~10 secunde. **Editezi o replică pe loc**, ca să se vadă că omul rămâne șeful.
4. **Poarta de aprobare:** arăți cele 3 cadre ancoră cu girafa în recepția reală, fotografiată de noi în hotel. Apoi lovitura: ceri generarea video ÎNAINTE de aprobare și serverul refuză cu 409. Nu e un buton gri, e o regulă de server. Banii nu pleacă fără OK-ul clientului.
5. Aprobi, pornește generarea. Cât lucrează mașina, treci la arhitectură.

**[2:00] ARHITECTURA, 90 de secunde vorbite de oameni (partea de 15% + jumătate din inovație)**
Trei idei, în ordinea asta:
1. **Identitatea nu e o rugăminte în prompt, e o garanție de construcție.** Fiecare scenă pornește dintr-o imagine aprobată a personajului, compusă în fotografia reală a hotelului. Niciun cadru generat nu e la mai mult de 8 secunde de o ancoră aprobată. Driftul nu are unde să se acumuleze.
2. **Agentul de control al calității.** Brandul e înregistrat, deci nu acceptăm „aproape el". La fiecare clip generat, un agent cu vedere (Claude) compară 3 cadre cu imaginea oficială: două brațe, două picioare, copite, gura se mișcă dacă vorbește, oamenii rămân oameni. Pică testul? Scena se regenerează singură, înainte ca cineva s-o vadă.
3. **Disciplina de cost și stack-ul.** Aprobare impusă de server, fiecare încercare plătită numărată, jurnal de evenimente pe fiecare reel. Aplicație Astro pe Vercel, Neon Postgres, montaj ffmpeg în funcții serverless cu lock atomic de asamblare (un singur montaj, oricâte poll-uri), generare prin Kling + Flux Kontext + ElevenLabs, scenarii și QC prin Claude.

**[3:30] REEL 2, generat cu produsul: girafa peste filmarea reală a hotelului**
> „Ăsta e hotelul meu. Filmat de un om, comentat de mine. Aici nu s-a generat nimic: doar montaj și bun gust."

*(Modul 3 overlay: arată lățimea soluției, trei moduri de producție, nu unul.)*

**[4:00] ÎNCHIDEREA, vorbită + ultimul reel (partea de feasibility)**
Omul, 20 de secunde:
> „Cerința minimă era login, o imagine și o voce. Noi livrăm: scenarii scrise de AI, trei moduri de producție, agent de QC pe brand, caractere white-label pentru orice mascotă, și un modul de social media integrat: pui reel-ul în coadă, AI-ul scrie caption-ul în vocea brandului și îl programează singur pe Instagram, TikTok și Facebook. Un reel de 30 de secunde ne costă circa 3 dolari și jumătate. Luni dimineață, Savoy poate posta primul reel adevărat."

REEL 3, girafa:
> „Eu votez cu echipa asta. Dar recunosc, sunt subiectiv: sunt girafa lor."

**[4:30] Q&A.** Pe ecran: un cadru static cu adresa live + cod QR.

## De ce câștigă pe fiecare criteriu (cheat-sheet pentru Q&A)

- **Working demo (25%):** totul rulează pe prod, cu DB real, fotografii reale din hotel, voce reală. Nimic „ar urma să". Dacă juriul cere, generăm în fața lor.
- **Problem & Impact (20%):** mascotele de brand sunt active moarte pe social media: scumpe de animat, imposibil de menținut consistente. Soluția le transformă în prezentatori zilnici. Piața: orice brand cu personaj (hoteluri, retail, banking pentru copii, FMCG).
- **Solution & Innovation (20%):** trei lucruri pe care wrapper-ele de prompt nu le au: identitate prin construcție (ancoră aprobată la fiecare scenă), agent QC cu vedere care respinge automat clipurile off-brand, și poartă de cost impusă de server.
- **Technology & architecture (15%):** serverless cap-coadă fără workers (poll pattern), lock atomic de asamblare, ffmpeg în funcții, jurnal de evenimente, identitate white-label scrisă de Claude din imaginile de referință.
- **Pitch & communication (10%):** formatul e demonstrația. Produsul își ține singur pitch-ul.
- **Post-event feasibility (10%):** deja white-label (orice caracter, multi-referință), dashboard pentru marketeri non-tehnici, autopost integrat, cost marginal ~$3.25/reel de 30s, infrastructura ține (Vercel + Neon). Continuarea cu sponsorul e literalmente un click: contul lor există.

## Muniție pentru întrebări previzibile

- **„Cât costă un reel?"** ~$3.25 pentru 30s (6 clipuri Kling + relighting Flux Kontext + voce). O agenție: sute de euro și zile.
- **„Ce se întâmplă dacă generarea scoate altă girafă?"** Agentul QC o prinde înainte de afișare și regenerează scena automat, o dată; dacă pică din nou, omul decide. Fails open, nu blochează producția.
- **„De ce nu lip-sync?"** Am testat modelele de lip-sync disponibile: refuză mascotele de desen (cer față umană). Soluția noastră: regie de vorbire în prompt + încadrare ¾ care vinde iluzia. Pragmatic, nu dogmatic.
- **„Drepturile pe personaj?"** Mascota e marcă înregistrată a sponsorului; imaginea master și pozele oficiale vin de la ei. Exact de asta există lock-ul de identitate și QC-ul.
- **„Se scalează?"** Coada de social media e deja pe cron-uri; generarea e async pe provideri externi; serverless = zero servere de administrat.

## Checklist în ziua prezentării

1. Generează REEL 1, 2, 3 cu produsul (trei rulări normale). Replicile de mai sus, citite cu voce tare înainte: dacă sună bine spuse de tine, sună bine și spuse de girafă.
2. Toate trei descărcate pe laptop ȘI pe telefon (dacă pică internetul, pitch-ul trăiește).
3. Cont demo curat: doar cele 3 reels în istoric + un caracter custom pregătit (altă mascotă decât girafa, pentru momentul white-label).
4. Un reel pre-generat „de rezervă" în starea gate-ready, în caz că demo-ul live întârzie: comuți pe el și aprobi acolo.
5. Tab-uri pregătite: /dashboard (demo), /social (autopost), cadrul final cu QR.
6. Repetiție cu cronometru: demo-ul live nu are voie să treacă de 90 de secunde de tastat + povestit.
