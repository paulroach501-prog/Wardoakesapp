// Pure geometry + measurement math for the measure tool. No React/Konva here so
// it can be unit-tested and reused (e.g. in report generation later).

export type Point = { x: number; y: number };

// Common roof edge classifications. Drives material takeoff and, later, the
// forensic report's per-edge linear-foot breakdown.
export const EDGE_TYPES = [
  "eave",
  "rake",
  "ridge",
  "hip",
  "valley",
  "other",
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export type Plane = {
  id: string;
  name: string;
  /** Pitch as rise-in-12 (e.g. 6 => 6:12). 0 = flat. */
  pitch: number;
  points: Point[];
  /** Edge type for segment i (point i -> point i+1, wrapping). */
  edgeTypes: EdgeType[];
};

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// Shoelace formula — unsigned polygon area in the same (pixel) units as points.
export function polygonAreaPx(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// √(rise² + 12²) / 12 — converts a flat (plan) area to true sloped area.
export function pitchMultiplier(pitch: number): number {
  return Math.sqrt(pitch * pitch + 144) / 12;
}

export type PlaneMetrics = {
  planAreaSqFt: number;
  slopedAreaSqFt: number;
  perimeterFt: number;
  edgeLengthsByType: Record<EdgeType, number>;
};

export function planeMetrics(plane: Plane, feetPerPixel: number): PlaneMetrics {
  const planAreaSqFt = polygonAreaPx(plane.points) * feetPerPixel * feetPerPixel;
  const slopedAreaSqFt = planAreaSqFt * pitchMultiplier(plane.pitch);

  const edgeLengthsByType: Record<EdgeType, number> = {
    eave: 0, rake: 0, ridge: 0, hip: 0, valley: 0, other: 0,
  };
  let perimeterFt = 0;
  const n = plane.points.length;
  for (let i = 0; i < n; i++) {
    const a = plane.points[i];
    const b = plane.points[(i + 1) % n];
    // The closing edge only exists once the polygon is complete (n >= 3).
    if (i === n - 1 && n < 3) break;
    const lenFt = distance(a, b) * feetPerPixel;
    perimeterFt += lenFt;
    const type = plane.edgeTypes[i] ?? "other";
    edgeLengthsByType[type] += lenFt;
  }
  return { planAreaSqFt, slopedAreaSqFt, perimeterFt, edgeLengthsByType };
}

export type TotalMetrics = {
  planAreaSqFt: number;
  slopedAreaSqFt: number;
  squares: number; // roofing "squares" = sloped area / 100
  edgeLengthsByType: Record<EdgeType, number>;
};

export function totalMetrics(planes: Plane[], feetPerPixel: number): TotalMetrics {
  const totals: TotalMetrics = {
    planAreaSqFt: 0,
    slopedAreaSqFt: 0,
    squares: 0,
    edgeLengthsByType: { eave: 0, rake: 0, ridge: 0, hip: 0, valley: 0, other: 0 },
  };
  for (const plane of planes) {
    const m = planeMetrics(plane, feetPerPixel);
    totals.planAreaSqFt += m.planAreaSqFt;
    totals.slopedAreaSqFt += m.slopedAreaSqFt;
    for (const t of EDGE_TYPES) totals.edgeLengthsByType[t] += m.edgeLengthsByType[t];
  }
  totals.squares = totals.slopedAreaSqFt / 100;
  return totals;
}

// Find the nearest existing vertex across all planes within `radiusWorld`
// (already converted from screen px ÷ zoom by the caller). Returns the snapped
// point or null. This is what enforces shared vertices between adjacent planes.
export function snapToVertex(
  target: Point,
  planes: Plane[],
  radiusWorld: number,
  draftPoints: Point[] = [],
): Point | null {
  let best: Point | null = null;
  let bestDist = radiusWorld;
  const consider = (p: Point) => {
    const d = distance(target, p);
    if (d <= bestDist) {
      bestDist = d;
      best = p;
    }
  };
  for (const plane of planes) for (const p of plane.points) consider(p);
  for (const p of draftPoints) consider(p);
  return best;
}
