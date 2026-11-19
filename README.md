# KoKo — Kosmische Koerier

![HTML5 Canvas](https://img.shields.io/badge/HTML5-Canvas-E34F26?logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)
![Progressive Web App](https://img.shields.io/badge/Progressive_Web_App-PWA-5A0FC8)

> Verzamel sterrenkristallen, ontwijk drones en bereik het portaal in dit compacte ruimte-avontuur voor desktop en mobiel.

**[Speel KoKo](https://rubenverriest.github.io/KoKo/web/)**

De game is ook te installeren als webapp via Chrome. De browsergame is gebouwd met HTML, CSS en JavaScript; er zijn geen JavaScript-packages of buildstappen nodig.

## Inhoud

- [Over de game](#over-de-game)
- [Functies](#functies)
- [Besturing](#besturing)
- [Lokaal starten](#lokaal-starten)
- [Installeren op Android](#installeren-op-android)
- [Publiceren](#publiceren)
- [Projectstructuur](#projectstructuur)
- [Privacy](#privacy)

## Over de game

Verzamel genoeg kristallen om het portaal te activeren en ontwijk ondertussen de drones. Ieder level wordt uitdagender. Gebruik je dash en pak een schildkristal om langer te overleven.

### Functies

- Speelbaar op desktop en telefoon; de geïnstalleerde webapp opent in liggende stand, met een knop om fullscreen aan of uit te zetten. In portret toont de app alleen een melding om het toestel te draaien.
- Joystick, dash-, pauze- en opslagbediening voor touchscreens.
- Drie tijdelijke power-ups: trek kristallen aan, vertraag drones of beweeg sneller.
- Drie lokale opslagplaatsen om een spel later verder te spelen.
- Lokale top 10 met **100 punten per kristal**, inclusief kristallen uit eerder behaalde levels.
- Bij gelijke scores staat het hoogste behaalde level bovenaan.
- Installeerbare PWA met offline terugval via een service worker.

De ranglijst wordt alleen op het huidige apparaat opgeslagen. Scores worden niet online gedeeld.

## Besturing

| Actie | Desktop | Telefoon |
| --- | --- | --- |
| Bewegen | `WASD` of pijltjestoetsen | Sleep de joystick |
| Dash | `Spatie` | **DASH** |
| Pauzeren / doorgaan | `P` of `Esc` | **PAUZE** |
| Opslaan | `S` vanuit pauze | **OPSLAAN** |
| Fullscreen aan/uit | — | Tik op het fullscreen-icoon |
| Level afronden | `Enter` | Knop voor het volgende level |
| Opnieuw beginnen na game over | `Enter` | Via **HOOFDMENU → NIEUW SPEL** |
| Naar het hoofdmenu na game over | `Esc` of `M` | Knop **HOOFDMENU** |
| Lokale topscores openen | `L` vanuit het menu | Tik op **LOKALE TOPSCORES** |

Druk in het hoofdmenu op `1`, `2` of `3` om een opslagplaats te laden.

## Lokaal starten

Vereist een recente browser. Voor de PWA- en service-workerfuncties moet de game via HTTPS of `localhost` worden geopend.

1. Open een terminal in de repositorymap.
2. Start een eenvoudige lokale webserver:

   ```powershell
   py -m http.server 8000
   ```

3. Open [http://localhost:8000](http://localhost:8000). De startpagina stuurt door naar `web/`.

De repository bevat ook een zelfstandige Tkinter-versie:

```powershell
py kosmische_koerier.py
```

## Installeren op Android

1. Open **[Kosmische Koerier in Chrome](https://rubenverriest.github.io/KoKo/web/)**.
2. Open het Chrome-menu en kies **App installeren**.
3. Start **Koerier** daarna via het app-icoon.

De oorspronkelijke appnaam is **Kosmische Koerier** (korte naam: **Koerier**). De app start normaal; gebruik het fullscreen-icoon tijdens het spelen voor een schermvullende weergave. Verwijder een bestaande installatie en installeer de app opnieuw als die na een update niet meer opent.

> Sitegegevens wissen is een laatste redmiddel: daarmee verwijder je ook de lokale opslagplaatsen en topscores.

## Publiceren

### GitHub Pages

Stel GitHub Pages in via **Settings → Pages**:

1. Kies **Deploy from a branch**.
2. Selecteer de branch `main` en de map `/(root)`.
3. Sla de instelling op en wacht tot GitHub Pages klaar is met publiceren.

Het `index.html`-bestand in de repositoryroot stuurt bezoekers door naar `web/`. De gepubliceerde game staat op:

**https://rubenverriest.github.io/KoKo/web/**

## Projectstructuur

```text
KoKo/
├── index.html                 # Doorstuurpagina naar de webgame
├── kosmische_koerier.py       # Zelfstandige Tkinter-versie
├── README.md
└── web/
    ├── index.html             # Gamepagina
    ├── game.js                # Gameplay, bediening en lokale topscores
    ├── styles.css             # Desktop-, mobiele en responsieve game-layout
    ├── manifest.json          # Naam, startpagina en PWA-weergave
    ├── service-worker.js      # Offline app-shell en netwerkterugval
    ├── privacy.html
    └── icons/
```

## Privacy

Spelopslagen en topscores worden lokaal in de browser bewaard. Er is geen online ranglijst, account of synchronisatie tussen apparaten. De advertentieruimte op de pagina is momenteel alleen een placeholder; er worden geen advertentiescripts geladen.

Lees de [privacyverklaring](./web/privacy.html) voor meer informatie.
