import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.APIFOOTBALL_KEY || "";
const API_BASE_URL = process.env.APIFOOTBALL_BASE_URL || "https://v3.football.api-sports.io";
const LEAGUE_ID = process.env.WM_LEAGUE_ID || "1";
const SEASON = process.env.WM_SEASON || "2026";
const CACHE_SECONDS = Number(process.env.CACHE_SECONDS || 60);
const TIMEZONE = process.env.WM_TIMEZONE || "Europe/Berlin";
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 15000);

let cache = {
  ts: 0,
  data: null,
  error: null,
  source: ""
};

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "wm2026-railway-tv",
    hasApiKey: Boolean(API_KEY),
    apiBaseUrl: API_BASE_URL,
    league: LEAGUE_ID,
    season: SEASON,
    timezone: TIMEZONE,
    cacheAgeSeconds: cache.ts ? Math.floor((Date.now() - cache.ts) / 1000) : null,
    lastError: cache.error || null,
    lastSource: cache.source || null
  });
});

app.get("/api/wm2026", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_SECONDS * 1000) {
    return res.json({
      source: cache.source || "cache",
      updatedAt: new Date(cache.ts).toISOString(),
      serverNow: new Date().toISOString(),
      cached: true,
      matches: cache.data,
      warning: cache.error || undefined
    });
  }

  if (!API_KEY) {
    const fallback = demoMatches().map(enrichMatch);
    cache = { ts: now, data: fallback, error: "APIFOOTBALL_KEY fehlt in Railway Variables.", source: "demo-no-api-key" };
    return res.json({
      source: "demo-no-api-key",
      updatedAt: new Date().toISOString(),
      serverNow: new Date().toISOString(),
      warning: "APIFOOTBALL_KEY fehlt in Railway Variables.",
      matches: fallback
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = `${API_BASE_URL}/fixtures?league=${encodeURIComponent(LEAGUE_ID)}&season=${encodeURIComponent(SEASON)}&timezone=${encodeURIComponent(TIMEZONE)}`;

    const apiRes = await fetch(url, {
      headers: {
        "x-apisports-key": API_KEY,
        "Accept": "application/json",
        "User-Agent": "wm2026-railway-tv/1.0"
      },
      signal: controller.signal
    });

    const rawText = await apiRes.text();
    let apiJson = {};
    try {
      apiJson = rawText ? JSON.parse(rawText) : {};
    } catch {
      apiJson = { raw: rawText };
    }

    if (!apiRes.ok) {
      const apiMessage = apiJson?.errors ? JSON.stringify(apiJson.errors) : (apiJson?.message || rawText || `HTTP ${apiRes.status}`);
      throw new Error(`API-Fehler HTTP ${apiRes.status}: ${apiMessage}`);
    }

    const raw = Array.isArray(apiJson.response) ? apiJson.response : [];
    const matches = raw.map(mapApiFootballFixture).filter(Boolean).sort((a, b) => new Date(a.date) - new Date(b.date));

    if (!matches.length) {
      throw new Error("API liefert aktuell keine WM-Spiele. Prüfe Tarif, Saison oder ob 2026-Daten schon verfügbar sind.");
    }

    cache = {
      ts: now,
      data: matches,
      error: null,
      source: "api-football"
    };

    res.json({
      source: "api-football",
      updatedAt: new Date(now).toISOString(),
      serverNow: new Date().toISOString(),
      count: matches.length,
      cached: false,
      matches
    });
  } catch (err) {
    console.error("WM API Fehler:", err);
    const message = err.name === "AbortError"
      ? `API-Timeout nach ${FETCH_TIMEOUT_MS}ms`
      : (err.message || "Unbekannter API-Fehler");

    cache.error = message;

    if (cache.data) {
      return res.json({
        source: "cache-after-error",
        updatedAt: new Date(cache.ts).toISOString(),
        serverNow: new Date().toISOString(),
        warning: message,
        matches: cache.data,
        cached: true
      });
    }

    const fallback = demoMatches().map(enrichMatch);
    cache = { ts: now, data: fallback, error: message, source: "demo-after-error" };
    res.json({
      source: "demo-after-error",
      updatedAt: new Date().toISOString(),
      serverNow: new Date().toISOString(),
      warning: message,
      matches: fallback,
      cached: false
    });
  } finally {
    clearTimeout(timeout);
  }
});

function mapApiFootballFixture(item) {
  const fixture = item.fixture || {};
  const teams = item.teams || {};
  const goals = item.goals || {};
  const league = item.league || {};

  return enrichMatch({
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
  });
}

function enrichMatch(match) {
  const homeFlagCode = countryCodeFromName(match.home);
  const awayFlagCode = countryCodeFromName(match.away);
  return {
    ...match,
    homeFlagCode,
    awayFlagCode,
    homeFlagUrl: homeFlagCode ? `https://flagcdn.com/w80/${homeFlagCode}.png` : "",
    awayFlagUrl: awayFlagCode ? `https://flagcdn.com/w80/${awayFlagCode}.png` : ""
  };
}

