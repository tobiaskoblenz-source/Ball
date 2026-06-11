
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

const TIMEZONE = process.env.WM_TIMEZONE || "Europe/Berlin";
const SEASON = process.env.WM_SEASON || "2026";
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 15000);
const CACHE_SECONDS = Number(process.env.CACHE_SECONDS || 300);
const WM_LIVE_SOURCE = (process.env.WM_LIVE_SOURCE || "auto").toLowerCase();

const APIFOOTBALL_KEY = process.env.APIFOOTBALL_KEY || "";
const APIFOOTBALL_BASE_URL = process.env.APIFOOTBALL_BASE_URL || "https://v3.football.api-sports.io";
const WM_LEAGUE_ID = process.env.WM_LEAGUE_ID || "1";

const FOOTBALL_DATA_TOKEN = process.env.FOOTBALL_DATA_TOKEN || "";
const FOOTBALL_DATA_BASE_URL = process.env.FOOTBALL_DATA_BASE_URL || "https://api.football-data.org/v4";
const FOOTBALL_DATA_COMPETITION = process.env.FOOTBALL_DATA_COMPETITION || "WC";

const ADMIN_PIN = process.env.ADMIN_PIN || "";
const MANUAL_RESULTS_PATH = process.env.MANUAL_RESULTS_PATH || path.join(__dirname, "data", "manual-results.json");

app.use(express.json({ limit: "256kb" }));
app.use(express.static("public"));

const COUNTRY_CODES = {
  "mexiko":"mx","sudafrika":"za","sudkorea":"kr","tschechien":"cz","kanada":"ca","bosnien herzegowina":"ba","usa":"us","paraguay":"py","katar":"qa","schweiz":"ch","brasilien":"br","marokko":"ma","haiti":"ht","schottland":"gb","australien":"au","turkei":"tr","deutschland":"de","curacao":"cw","niederlande":"nl","japan":"jp","elfenbeinkuste":"ci","ecuador":"ec","schweden":"se","tunesien":"tn","spanien":"es","kap verde":"cv","belgien":"be","agypten":"eg","saudi arabien":"sa","uruguay":"uy","iran":"ir","neuseeland":"nz","frankreich":"fr","senegal":"sn","irak":"iq","norwegen":"no","argentinien":"ar","algerien":"dz","osterreich":"at","jordanien":"jo","portugal":"pt","dr kongo":"cd","england":"gb","kroatien":"hr","ghana":"gh","panama":"pa","usbekistan":"uz","kolumbien":"co"
};

const TEAM_TRANSLATIONS = {
  "mexico":"Mexiko","south africa":"Südafrika","korea republic":"Südkorea","south korea":"Südkorea","czechia":"Tschechien","czech republic":"Tschechien","canada":"Kanada","bosnia and herzegovina":"Bosnien-Herzegowina","bosnia herzegovina":"Bosnien-Herzegowina","united states":"USA","usa":"USA","qatar":"Katar","switzerland":"Schweiz","brazil":"Brasilien","morocco":"Marokko","scotland":"Schottland","australia":"Australien","turkiye":"Türkei","turkey":"Türkei","germany":"Deutschland","cote d ivoire":"Elfenbeinküste","ivory coast":"Elfenbeinküste","netherlands":"Niederlande","sweden":"Schweden","tunisia":"Tunesien","spain":"Spanien","cape verde":"Kap Verde","egypt":"Ägypten","new zealand":"Neuseeland","france":"Frankreich","iraq":"Irak","norway":"Norwegen","argentina":"Argentinien","austria":"Österreich","jordan":"Jordanien","dr congo":"DR Kongo","democratic republic of congo":"DR Kongo","uzbekistan":"Usbekistan","colombia":"Kolumbien","saudi arabia":"Saudi-Arabien","belgium":"Belgien","algeria":"Algerien","croatia":"Kroatien"
};

function normalizeName(name) {
  return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}
function translateTeamName(name) { return TEAM_TRANSLATIONS[normalizeName(name)] || name; }
function canonicalTeamName(name) { return normalizeName(translateTeamName(name)); }
function countryCodeFromName(name) { return COUNTRY_CODES[normalizeName(name)] || ""; }
function enrichMatch(match) {
  const homeFlagCode = countryCodeFromName(match.home);
  const awayFlagCode = countryCodeFromName(match.away);
  return { ...match, homeFlagCode, awayFlagCode, homeFlagUrl: homeFlagCode ? `https://flagcdn.com/w80/${homeFlagCode}.png` : "", awayFlagUrl: awayFlagCode ? `https://flagcdn.com/w80/${awayFlagCode}.png` : "" };
}

