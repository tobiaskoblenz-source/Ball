import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const TIMEZONE = process.env.WM_TIMEZONE || "Europe/Berlin";
const API_KEY = process.env.APIFOOTBALL_KEY || "";
const API_BASE_URL = process.env.APIFOOTBALL_BASE_URL || "https://v3.football.api-sports.io";
const LEAGUE_ID = process.env.WM_LEAGUE_ID || "1";
const SEASON = process.env.WM_SEASON || "2026";
const CACHE_SECONDS = Number(process.env.CACHE_SECONDS || 300);
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 15000);
const WM_LIVE_SOURCE = (process.env.WM_LIVE_SOURCE || "api-football").toLowerCase();
const ADMIN_PIN = process.env.ADMIN_PIN || "";
const MANUAL_RESULTS_PATH = process.env.MANUAL_RESULTS_PATH || path.join(__dirname, "data", "manual-results.json");

app.use(express.json({ limit: "256kb" }));

const COUNTRY_CODES = {
  "algerien": "dz",
  "argentinien": "ar",
  "australien": "au",
  "belgien": "be",
  "bosnien herzegowina": "ba",
  "brasilien": "br",
  "curacao": "cw",
  "kap verde": "cv",
  "kanada": "ca",
  "kolumbien": "co",
  "kroatien": "hr",
  "tschechien": "cz",
  "dr kongo": "cd",
  "ecuador": "ec",
  "agypten": "eg",
  "england": "gb",
  "elfenbeinkuste": "ci",
  "frankreich": "fr",
  "deutschland": "de",
  "ghana": "gh",
  "haiti": "ht",
  "iran": "ir",
  "irak": "iq",
  "japan": "jp",
  "jordanien": "jo",
  "katar": "qa",
  "mexiko": "mx",
  "marokko": "ma",
  "niederlande": "nl",
  "neuseeland": "nz",
  "norwegen": "no",
  "osterreich": "at",
  "panama": "pa",
  "paraguay": "py",
  "portugal": "pt",
  "saudi arabien": "sa",
  "schottland": "gb",
  "senegal": "sn",
  "spanien": "es",
  "sudafrika": "za",
  "sudkorea": "kr",
  "schweden": "se",
  "schweiz": "ch",
  "tunesien": "tn",
  "turkei": "tr",
  "uruguay": "uy",
  "usa": "us",
  "usbekistan": "uz"
};

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function countryCodeFromName(name) {
  return COUNTRY_CODES[normalizeName(name)] || "";
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

const schedulePath = path.join(__dirname, "data", "wm2026-schedule.json");
const STATIC_SCHEDULE = JSON.parse(fs.readFileSync(schedulePath, "utf8")).map(enrichMatch);
ensureManualResultsFile();

let liveCache = {
  ts: 0,
  matches: [],
  error: null,
  source: "none"
};

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "wm2026-railway-tv",
    mode: "hybrid-static-schedule-api-results",
    staticMatches: STATIC_SCHEDULE.length,
    liveSource: WM_LIVE_SOURCE,
    hasApiKey: Boolean(API_KEY),
    apiBaseUrl: API_BASE_URL,
    league: LEAGUE_ID,
    season: SEASON,
    timezone: TIMEZONE,
    cacheAgeSeconds: liveCache.ts ? Math.floor((Date.now() - liveCache.ts) / 1000) : null,
    lastLiveSource: liveCache.source,
    lastError: liveCache.error
  });
});

app.get("/api/admin/matches", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const manual = readManualResults();
  const matches = STATIC_SCHEDULE.map(match => {
    const entry = manual[String(match.matchNo || match.fixtureId)] || {};
    return {
      matchNo: match.matchNo || match.fixtureId,
      date: match.date,
      timestamp: match.timestamp,
      group: match.group,
      home: match.home,
      away: match.away,
      stadium: match.stadium,
      city: match.city,
      homeFlagUrl: match.homeFlagUrl,
      awayFlagUrl: match.awayFlagUrl,
      manual: entry
    };
  });
  res.json({ ok: true, adminPinRequired: Boolean(ADMIN_PIN), matches });
});

app.get("/api/manual-results", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    adminPinRequired: Boolean(ADMIN_PIN),
    results: readManualResults()
  });
});

