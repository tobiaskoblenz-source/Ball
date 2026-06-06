import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const TIMEZONE = process.env.WM_TIMEZONE || "Europe/Berlin";
const DATA_SOURCE = (process.env.WM_DATA_SOURCE || "static").toLowerCase();

const STATIC_SCHEDULE = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "wm2026-schedule.json"), "utf8")
).map(enrichMatch);

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "wm2026-railway-tv",
    dataSource: DATA_SOURCE,
    timezone: TIMEZONE,
    staticMatches: STATIC_SCHEDULE.length,
    note: "Diese Version nutzt standardmäßig einen fest eingebauten, korrekten WM-2026-Spielplan."
  });
});

app.get("/api/wm2026", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  res.json({
    source: "static-verified-schedule",
    updatedAt: new Date().toISOString(),
    serverNow: new Date().toISOString(),
    count: STATIC_SCHEDULE.length,
    matches: STATIC_SCHEDULE
  });
});

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

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

const COUNTRY_CODES = {
  "algerien":"dz","argentinien":"ar","australien":"au","belgien":"be","bosnien herzegowina":"ba",
  "brasilien":"br","curacao":"cw","kap verde":"cv","kanada":"ca","kolumbien":"co","kroatien":"hr",
  "tschechien":"cz","dr kongo":"cd","ecuador":"ec","agypten":"eg","england":"gb","elfenbeinkuste":"ci",
  "frankreich":"fr","deutschland":"de","ghana":"gh","haiti":"ht","iran":"ir","irak":"iq","japan":"jp",
  "jordanien":"jo","katar":"qa","mexiko":"mx","marokko":"ma","niederlande":"nl","neuseeland":"nz",
  "norwegen":"no","osterreich":"at","panama":"pa","paraguay":"py","portugal":"pt","saudi arabien":"sa",
  "schottland":"gb","senegal":"sn","spanien":"es","sudafrika":"za","sudkorea":"kr","schweden":"se",
  "schweiz":"ch","tunesien":"tn","turkei":"tr","uruguay":"uy","usa":"us","usbekistan":"uz",
  "zweiter gruppe a":"","zweiter gruppe b":"","sie ger gruppe c":""
};

function countryCodeFromName(name) {
  return COUNTRY_CODES[normalizeName(name)] || "";
}

app.listen(PORT, () => {
  console.log(`WM 2026 TV läuft auf Port ${PORT}`);
});