const STATIC_SCHEDULE = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "wm2026-schedule.json"), "utf8")).map(enrichMatch);
ensureManualResultsFile();

let liveCache = { ts: 0, matches: [], error: null, source: "none" };

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "wm2026-railway-tv",
    mode: "hybrid-2apis-manual",
    staticMatches: STATIC_SCHEDULE.length,
    liveSource: WM_LIVE_SOURCE,
    hasApiKey: Boolean(APIFOOTBALL_KEY),
    hasFootballDataToken: Boolean(FOOTBALL_DATA_TOKEN),
    apiFootballLeague: WM_LEAGUE_ID,
    footballDataCompetition: FOOTBALL_DATA_COMPETITION,
    season: SEASON,
    timezone: TIMEZONE,
    cacheAgeSeconds: liveCache.ts ? Math.floor((Date.now() - liveCache.ts) / 1000) : null,
    lastLiveSource: liveCache.source,
    lastError: liveCache.error
  });
});

app.get("/api/admin/matches", (req, res) => {
  const manual = readManualResults();
  const matches = STATIC_SCHEDULE.map(match => ({ matchNo: match.matchNo || match.fixtureId, date: match.date, timestamp: match.timestamp, group: match.group, home: match.home, away: match.away, stadium: match.stadium, city: match.city, homeFlagUrl: match.homeFlagUrl, awayFlagUrl: match.awayFlagUrl, manual: manual[String(match.matchNo || match.fixtureId)] || {} }));
  res.json({ ok: true, adminPinRequired: Boolean(ADMIN_PIN), matches });
});

app.get("/api/manual-results", (req, res) => res.json({ ok: true, adminPinRequired: Boolean(ADMIN_PIN), results: readManualResults() }));

app.post("/api/manual-results", (req, res) => {
  if (ADMIN_PIN && req.body?.pin !== ADMIN_PIN) return res.status(401).json({ ok: false, error: "Falscher ADMIN_PIN." });
  const matchNo = String(req.body?.matchNo || "").trim();
  if (!matchNo) return res.status(400).json({ ok: false, error: "matchNo fehlt." });
  if (!STATIC_SCHEDULE.some(m => String(m.matchNo || m.fixtureId) === matchNo)) return res.status(404).json({ ok: false, error: "Spiel nicht gefunden." });
  const results = readManualResults();
  if (String(req.body?.action || "save") === "delete") { delete results[matchNo]; writeManualResults(results); return res.json({ ok: true, deleted: true, results }); }
  const homeScore = parseScore(req.body?.homeScore);
  const awayScore = parseScore(req.body?.awayScore);
  if (homeScore.error || awayScore.error) return res.status(400).json({ ok: false, error: "Ergebnis muss eine Zahl sein." });
  results[matchNo] = { status: normalizeManualStatus(req.body?.status || "scheduled"), statusText: statusText(req.body?.status || "scheduled"), elapsed: parseScore(req.body?.elapsed).value, homeScore: homeScore.value, awayScore: awayScore.value, note: String(req.body?.note || "").slice(0,120), updatedAt: new Date().toISOString() };
  writeManualResults(results);
  res.json({ ok: true, saved: results[matchNo], results });
});

app.get("/api/wm2026", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  const liveResult = await getLiveMatchesSafe();
  const mergedLive = mergeStaticScheduleWithLive(STATIC_SCHEDULE, liveResult.matches);
  const manualResults = readManualResults();
  const merged = applyManualResults(mergedLive, manualResults);
  res.json({ source: liveResult.source, mode: "hybrid-2apis-manual", updatedAt: new Date().toISOString(), serverNow: new Date().toISOString(), count: merged.length, staticMatches: STATIC_SCHEDULE.length, liveMatches: liveResult.matches.length, manualResults: Object.keys(manualResults).length, warning: liveResult.warning || undefined, matches: merged });
});

