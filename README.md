# Kosmische Koerier — browserversie

Dit is een zelfstandige HTML5/JavaScript-versie van de Tkinter-game. Er zijn geen Python-packages, buildstappen of Buildozer nodig. De drie opslagslots worden lokaal in de browser bewaard.

De site heeft een PWA-manifest en service worker. Op HTTPS (of `localhost` voor
testen) kan Chrome de game installeren. Appbestanden worden netwerk-eerst
geladen; de cache is alleen de offline terugval.

Op een telefoon vervangt een sleepbare joystick de toetsenbesturing. De knoppen
**DASH**, **PAUZE** en **OPSLAAN** staan ernaast; opslaan gebruikt dezelfde drie
browseropslagslots als de desktopversie.

De lokale topscores worden alleen op het gebruikte apparaat bewaard. Ze worden
niet online gedeeld en vormen dus geen wereldwijde, landelijke of
vriendengroep-ranglijst.

## Lokaal bekijken

Open `index.html` in een recente browser. Voor een lokale webserver kun je in deze map uitvoeren:

```powershell
py -m http.server 8000
```

Open daarna `http://localhost:8000`.

## Publiceren met GitHub Pages

Stel GitHub Pages in om vanaf de repository-root te publiceren. Het
`index.html`-bestand in de root stuurt bezoekers automatisch door naar de
website in `web/`.

## Installeren als Android-app

Open `https://rubenverriest.github.io/KoKo/web/` in Chrome. Als Chrome de app
installatiegeschikt vindt, verschijnt **Installeer KoKo**; anders kun je
Chrome-menu → **App installeren** gebruiken. Kies niet alleen **Toevoegen aan
startscherm**, want dat kan een gewone snelkoppeling maken.

Na een update open je de website eerst online in Chrome en vernieuw je de
pagina. Als de bestaande app nog oude bestanden start, verwijder die installatie
en installeer KoKo opnieuw. Het wissen van sitegegevens is een laatste optie:
dat verwijdert ook lokale spelopslagen en topscores.

## Gratis publiceren met Cloudflare Pages

1. Maak een Cloudflare-account aan en open **Workers & Pages → Create application → Pages → Upload assets**.
2. Upload de inhoud van deze `web`-map (of maak er een ZIP van). Op Windows kun je vanuit deze map uitvoeren:

   ```powershell
   Compress-Archive -Path .\* -DestinationPath ..\kosmische-koerier-web.zip -Force
   ```

   Upload de ZIP met `index.html` op het hoogste niveau.
3. Kies een projectnaam. Cloudflare geeft je een publieke `*.pages.dev`-URL.
4. Er is geen build command nodig. Na wijzigingen upload je de map opnieuw.

Zie ook de [officiële Cloudflare Pages direct-uploadhandleiding](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## Advertenties

De advertentieruimte onder het spel is nu alleen een placeholder; er worden geen advertenties geladen en er is geen uitgegeven opbrengst. Voor Google AdSense:

1. Vraag AdSense aan zodra de website online staat en voeg een domein toe dat je beheert. Google vereist dat je toegang hebt tot de HTML van de site om het eigenaarschap te verifiëren. Een eigen domein is daarom de aanbevolen stap; `pages.dev` is handig om de game eerst te testen.
2. Wacht op goedkeuring en gebruik daarna uitsluitend de advertentiecode die AdSense voor jouw account genereert. Vervang de placeholder in `index.html` door de officiële code en plaats de verificatiecode waar AdSense die voorschrijft.
3. Als je bezoekers in de EER, het VK of Zwitserland hebt, controleer de actuele toestemmingsvereisten. Google vereist voor gepersonaliseerde advertenties een door Google gecertificeerde CMP die met het IAB TCF integreert.

De pagina `privacy.html` beschrijft de lokale spelopslag en de huidige advertentieplaceholder. Vul je contactgegevens in en werk deze pagina bij zodra je een advertentienetwerk kiest. Voor gepersonaliseerde advertenties voor bezoekers in de EER, het VK of Zwitserland vereist Google een gecertificeerde CMP die met het IAB TCF integreert.

Goedkeuring of inkomsten zijn niet gegarandeerd; die hangen onder andere af van accountgoedkeuring, beleid, bezoekersaantallen en advertentievraag. Lees de [AdSense-voorwaarden voor deelname](https://support.google.com/adsense/answer/9724?hl=nl), de [site-eigendomseisen](https://support.google.com/adsense/answer/91205?hl=nl) en de [toestemmingsvereisten voor de EER, het VK en Zwitserland](https://support.google.com/adsense/answer/13554116?hl=nl).
