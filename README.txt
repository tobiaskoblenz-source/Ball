WM 2026 TV Spielplan - Hybrid mit 2 kostenlosen APIs + Handeingabe

Diese Version:
1. Spielplan 104 Spiele bleibt fest eingebaut.
2. Probiert automatisch API-Football.
3. Wenn API-Football nichts liefert, probiert sie football-data.org.
4. Wenn beide nichts liefern, kannst du Ergebnisse unter /admin.html eintragen.

Railway Variables:
WM_LIVE_SOURCE=auto
WM_TIMEZONE=Europe/Berlin
CACHE_SECONDS=300
WM_SEASON=2026
APIFOOTBALL_KEY=dein_api_football_key
WM_LEAGUE_ID=1
FOOTBALL_DATA_TOKEN=dein_football_data_token
FOOTBALL_DATA_COMPETITION=WC
ADMIN_PIN=dein_pin
MANUAL_RESULTS_PATH=/data/manual-results.json

Test:
/health
/api/wm2026
/admin.html


Fix Ergebnisanzeige vom Vortag:
- Beendete Spiele und manuell eingetragene Ergebnisse verschwinden nicht mehr sofort.
- Die TV-Liste zeigt jetzt auch Ergebnisse von gestern und heute.
- Zukünftige Spiele laufen danach weiter.


Neue Seite:
- /turnier.html
- zeigt alle Gruppen A bis L
- zeigt K.-o.-Runde vom Sechzehntelfinale bis Finale
- übernimmt Live-/Handeingabe-Ergebnisse aus /api/wm2026


Turnierbaum-Update:
- /turnier.html jetzt im Sky-ähnlichen K.O.-Baum-Look
- Runde der letzten 32 links/rechts, Achtelfinale, Viertelfinale, Halbfinale, Finale und Spiel um Platz 3
- Ergebnisse aus API oder Handeingabe werden übernommen
