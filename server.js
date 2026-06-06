import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const TIMEZONE = process.env.WM_TIMEZONE || "Europe/Berlin";

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

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "wm2026-railway-tv",
    dataSource: "static",
    timezone: TIMEZONE,
    staticMatches: STATIC_SCHEDULE.length,
    note: "Server läuft. COUNTRY_CODES wurde vor dem Spielplan geladen."
  });
});

app.get("/api/wm2026", (req, res) => {
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

app.listen(PORT, () => {
  console.log(`WM 2026 TV läuft auf Port ${PORT}`);
  console.log(`Statischer Spielplan geladen: ${STATIC_SCHEDULE.length} Spiele`);
});
