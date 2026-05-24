WM 2026 Railway TV Plan

Das ist Variante 2:
Railway holt die WM-Daten über eine Sport-API und deine TV-Seite aktualisiert sich automatisch.

Dateien:
- server.js: Railway/Express Proxy
- public/index.html: schöne TV-Ansicht mit Fußball-Design
- package.json: Start-Script für Railway

Railway Anleitung:
1. ZIP entpacken
2. Ordner in ein neues GitHub-Repo hochladen
3. Railway öffnen
4. New Project → Deploy from GitHub Repo
5. Repo auswählen
6. In Railway → Variables diese Variable setzen:

APIFOOTBALL_KEY=dein_api_key

Optional:
WM_LEAGUE_ID=1
WM_SEASON=2026
CACHE_SECONDS=60

7. Deploy starten
8. Railway-Domain öffnen
9. Für TV/Anthias/Raspberry Pi die Railway-URL im Vollbild öffnen

Wichtig:
Der API-Key steht NICHT im Frontend. Er bleibt geheim in Railway Variables.
Die TV-Seite ruft nur /api/wm2026 ab.
Falls kein API-Key gesetzt ist, werden Demo-Daten angezeigt.

API-Hinweis:
Dieses Paket ist für API-FOOTBALL / API-SPORTS vorbereitet.
Endpoint im Server:
https://v3.football.api-sports.io/fixtures?league=1&season=2026

Status:
- scheduled = geplant
- live = live
- finished = beendet
- special = verschoben/abgebrochen/etc.


Neu:
- Countdown-Feld für das nächste Deutschland-Spiel
- Erkennt Deutschland automatisch im Feed (Deutschland/Germany)
- Zeigt Countdown, LIVE-Status oder letztes Ergebnis an


Zusätzliche Anpassungen:
- Übersicht rechts unten entfernt
- Großes Countdown-Feld für Deutschland eingebaut
- Live-Ticker unten eingebaut
- Ticker füllt sich automatisch aus Live-, Ergebnis- und Deutschland-Infos

TV-Look Upgrade:
- deutlich sportlicher TV-/Broadcast-Look
- größere Header und klarere Panels
- neues großes Countdown-Panel im TV-Stil
- Live-Ticker im unteren Bereich

Hintergrundbild:
- Stadion-Hintergrundbild im TV-Look eingebaut
- Datei public/stadium-bg.png hinzugefügt
- Hintergrund entspricht nun dem Vorschaubild deutlich stärker

1:1 Screenshot-Look:
- Layout weiter auf das gelieferte Vorschaubild angepasst
- Stadionbild als echter Hintergrund eingebaut
- Live-Ticker, Footer und Panels näher am Referenzdesign
- große zusätzliche Fußballgrafik unten links entfernt, damit es dem Vorbild entspricht


Neues Update:
- Länderflaggen jetzt als echte Länderflaggen eingebaut (nicht mehr nur Team-Logos)
- Abstände und Layout näher am Referenzbild angepasst
- API robuster gemacht: Timeout, bessere Fehlermeldung, /health erweitert
- Wenn die API nicht antwortet, siehst du weiter Demo-Daten plus Hinweis im Ticker und bei Letztes Update

API prüfen:
1. /health öffnen → hasApiKey muss true sein
2. /api/wm2026 öffnen → wenn warning kommt, stimmt Key/Tarif/Saison noch nicht
3. Auf API-Football muss dein Tarif die WM 2026 Fixtures erlauben
