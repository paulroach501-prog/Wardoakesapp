// Lightweight storm-history engine — a Node port of Tier 1 (+ grading) of the
// Ward & Oakes Storm HISTORY Engine. Runs entirely on plain HTTP:
//   - LSR (Local Storm Reports) via Iowa State Mesonet bbox CSV  [keyless]
//   - CDO / GHCND station WT flags + peak gusts via NOAA NCEI    [needs CDO_TOKEN]
//   - transparent, honest impact-likelihood grading
//
// The heavy tiers (MRMS MESH grid, dual-pol NEXRAD render) require Python/pyart
// and stay in the standalone engine; this layer flags which event-days warrant
// that treatment. Mirrors the proven grade_event scoring from the script.

const UA = { "User-Agent": "WardOakes-StormHistory/1.0 (forensic)" };
const RADIUS_MI = 25;

export type StormReport = {
  type: string;
  mag: number;
  distMi: number;
  time: string;
  remark: string;
  city: string;
  county: string;
};

export type GradeBand = "HIGH" | "MODERATE" | "LOW" | "MINIMAL";

export type StormEvent = {
  date: string;
  maxHailIn: number;
  maxWindMph: number;
  tornadoReports: number;
  nearestReportMi: number | null;
  stationHailFlag: boolean;
  gustMph: number | null;
  reports: StormReport[];
  gradeScore: number;
  gradeBand: GradeBand;
  gradeFactors: string[];
};

export type StormHistory = {
  window: { start: string; end: string; years: number };
  criteria: { hailMinIn: number; windMinMph: number; radiusMi: number };
  station: { id: string; name: string; distMi: number } | null;
  summary: { daysWithReports: number; qualifyingEvents: number; byBand: Record<GradeBand, number> };
  events: StormEvent[];
};

function haversineMi(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 3958.8;
  const p1 = (la1 * Math.PI) / 180;
  const p2 = (la2 * Math.PI) / 180;
  const dp = ((la2 - la1) * Math.PI) / 180;
  const dl = ((lo2 - lo1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Minimal RFC4180-ish CSV parser (LSR remarks contain commas/quotes).
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) return [];
  const header = rows[0];
  return rows
    .slice(1)
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ""])));
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type DayAgg = { hail: number[]; wind: number[]; tornado: number[]; reports: StormReport[] };

async function screenLSR(
  lat: number,
  lon: number,
  start: Date,
  end: Date,
): Promise<Record<string, DayAgg>> {
  const d = 0.6; // ~40mi box; radius-filter to 25mi after
  const params = new URLSearchParams({
    sts: `${fmt(start)}T00:00Z`,
    ets: `${fmt(end)}T00:00Z`,
    fmt: "csv",
    west: String(lon - d),
    east: String(lon + d),
    south: String(lat - d),
    north: String(lat + d),
  });
  const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/gis/lsr.py?${params}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return {};
  const txt = await res.text();
  const days: Record<string, DayAgg> = {};
  for (const r of parseCsv(txt)) {
    const la = parseFloat(r.LAT);
    const lo = parseFloat(r.LON);
    if (!isFinite(la) || !isFinite(lo)) continue;
    const dmi = haversineMi(lat, lon, la, lo);
    if (dmi > RADIUS_MI) continue;
    const raw = (r.VALID || "").slice(0, 8);
    if (raw.length < 8) continue;
    const day = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    const typ = (r.TYPETEXT || "").toUpperCase();
    const mag = parseFloat(r.MAG) || 0;
    const kind = typ.includes("HAIL")
      ? "hail"
      : typ.includes("TORNADO")
        ? "tornado"
        : typ.includes("WIND") || typ.includes("WND")
          ? "wind"
          : null;
    if (!kind) continue;
    const rec = (days[day] ??= { hail: [], wind: [], tornado: [], reports: [] });
    rec[kind].push(mag);
    rec.reports.push({
      type: typ,
      mag,
      distMi: Math.round(dmi * 10) / 10,
      time: r.VALID || "",
      remark: (r.REMARK || "").slice(0, 200),
      city: r.CITY || "",
      county: r.COUNTY || "",
    });
  }
  return days;
}

const WT_FLAGS: Record<string, string> = {
  WT03: "thunder",
  WT05: "HAIL",
  WT11: "high/damaging wind",
};

type CdoDay = { wt: Record<string, string>; gustMph?: number; gustDir?: number };