app.post("/api/manual-results", (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (ADMIN_PIN && req.body?.pin !== ADMIN_PIN) {
    return res.status(401).json({ ok: false, error: "Falscher ADMIN_PIN." });
  }

  const matchNo = String(req.body?.matchNo || "").trim();
  if (!matchNo) {
    return res.status(400).json({ ok: false, error: "matchNo fehlt." });
  }

  const exists = STATIC_SCHEDULE.some(m => String(m.matchNo || m.fixtureId) === matchNo);
  if (!exists) {
    return res.status(404).json({ ok: false, error: "Spiel nicht gefunden." });
  }

  const action = String(req.body?.action || "save");
  const results = readManualResults();

  if (action === "delete") {
    delete results[matchNo];
    writeManualResults(results);
    return res.json({ ok: true, deleted: true, results });
  }

  const status = normalizeManualStatus(req.body?.status || "scheduled");
  const homeScoreRaw = req.body?.homeScore;
  const awayScoreRaw = req.body?.awayScore;

  const homeScore = homeScoreRaw === "" || homeScoreRaw === null || homeScoreRaw === undefined
    ? null
    : Number(homeScoreRaw);
  const awayScore = awayScoreRaw === "" || awayScoreRaw === null || awayScoreRaw === undefined
    ? null
    : Number(awayScoreRaw);

  if ((homeScore !== null && !Number.isFinite(homeScore)) || (awayScore !== null && !Number.isFinite(awayScore))) {
    return res.status(400).json({ ok: false, error: "Ergebnis muss eine Zahl sein." });
  }

  results[matchNo] = {
    status,
    statusText: status === "live" ? "LIVE" : status === "finished" ? "Beendet" : status === "special" ? "Info" : "Geplant",
    elapsed: req.body?.elapsed === "" || req.body?.elapsed === null || req.body?.elapsed === undefined
      ? null
      : Number(req.body.elapsed),
    homeScore,
    awayScore,
    note: String(req.body?.note || "").slice(0, 120),
    updatedAt: new Date().toISOString()
  };

  writeManualResults(results);

  res.json({ ok: true, saved: results[matchNo], results });
});

app.get("/api/wm2026", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const liveResult = await getLiveMatchesSafe();
  const mergedBeforeManual = mergeStaticScheduleWithLive(STATIC_SCHEDULE, liveResult.matches);
  const manualResults = readManualResults();
  const merged = applyManualResults(mergedBeforeManual, manualResults);

  res.json({
    source: liveResult.source,
    mode: "hybrid",
    updatedAt: new Date().toISOString(),
    serverNow: new Date().toISOString(),
    count: merged.length,
    staticMatches: STATIC_SCHEDULE.length,
    liveMatches: liveResult.matches.length,
    manualResults: Object.keys(manualResults).length,
    warning: liveResult.warning || undefined,
    matches: merged
  });
});

async function getLiveMatchesSafe() {
  if (WM_LIVE_SOURCE === "off" || WM_LIVE_SOURCE === "none") {
    return { source: "static-only", matches: [], warning: null };
  }

  if (!API_KEY) {
    return {
      source: "static-no-api-key",
      matches: [],
      warning: "APIFOOTBALL_KEY fehlt. Spielplan ist korrekt, Ergebnisse werden noch nicht automatisch ergänzt."
    };
  }

  const now = Date.now();
  if (liveCache.matches.length && now - liveCache.ts < CACHE_SECONDS * 1000) {
    return {
      source: "api-football-cache",
      matches: liveCache.matches,
      warning: liveCache.error
    };
  }

  try {
    const matches = await fetchApiFootballFixtures();
    liveCache = { ts: now, matches, error: null, source: "api-football" };
    return { source: "api-football", matches, warning: null };
  } catch (err) {
    const message = err.name === "AbortError"
      ? `API-Timeout nach ${FETCH_TIMEOUT_MS}ms`
      : (err.message || "Unbekannter API-Fehler");

    liveCache.error = message;

    return {
      source: liveCache.matches.length ? "api-football-cache-after-error" : "static-api-error",
      matches: liveCache.matches || [],
      warning: `Live-Ergebnisse konnten nicht geladen werden: ${message}`
    };
  }
}

