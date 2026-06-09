WM 2026 TV Spielplan - Hybrid-Version

Diese Version macht genau das:

1. Der komplette WM-2026-Spielplan mit 104 Spielen ist fest eingebaut.
2. Die Seite bleibt stabil, auch wenn keine API funktioniert.
3. Ergebnisse, LIVE und BEENDET werden optional automatisch über API-Football ergänzt.

Railway Variables:

APIFOOTBALL_KEY=dein_api_key
WM_LIVE_SOURCE=api-football
WM_LEAGUE_ID=1
WM_SEASON=2026
WM_TIMEZONE=Europe/Berlin
CACHE_SECONDS=300

Wichtig:
- Ohne APIFOOTBALL_KEY läuft die Seite trotzdem mit korrektem Spielplan.
- Mit APIFOOTBALL_KEY versucht die App automatisch, Ergebnisse und Live-Status nachzutragen.
- Wenn API-Football die WM 2026 im Free Plan nicht liefert, bleibt trotzdem der richtige Spielplan sichtbar.
- Im Ticker erscheint dann ein Hinweis.

Test nach Railway-Deploy:
1. https://deine-domain/health
   staticMatches muss 104 sein
   hasApiKey muss true sein, wenn du den Key gesetzt hast

2. https://deine-domain/api/wm2026
   count muss 104 sein
   liveMatches zeigt, wie viele Daten aus API-Football kamen


Handeingabe:
- Öffne /admin.html
- Spiel auswählen
- Status und Ergebnis eintragen
- Speichern
- Die TV-Seite übernimmt den Wert automatisch beim nächsten Refresh

Optionaler Schutz:
Setze in Railway eine Variable:
ADMIN_PIN=dein_pin

Dann muss der PIN in /admin.html beim Speichern eingetragen werden.

Achtung:
Ohne Railway Volume können manuelle Ergebnisse bei neuem Deploy/Container-Neustart verloren gehen.
Für dauerhaft sichere Speicherung später MANUAL_RESULTS_PATH auf ein Railway Volume legen, z. B.:
/data/manual-results.json