async function screenCDO(
  lat: number,
  lon: number,
  start: Date,
  end: Date,
): Promise<{ byDay: Record<string, CdoDay>; station: StormHistory["station"] }> {
  const tok = process.env.CDO_TOKEN;
  if (!tok) return { byDay: {}, station: null };
  const cdo = async (p: string) => {
    const r = await fetch(`https://www.ncei.noaa.gov/cdo-web/api/v2/${p}`, {
      headers: { ...UA, token: tok },
    });
    if (!r.ok) throw new Error(`CDO ${r.status}`);
    return r.json();
  };

  let station: { id: string; name: string; latitude: number; longitude: number } | null = null;
  for (const dd of [0.5, 1.0, 1.75]) {
    const ext = `${lat - dd},${lon - dd},${lat + dd},${lon + dd}`;
    try {
      const res = (await cdo(`stations?datasetid=GHCND&extent=${ext}&limit=200`)).results ?? [];
      const usw = res.filter((s: { id: string }) => s.id.startsWith("GHCND:USW"));
      if (usw.length) {
        usw.sort(
          (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) =>
            haversineMi(lat, lon, a.latitude, a.longitude) - haversineMi(lat, lon, b.latitude, b.longitude),
        );
        station = usw[0];
        break;
      }
    } catch {
      /* try wider */
    }
  }
  if (!station) return { byDay: {}, station: null };

  const byDay: Record<string, CdoDay> = {};
  for (let yr = start.getFullYear(); yr <= end.getFullYear(); yr++) {
    const y0 = new Date(Math.max(start.getTime(), Date.UTC(yr, 0, 1)));
    const y1 = new Date(Math.min(end.getTime(), Date.UTC(yr, 11, 31)));
    try {
      const j = await cdo(
        `data?datasetid=GHCND&stationid=${station.id}&startdate=${fmt(y0)}&enddate=${fmt(y1)}` +
          `&datatypeid=WT05,WT03,WT11,WSF5,WDF5&limit=1000&units=standard`,
      );
      for (const r of j.results ?? []) {
        const day = (r.date as string).slice(0, 10);
        const e = (byDay[day] ??= { wt: {} });
        if (WT_FLAGS[r.datatype]) e.wt[r.datatype] = WT_FLAGS[r.datatype];
        if (r.datatype === "WSF5") e.gustMph = r.value;
        if (r.datatype === "WDF5") e.gustDir = r.value;
      }
    } catch {
      /* skip year */
    }
  }
  return {
    byDay,
    station: {
      id: station.id,
      name: station.name,
      distMi: Math.round(haversineMi(lat, lon, station.latitude, station.longitude) * 10) / 10,
    },
  };
}

// Transparent impact-likelihood grade (ported from grade_event). MESH and
// dual-pol inputs are omitted here — those are the heavy tiers — so this is the
// honest Tier-1 provisional grade.
export function gradeEvent(
  nearestMi: number | null,
  maxHailIn: number,
  maxWindMph: number,
  stationHailFlag: boolean,
): { score: number; band: GradeBand; why: string[] } {
  let score = 0;
  const why: string[] = [];
  const nm = nearestMi ?? 99;
  if (nm <= 3) { score += 40; why.push(`ground reports within ${nm.toFixed(1)} mi (highly probative)`); }
  else if (nm <= 7) { score += 30; why.push(`ground reports within ${nm.toFixed(1)} mi (probative)`); }
  else if (nm <= 15) { score += 18; why.push(`ground reports ${nm.toFixed(1)} mi away (regional)`); }
  else { score += 8; why.push(`nearest ground report ${nm.toFixed(1)} mi (distant corroboration)`); }

  if (maxHailIn >= 2.0) { score += 15; why.push(`${maxHailIn.toFixed(2)} in hail reported nearby (very large/destructive)`); }
  else if (maxHailIn >= 1.0) { score += 10; why.push(`${maxHailIn.toFixed(2)} in hail reported nearby`); }
  else if (maxHailIn >= 0.75) { score += 6; why.push(`${maxHailIn.toFixed(2)} in hail reported nearby (severe threshold)`); }

  if (maxWindMph >= 70) { score += 12; why.push(`${maxWindMph.toFixed(0)} mph wind reported nearby (destructive)`); }
  else if (maxWindMph >= 58) { score += 8; why.push(`${maxWindMph.toFixed(0)} mph wind reported nearby (severe threshold)`); }

  if (stationHailFlag) { score += 8; why.push("NWS station recorded a HAIL (WT05) flag on this date"); }

  score = Math.min(100, score);
  const band: GradeBand = score >= 70 ? "HIGH" : score >= 45 ? "MODERATE" : score >= 25 ? "LOW" : "MINIMAL";
  return { score, band, why };
}

