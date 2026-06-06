WM 2026 TV Spielplan - Crashfix

Diese Version behebt den Railway-Crash:

ReferenceError: Cannot access 'COUNTRY_CODES' before initialization

Ursache:
Der Server hat den Spielplan mit Flaggen angereichert, bevor COUNTRY_CODES geladen war.

Behoben:
COUNTRY_CODES steht jetzt ganz oben vor enrichMatch und vor dem Laden des Spielplans.

Test nach Deploy:
1. /health öffnen
2. Es muss stehen:
   ok: true
   staticMatches: 104

Diese Version braucht keine Sport-API.
