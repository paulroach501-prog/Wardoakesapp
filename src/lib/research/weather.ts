// Authoritative location + weather context from free, no-key government APIs:
//   - US Census geocoder: address -> lat/lon
//   - NWS (api.weather.gov): point metadata, forecast office, zones
//
// This is the factual backbone the AI research layer builds on. Detailed
// historical hail/storm events (NOAA NCEI Storm Events) are a planned
// enhancement; this returns a structured summary plus coordinates.

export type GeoPoint = { lat: number; lon: number; matchedAddress: string };

import { buildStormHistory, stormHistorySummary, type StormHistory } from "@/lib/research/storm";

export type WeatherContext = {
  point: GeoPoint | null;
  /** Human-readable summary passed to the AI research layer and shown in the PDF. */
  summary: string;
  /** Structured graded storm history (Tier 1), when geocoding succeeded. */
  storm: StormHistory | null;
};

const UA = "WardOakesFCA/0.1 (forensic condition assessment app)";

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const url = new URL(
    "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
  );
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result?: {
        addressMatches?: {
          coordinates?: { x: number; y: number };
          matchedAddress?: string;
        }[];
      };
    };
    const match = data.result?.addressMatches?.[0];
    if (!match?.coordinates) return null;
    return {
      lat: match.coordinates.y,
      lon: match.coordinates.x,
      matchedAddress: match.matchedAddress ?? address,
    };
  } catch {
    return null;
  }
}

async function nwsPointSummary(point: GeoPoint): Promise<string> {
  try {
    const res = await fetch(
      `https://api.weather.gov/points/${point.lat.toFixed(4)},${point.lon.toFixed(4)}`,
      { headers: { "User-Agent": UA, Accept: "application/geo+json" } },
    );
    if (!res.ok) return "";
    const data = (await res.json()) as {
      properties?: {
        forecastOffice?: string;
        gridId?: string;
        relativeLocation?: { properties?: { city?: string; state?: string } };
        county?: string;
      };
    };
    const p = data.properties;
    const loc = p?.relativeLocation?.properties;
    const parts: string[] = [];
    if (loc?.city || loc?.state) {
      parts.push(`Nearest NWS reference: ${loc?.city ?? ""}, ${loc?.state ?? ""}`.trim());
    }
    if (p?.gridId) parts.push(`NWS forecast office: ${p.gridId}`);
    return parts.join(". ");
  } catch {
    return "";
  }
}

export async function getWeatherContext(address: string): Promise<WeatherContext> {
  const point = await geocodeAddress(address);
  if (!point) {
    return {
      point: null,
      storm: null,
      summary:
        "Could not geocode the address against the US Census database; coordinates unavailable. Weather context should be verified manually.",
    };
  }

  const [nws, storm] = await Promise.all([
    nwsPointSummary(point),
    buildStormHistory(point.lat, point.lon).catch(() => null),
  ]);

  const summary = [
    `Geocoded to ${point.lat.toFixed(4)}, ${point.lon.toFixed(4)} (matched: ${point.matchedAddress}).`,
    nws,
    storm ? stormHistorySummary(storm) : null,
  ]
    .filter(Boolean)
    .join("\n");

  return { point, storm, summary };
}