async function fetchApiFootballFixtures() {
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
    return raw.map(mapApiFootballFixture).filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
}

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
    home: teams.home?.name || "",
    away: teams.away?.name || "",
    homeScore: goals.home,
    awayScore: goals.away,
    stadium: fixture.venue?.name || "",
    city: fixture.venue?.city || ""
  });
}

function mergeStaticScheduleWithLive(staticMatches, liveMatches) {
  const liveByTeams = new Map();

  for (const live of liveMatches) {
    const key = matchKey(live.home, live.away, live.date || live.timestamp);
    if (key) liveByTeams.set(key, live);
  }

  return staticMatches.map(staticMatch => {
    const live = liveByTeams.get(matchKey(staticMatch.home, staticMatch.away, staticMatch.date || staticMatch.timestamp));

    if (!live) {
      return { ...staticMatch, liveMerged: false };
    }

    return enrichMatch({
      ...staticMatch,
      fixtureId: live.fixtureId || staticMatch.fixtureId,
      status: live.status || staticMatch.status,
      statusShort: live.statusShort || staticMatch.statusShort,
      statusText: live.statusText || staticMatch.statusText,
      elapsed: live.elapsed ?? staticMatch.elapsed ?? null,
      homeScore: live.homeScore ?? staticMatch.homeScore ?? null,
      awayScore: live.awayScore ?? staticMatch.awayScore ?? null,
      homeLogo: live.homeLogo || staticMatch.homeLogo || "",
      awayLogo: live.awayLogo || staticMatch.awayLogo || "",
      liveMerged: true,
      liveSource: "api-football"
    });
  });
}

function matchKey(home, away, dateOrTimestamp) {
  const h = normalizeName(home);
  const a = normalizeName(away);
  if (!h || !a) return "";

  let day = "";
  if (typeof dateOrTimestamp === "number") {
    day = new Date(dateOrTimestamp * 1000).toISOString().slice(0, 10);
  } else if (dateOrTimestamp) {
    const d = new Date(dateOrTimestamp);
    if (!Number.isNaN(+d)) day = d.toISOString().slice(0, 10);
  }

  return `${day}|${h}|${a}`;
}

function normalizeStatus(status) {
  const s = String(status || "").toUpperCase();
  if (["1H", "2H", "HT", "ET", "P", "BT", "LIVE"].includes(s)) return "live";
  if (["FT", "AET", "PEN"].includes(s)) return "finished";
  if (["PST", "CANC", "ABD", "AWD", "WO"].includes(s)) return "special";
  return "scheduled";
}

function ensureManualResultsFile() {
  const dir = path.dirname(MANUAL_RESULTS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(MANUAL_RESULTS_PATH)) fs.writeFileSync(MANUAL_RESULTS_PATH, "{}", "utf8");
}

function readManualResults() {
  try {
    ensureManualResultsFile();
    return JSON.parse(fs.readFileSync(MANUAL_RESULTS_PATH, "utf8") || "{}");
  } catch (err) {
    console.error("manual-results lesen fehlgeschlagen:", err);
    return {};
  }
}

function writeManualResults(results) {
  ensureManualResultsFile();
  fs.writeFileSync(MANUAL_RESULTS_PATH, JSON.stringify(results, null, 2), "utf8");
}

function normalizeManualStatus(status) {
  const s = String(status || "scheduled").toLowerCase();
  if (["live", "finished", "special", "scheduled"].includes(s)) return s;
  return "scheduled";
}

function applyManualResults(matches, manualResults) {
  return matches.map(match => {
    const key = String(match.matchNo || match.fixtureId);
    const manual = manualResults[key];
    if (!manual) return match;

    return {
      ...match,
      status: manual.status || match.status,
      statusShort: manual.status === "live" ? "LIVE" : manual.status === "finished" ? "FT" : match.statusShort,
      statusText: manual.statusText || match.statusText,
      elapsed: manual.elapsed ?? match.elapsed ?? null,
      homeScore: manual.homeScore ?? match.homeScore ?? null,
      awayScore: manual.awayScore ?? match.awayScore ?? null,
      manualMerged: true,
      manualNote: manual.note || "",
      manualUpdatedAt: manual.updatedAt || null
    };
  });
}

app.listen(PORT, () => {
  console.log(`WM 2026 TV läuft auf Port ${PORT}`);
  console.log(`Hybrid-Modus aktiv: ${STATIC_SCHEDULE.length} statische Spiele + optionale API-Ergebnisse`);
});