export async function buildStormHistory(
  lat: number,
  lon: number,
  opts?: { years?: number; hailMinIn?: number; windMinMph?: number },
): Promise<StormHistory> {
  const years = opts?.years ?? 2;
  const hailMin = opts?.hailMinIn ?? 0.75;
  const windMin = opts?.windMinMph ?? 58;
  const end = new Date();
  const start = new Date(end.getTime() - years * 365.25 * 86400000);

  const [lsr, cdo] = await Promise.all([
    screenLSR(lat, lon, start, end).catch(() => ({}) as Record<string, DayAgg>),
    screenCDO(lat, lon, start, end).catch(
      (): { byDay: Record<string, CdoDay>; station: StormHistory["station"] } => ({
        byDay: {},
        station: null,
      }),
    ),
  ]);

  const qualifying = new Set<string>();
  for (const [day, rec] of Object.entries(lsr)) {
    const mh = rec.hail.length ? Math.max(...rec.hail) : 0;
    const mw = rec.wind.length ? Math.max(...rec.wind) : 0;
    if (mh >= hailMin || mw >= windMin || rec.tornado.length > 0) qualifying.add(day);
  }
  for (const [day, e] of Object.entries(cdo.byDay)) {
    if (e.wt.WT05 || (e.gustMph && e.gustMph >= windMin)) {
      const t = new Date(day).getTime();
      if (t >= start.getTime() && t <= end.getTime()) qualifying.add(day);
    }
  }

  const events: StormEvent[] = [];
  for (const day of Array.from(qualifying).sort()) {
    const rec = lsr[day] ?? { hail: [], wind: [], tornado: [], reports: [] };
    const ce = cdo.byDay[day] ?? { wt: {} };
    const mh = rec.hail.length ? Math.max(...rec.hail) : 0;
    const mw = rec.wind.length ? Math.max(...rec.wind) : 0;
    const nearest = rec.reports.length ? Math.min(...rec.reports.map((r) => r.distMi)) : null;
    const stationHail = Boolean(ce.wt.WT05);
    const g = gradeEvent(nearest, mh, mw, stationHail);
    events.push({
      date: day,
      maxHailIn: mh,
      maxWindMph: mw,
      tornadoReports: rec.tornado.length,
      nearestReportMi: nearest,
      stationHailFlag: stationHail,
      gustMph: ce.gustMph ?? null,
      reports: rec.reports,
      gradeScore: g.score,
      gradeBand: g.band,
      gradeFactors: g.why,
    });
  }
  events.sort((a, b) => b.gradeScore - a.gradeScore);

  const byBand: Record<GradeBand, number> = { HIGH: 0, MODERATE: 0, LOW: 0, MINIMAL: 0 };
  for (const e of events) byBand[e.gradeBand]++;

  return {
    window: { start: fmt(start), end: fmt(end), years: Math.round((years) * 100) / 100 },
    criteria: { hailMinIn: hailMin, windMinMph: windMin, radiusMi: RADIUS_MI },
    station: cdo.station,
    summary: { daysWithReports: Object.keys(lsr).length, qualifyingEvents: events.length, byBand },
    events,
  };
}

// Format the storm history as the weather-context text the report + AI consume.
export function stormHistorySummary(sh: StormHistory): string {
  const lines: string[] = [];
  lines.push(
    `Severe-weather history (${sh.window.start} to ${sh.window.end}, ${sh.window.years} yr; ${sh.criteria.radiusMi}-mi radius; listing threshold hail≥${sh.criteria.hailMinIn}in OR wind≥${sh.criteria.windMinMph}mph):`,
  );
  lines.push(
    `${sh.summary.qualifyingEvents} qualifying event-day(s) — HIGH ${sh.summary.byBand.HIGH}, MODERATE ${sh.summary.byBand.MODERATE}, LOW ${sh.summary.byBand.LOW}, MINIMAL ${sh.summary.byBand.MINIMAL}.`,
  );
  if (sh.station) lines.push(`NWS station: ${sh.station.name} (${sh.station.distMi} mi).`);
  const top = sh.events.slice(0, 6);
  for (const e of top) {
    const bits = [
      `hail ${e.maxHailIn.toFixed(2)}in`,
      `wind ${e.maxWindMph.toFixed(0)}mph`,
      e.nearestReportMi != null ? `nearest report ${e.nearestReportMi}mi` : null,
      e.gustMph ? `station gust ${e.gustMph}mph` : null,
      e.stationHailFlag ? "station HAIL flag" : null,
    ].filter(Boolean);
    lines.push(`- ${e.date} [${e.gradeBand}]: ${bits.join(", ")}.`);
  }
  lines.push(
    "Note: MESH hail-grid and dual-pol NEXRAD confirmation for the top events are produced by the standalone radar engine and are not included here.",
  );
  return lines.join("\n");
}
