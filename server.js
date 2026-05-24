import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.APIFOOTBALL_KEY || "";
const LEAGUE_ID = process.env.WM_LEAGUE_ID || "1";
const SEASON = process.env.WM_SEASON || "2026";
const CACHE_SECONDS = Number(process.env.CACHE_SECONDS || 60);

let cache = {
  ts: 0,
  data: null,
  error: null
};

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "wm2026-railway-tv",
    hasApiKey: Boolean(API_KEY),
    league: LEAGUE_ID,
    season: SEASON
  });
});

app.get("/api/wm2026", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_SECONDS * 1000) {
    return res.json({
      source: "cache",
      updatedAt: new Date(cache.ts).toISOString(),
      matches: cache.data
    });
  }

  if (!API_KEY) {
    const fallback = demoMatches();
    return res.json({
      source: "demo-no-api-key",
      updatedAt: new Date().toISOString(),
      warning: "APIFOOTBALL_KEY fehlt in Railway Variables.",
      matches: fallback
    });
  }

  try {
    const url = `https://v3.football.api-sports.io/fixtures?league=${encodeURIComponent(LEAGUE_ID)}&season=${encodeURIComponent(SEASON)}`;

    const apiRes = await fetch(url, {
      headers: {
        "x-apisports-key": API_KEY
      }
    });

    if (!apiRes.ok) {
      throw new Error(`API-Fehler HTTP ${apiRes.status}`);
    }

    const apiJson = await apiRes.json();
    const raw = Array.isArray(apiJson.response) ? apiJson.response : [];

    const matches = raw.map(mapApiFootballFixture).filter(Boolean).sort((a, b) => {
      return new Date(a.date) - new Date(b.date);
    });

    cache = {
      ts: now,
      data: matches,
      error: null
    };

    res.json({
      source: "api-football",
      updatedAt: new Date(now).toISOString(),
      count: matches.length,
      matches
    });
  } catch (err) {
    console.error("WM API Fehler:", err);
    cache.error = err.message;

    if (cache.data) {
      return res.json({
        source: "cache-after-error",
        updatedAt: new Date(cache.ts).toISOString(),
        warning: err.message,
        matches: cache.data
      });
    }

    res.json({
      source: "demo-after-error",
      updatedAt: new Date().toISOString(),
      warning: err.message,
      matches: demoMatches()
    });
  }
});

function mapApiFootballFixture(item) {
  const fixture = item.fixture || {};
  const teams = item.teams || {};
  const goals = item.goals || {};
  const league = item.league || {};

  return {
    fixtureId: fixture.id,
    date: fixture.date,
    timestamp: fixture.timestamp,
    status: normalizeStatus(fixture.status?.short || fixture.status?.long || "NS"),
    statusShort: fixture.status?.short || "NS",
    statusText: fixture.status?.long || "Geplant",
    elapsed: fixture.status?.elapsed ?? null,
    group: league.round || "",
    home: teams.home?.name || "Team A",
    away: teams.away?.name || "Team B",
    homeLogo: teams.home?.logo || "",
    awayLogo: teams.away?.logo || "",
    homeScore: goals.home,
    awayScore: goals.away,
    stadium: fixture.venue?.name || "",
    city: fixture.venue?.city || ""
  };
}

function normalizeStatus(status) {
  const s = String(status || "").toUpperCase();
  if (["1H", "2H", "HT", "ET", "P", "BT", "LIVE"].includes(s)) return "live";
  if (["FT", "AET", "PEN"].includes(s)) return "finished";
  if (["PST", "CANC", "ABD", "AWD", "WO"].includes(s)) return "special";
  return "scheduled";
}

function demoMatches() {
  return [
    {
      fixtureId: 1,
      date: "2026-06-11T21:00:00+02:00",
      status: "scheduled",
      statusShort: "NS",
      statusText: "Geplant",
      group: "Gruppe A",
      home: "Mexiko",
      away: "Südafrika",
      homeScore: null,
      awayScore: null,
      stadium: "Estadio Azteca",
      city: "Mexiko-Stadt"
    },
    {
      fixtureId: 2,
      date: "2026-06-12T18:00:00+02:00",
      status: "scheduled",
      statusShort: "NS",
      statusText: "Geplant",
      group: "Gruppe B",
      home: "Brasilien",
      away: "Schottland",
      homeScore: null,
      awayScore: null,
      stadium: "Hard Rock Stadium",
      city: "Miami"
    },
    {
      fixtureId: 3,
      date: "2026-06-12T21:00:00+02:00",
      status: "live",
      statusShort: "1H",
      statusText: "1. Halbzeit",
      elapsed: 34,
      group: "Gruppe C",
      home: "Marokko",
      away: "Haiti",
      homeScore: 1,
      awayScore: 0,
      stadium: "Mercedes-Benz Stadium",
      city: "Atlanta"
    },
    {
      fixtureId: 4,
      date: "2026-06-13T00:00:00+02:00",
      status: "finished",
      statusShort: "FT",
      statusText: "Beendet",
      group: "Gruppe D",
      home: "Südkorea",
      away: "Tschechien",
      homeScore: 2,
      awayScore: 2,
      stadium: "AT&T Stadium",
      city: "Dallas"
    }
  ];
}

app.listen(PORT, () => {
  console.log(`WM 2026 TV läuft auf Port ${PORT}`);
});