async function getLiveMatchesSafe() {
  if (WM_LIVE_SOURCE === "off" || WM_LIVE_SOURCE === "none") return { source: "static-only", matches: [], warning: null };
  const now = Date.now();
  if (liveCache.matches.length && now - liveCache.ts < CACHE_SECONDS * 1000) return { source: `${liveCache.source}-cache`, matches: liveCache.matches, warning: liveCache.error };
  const errors = [];
  if ((WM_LIVE_SOURCE === "auto" || WM_LIVE_SOURCE === "api-football") && APIFOOTBALL_KEY) {
    try { const m = await fetchApiFootballFixtures(); if (m.length) { liveCache = {ts:now,matches:m,error:null,source:"api-football"}; return {source:"api-football",matches:m,warning:null}; } errors.push("API-Football liefert 0 WM-Daten."); }
    catch(e){ errors.push(`API-Football Fehler: ${e.message || e}`); }
  } else if (WM_LIVE_SOURCE === "auto" || WM_LIVE_SOURCE === "api-football") errors.push("APIFOOTBALL_KEY fehlt.");
  if ((WM_LIVE_SOURCE === "auto" || WM_LIVE_SOURCE === "football-data") && FOOTBALL_DATA_TOKEN) {
    try { const m = await fetchFootballDataFixtures(); if (m.length) { liveCache = {ts:now,matches:m,error:null,source:"football-data"}; return {source:"football-data",matches:m,warning:null}; } errors.push("football-data.org liefert 0 WM-Daten."); }
    catch(e){ errors.push(`football-data.org Fehler: ${e.message || e}`); }
  } else if (WM_LIVE_SOURCE === "auto" || WM_LIVE_SOURCE === "football-data") errors.push("FOOTBALL_DATA_TOKEN fehlt.");
  const warning = errors.join(" | ");
  liveCache.error = warning;
  return { source: liveCache.matches.length ? `${liveCache.source}-cache-after-error` : "static-no-live-data", matches: liveCache.matches || [], warning };
}

async function fetchApiFootballFixtures() {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `${APIFOOTBALL_BASE_URL}/fixtures?league=${encodeURIComponent(WM_LEAGUE_ID)}&season=${encodeURIComponent(SEASON)}&timezone=${encodeURIComponent(TIMEZONE)}`;
    const r = await fetch(url, { headers: {"x-apisports-key": APIFOOTBALL_KEY, "Accept":"application/json"}, signal: controller.signal });
    const text = await r.text(); const j = text ? JSON.parse(text) : {};
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(j.errors || j.message || text)}`);
    return (Array.isArray(j.response) ? j.response : []).map(mapApiFootballFixture).filter(Boolean);
  } finally { clearTimeout(timeout); }
}

async function fetchFootballDataFixtures() {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `${FOOTBALL_DATA_BASE_URL}/competitions/${encodeURIComponent(FOOTBALL_DATA_COMPETITION)}/matches?season=${encodeURIComponent(SEASON)}`;
    const r = await fetch(url, { headers: {"X-Auth-Token": FOOTBALL_DATA_TOKEN, "Accept":"application/json"}, signal: controller.signal });
    const text = await r.text(); const j = text ? JSON.parse(text) : {};
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${j.message || text}`);
    return (Array.isArray(j.matches) ? j.matches : []).map(mapFootballDataMatch).filter(Boolean);
  } finally { clearTimeout(timeout); }
}

function mapApiFootballFixture(item) {
  const f = item.fixture || {}, t = item.teams || {}, g = item.goals || {}, l = item.league || {};
  return enrichMatch({ fixtureId: f.id, date: f.date, timestamp: f.timestamp, status: normalizeStatus(f.status?.short || f.status?.long || "NS"), statusShort: f.status?.short || "NS", statusText: f.status?.long || "Geplant", elapsed: f.status?.elapsed ?? null, group: l.round || "", home: translateTeamName(t.home?.name || ""), away: translateTeamName(t.away?.name || ""), homeScore: g.home, awayScore: g.away, stadium: f.venue?.name || "", city: f.venue?.city || "" });
}
function mapFootballDataMatch(item) {
  const ft = item.score?.fullTime || {}, ht = item.score?.halfTime || {}, st = normalizeFootballDataStatus(item.status);
  return enrichMatch({ fixtureId: item.id, date: item.utcDate, timestamp: item.utcDate ? Math.floor(new Date(item.utcDate).getTime()/1000) : null, status: st.status, statusShort: st.statusShort, statusText: st.statusText, elapsed: null, group: item.stage || item.group || "", home: translateTeamName(item.homeTeam?.name || item.homeTeam?.shortName || ""), away: translateTeamName(item.awayTeam?.name || item.awayTeam?.shortName || ""), homeScore: ft.home ?? ht.home ?? null, awayScore: ft.away ?? ht.away ?? null, stadium: "", city: "" });
}