function normalizeStatus(status) {
  const s = String(status || "").toUpperCase();
  if (["1H", "2H", "HT", "ET", "P", "BT", "LIVE"].includes(s)) return "live";
  if (["FT", "AET", "PEN"].includes(s)) return "finished";
  if (["PST", "CANC", "ABD", "AWD", "WO"].includes(s)) return "special";
  return "scheduled";
}

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const COUNTRY_CODES = {
  "argentinien": "ar",
  "argentina": "ar",
  "algerien": "dz",
  "algeria": "dz",
  "australien": "au",
  "australia": "au",
  "belgien": "be",
  "belgium": "be",
  "bosnien herzegowina": "ba",
  "bosnia herzegovina": "ba",
  "brasilien": "br",
  "brazil": "br",
  "kanada": "ca",
  "canada": "ca",
  "chile": "cl",
  "kolumbien": "co",
  "colombia": "co",
  "kroatien": "hr",
  "croatia": "hr",
  "tschechien": "cz",
  "czech republic": "cz",
  "czechia": "cz",
  "danemark": "dk",
  "denmark": "dk",
  "ecuador": "ec",
  "england": "gb",
  "frankreich": "fr",
  "france": "fr",
  "deutschland": "de",
  "germany": "de",
  "ger": "de",
  "ghana": "gh",
  "griechenland": "gr",
  "greece": "gr",
  "haiti": "ht",
  "honduras": "hn",
  "iran": "ir",
  "irak": "iq",
  "iraq": "iq",
  "island": "is",
  "israel": "il",
  "italien": "it",
  "italy": "it",
  "japan": "jp",
  "kamerun": "cm",
  "cameroon": "cm",
  "katar": "qa",
  "qatar": "qa",
  "mexiko": "mx",
  "mexico": "mx",
  "marokko": "ma",
  "morocco": "ma",
  "niederlande": "nl",
  "netherlands": "nl",
  "neuseeland": "nz",
  "new zealand": "nz",
  "nigeria": "ng",
  "nordirland": "gb",
  "northern ireland": "gb",
  "norwegen": "no",
  "norway": "no",
  "panama": "pa",
  "paraguay": "py",
  "peru": "pe",
  "polen": "pl",
  "poland": "pl",
  "portugal": "pt",
  "irland": "ie",
  "ireland": "ie",
  "romania": "ro",
  "rumania": "ro",
  "saudi arabien": "sa",
  "saudi arabia": "sa",
  "schottland": "gb",
  "scotland": "gb",
  "serbien": "rs",
  "serbia": "rs",
  "senegal": "sn",
  "slowakei": "sk",
  "slovakia": "sk",
  "slowenien": "si",
  "slovenia": "si",
  "sudafrika": "za",
  "south africa": "za",
  "sudkorea": "kr",
  "south korea": "kr",
  "korea republic": "kr",
  "spanien": "es",
  "spain": "es",
  "schweiz": "ch",
  "switzerland": "ch",
  "tunesien": "tn",
  "tunisia": "tn",
  "turkei": "tr",
  "turkey": "tr",
  "ukraine": "ua",
  "uruguay": "uy",
  "usa": "us",
  "vereinigte staaten": "us",
  "united states": "us",
  "wales": "gb",
  "welsh": "gb"
};

function countryCodeFromName(name) {
  const normalized = normalizeName(name);
  return COUNTRY_CODES[normalized] || "";
}

function demoMatches() {
  return [
    {
      fixtureId: 1,
      date: "2026-06-11T21:00:00+02:00",
      status: "scheduled",
      statusShort: "NS",
      statusText: "Geplant",
      elapsed: null,
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
      date: "2026-06-11T21:00:00+02:00",
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
      date: "2026-06-12T18:00:00+02:00",
      status: "scheduled",
      statusShort: "NS",
      statusText: "Geplant",
      group: "Gruppe C",
      home: "Frankreich",
      away: "Kanada",
      homeScore: null,
      awayScore: null,
      stadium: "Mercedes-Benz Stadium",
      city: "Atlanta"
    },
    {
      fixtureId: 4,
      date: "2026-06-12T21:00:00+02:00",
      status: "scheduled",
      statusShort: "NS",
      statusText: "Geplant",
      group: "Gruppe C",
      home: "Marokko",
      away: "Haiti",
      homeScore: null,
      awayScore: null,
      stadium: "Bank of America Stadium",
      city: "Charlotte"
    },
    {
      fixtureId: 5,
      date: "2026-06-13T00:00:00+02:00",
      status: "scheduled",
      statusShort: "NS",
      statusText: "Geplant",
      group: "Gruppe D",
      home: "Südkorea",
      away: "Tschechien",
      homeScore: null,
      awayScore: null,
      stadium: "AT&T Stadium",
      city: "Dallas"
    },
    {
      fixtureId: 6,
      date: "2026-06-13T00:00:00+02:00",
      status: "scheduled",
      statusShort: "NS",
      statusText: "Geplant",
      group: "Gruppe E",
      home: "Schweiz",
      away: "Bosnien-Herzegowina",
      homeScore: null,
      awayScore: null,
      stadium: "MetLife Stadium",
      city: "New York"
    },
    {
      fixtureId: 7,
      date: "2026-06-13T03:00:00+02:00",
      status: "scheduled",
      statusShort: "NS",
      statusText: "Geplant",
      group: "Gruppe F",
      home: "Argentinien",
      away: "Algerien",
      homeScore: null,
      awayScore: null,
      stadium: "SoFi Stadium",
      city: "Los Angeles"
    },
    {
      fixtureId: 8,
      date: "2026-06-19T21:00:00+02:00",
      status: "scheduled",
      statusShort: "NS",
      statusText: "Geplant",
      group: "Gruppe G",
      home: "Deutschland",
      away: "Japan",
      homeScore: null,
      awayScore: null,
      stadium: "Signal Iduna Park",
      city: "Dortmund"
    }
  ];
}

app.listen(PORT, () => {
  console.log(`WM 2026 TV läuft auf Port ${PORT}`);
});