function mergeStaticScheduleWithLive(staticMatches, liveMatches) {
  const liveByTeams = new Map();
  for (const live of liveMatches) { const k = matchKey(live.home, live.away, live.date || live.timestamp); if (k) liveByTeams.set(k, live); }
  return staticMatches.map(sm => {
    const live = liveByTeams.get(matchKey(sm.home, sm.away, sm.date || sm.timestamp));
    if (!live) return { ...sm, liveMerged: false };
    return enrichMatch({ ...sm, fixtureId: live.fixtureId || sm.fixtureId, status: live.status || sm.status, statusShort: live.statusShort || sm.statusShort, statusText: live.statusText || sm.statusText, elapsed: live.elapsed ?? sm.elapsed ?? null, homeScore: live.homeScore ?? sm.homeScore ?? null, awayScore: live.awayScore ?? sm.awayScore ?? null, liveMerged: true, liveSource: live.source || "api" });
  });
}
function matchKey(home, away, dateOrTimestamp) {
  const h = canonicalTeamName(home), a = canonicalTeamName(away); if (!h || !a) return "";
  let day = "";
  if (typeof dateOrTimestamp === "number") day = new Date(dateOrTimestamp*1000).toISOString().slice(0,10);
  else if (dateOrTimestamp) { const d = new Date(dateOrTimestamp); if (!Number.isNaN(+d)) day = d.toISOString().slice(0,10); }
  return `${day}|${h}|${a}`;
}
function normalizeStatus(status) { const s = String(status || "").toUpperCase(); if (["1H","2H","HT","ET","P","BT","LIVE"].includes(s)) return "live"; if (["FT","AET","PEN"].includes(s)) return "finished"; if (["PST","CANC","ABD","AWD","WO"].includes(s)) return "special"; return "scheduled"; }
function normalizeFootballDataStatus(status) { const s = String(status || "").toUpperCase(); if (["IN_PLAY","PAUSED"].includes(s)) return {status:"live",statusShort:"LIVE",statusText:"LIVE"}; if (["FINISHED","AWARDED"].includes(s)) return {status:"finished",statusShort:"FT",statusText:"Beendet"}; if (["SUSPENDED","POSTPONED","CANCELLED"].includes(s)) return {status:"special",statusShort:s,statusText:s}; return {status:"scheduled",statusShort:"NS",statusText:"Geplant"}; }

function ensureManualResultsFile() { const dir = path.dirname(MANUAL_RESULTS_PATH); if (!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true}); if (!fs.existsSync(MANUAL_RESULTS_PATH)) fs.writeFileSync(MANUAL_RESULTS_PATH,"{}","utf8"); }
function readManualResults() { try { ensureManualResultsFile(); return JSON.parse(fs.readFileSync(MANUAL_RESULTS_PATH,"utf8") || "{}"); } catch(e) { console.error(e); return {}; } }
function writeManualResults(results) { ensureManualResultsFile(); fs.writeFileSync(MANUAL_RESULTS_PATH, JSON.stringify(results,null,2), "utf8"); }
function parseScore(v) { if (v === "" || v === null || v === undefined) return {value:null}; const n = Number(v); return Number.isFinite(n) ? {value:n} : {error:true}; }
function normalizeManualStatus(status) { const s = String(status || "scheduled").toLowerCase(); return ["live","finished","special","scheduled"].includes(s) ? s : "scheduled"; }
function statusText(status) { const s = normalizeManualStatus(status); return s === "live" ? "LIVE" : s === "finished" ? "Beendet" : s === "special" ? "Info" : "Geplant"; }
function applyManualResults(matches, manualResults) {
  return matches.map(match => { const manual = manualResults[String(match.matchNo || match.fixtureId)]; if (!manual) return match; return { ...match, status: manual.status || match.status, statusShort: manual.status === "live" ? "LIVE" : manual.status === "finished" ? "FT" : match.statusShort, statusText: manual.statusText || match.statusText, elapsed: manual.elapsed ?? match.elapsed ?? null, homeScore: manual.homeScore ?? match.homeScore ?? null, awayScore: manual.awayScore ?? match.awayScore ?? null, manualMerged: true, manualNote: manual.note || "", manualUpdatedAt: manual.updatedAt || null }; });
}

app.listen(PORT, () => {
  console.log(`WM 2026 TV läuft auf Port ${PORT}`);
  console.log(`Hybrid mit 2 APIs + Handeingabe aktiv: ${STATIC_SCHEDULE.length} Spiele`);
});
