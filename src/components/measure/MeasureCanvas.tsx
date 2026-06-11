"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Stage, Layer, Image as KImage, Line, Circle } from "react-konva";
import type Konva from "konva";
import {
  Plane,
  Point,
  EdgeType,
  EDGE_TYPES,
  snapToVertex,
  snapToEdge,
  constrainAngle,
  alignmentVertices,
  totalMetrics,
  planeMetrics,
  distance,
} from "@/lib/measure/geometry";

type Mode = "pan" | "calibrate" | "draw";
type Candidate = { pt: Point; kind: "vertex" | "edge" | "angle" | "free" };
const SNAP_PX = 14;

const EDGE_COLORS: Record<EdgeType, string> = {
  eave: "#64748b",
  rake: "#94a3b8",
  ridge: "#dc2626",
  hip: "#f59e0b",
  valley: "#2563eb",
  other: "#0f172a",
};

let _id = 0;
const newId = () => `p${Date.now()}_${_id++}`;

export function MeasureCanvas({
  measurementId,
  imageSrc,
  imageWidth,
  imageHeight,
  initialFeetPerPixel,
  initialPlanes,
}: {
  measurementId: string;
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
  initialFeetPerPixel: number | null;
  initialPlanes: Plane[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 360, height: 480 });
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState<Point>({ x: 0, y: 0 });

  const [mode, setMode] = useState<Mode>("pan");
  const [planes, setPlanes] = useState<Plane[]>(initialPlanes);
  const [draft, setDraft] = useState<Point[]>([]);
  const [cand, setCand] = useState<Candidate | null>(null);
  const [align, setAlign] = useState({ vertical: false, horizontal: false });

  const [calib, setCalib] = useState<{ a?: Point; b?: Point }>({});
  const [feetPerPixel, setFeetPerPixel] = useState<number | null>(initialFeetPerPixel);
  const [feetInput, setFeetInput] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ planeId: string; index: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.src = imageSrc;
    image.onload = () => setImg(image);
  }, [imageSrc]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      setSize({
        width: el.clientWidth,
        height: Math.max(380, Math.min(window.innerHeight - 240, 720)),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (!img || !size.width) return;
    const s = Math.min(size.width / imageWidth, size.height / imageHeight) * 0.95;
    setScale(s);
    setPos({ x: (size.width - imageWidth * s) / 2, y: (size.height - imageHeight * s) / 2 });
  }, [img, size, imageWidth, imageHeight]);

  const worldRadius = SNAP_PX / scale;

  const pointer = useCallback((): Point | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const p = stage.getRelativePointerPosition();
    return p ? { x: p.x, y: p.y } : null;
  }, []);

  // Snap precedence: existing vertex → existing edge → 90/45 angle → free.
  const computeCandidate = useCallback(
    (raw: Point): Candidate => {
      const v = snapToVertex(raw, planes, worldRadius, draft);
      if (v) return { pt: v, kind: "vertex" };
      const e = snapToEdge(raw, planes, worldRadius);
      if (e) return { pt: e.point, kind: "edge" };
      const a = constrainAngle(draft, raw);
      if (a) return { pt: a, kind: "angle" };
      return { pt: raw, kind: "free" };
    },
    [planes, draft, worldRadius],
  );

  function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const ptr = stage?.getPointerPosition();
    if (!ptr) return;
    const old = scale;
    const wx = (ptr.x - pos.x) / old;
    const wy = (ptr.y - pos.y) / old;
    const next = Math.max(0.05, Math.min(60, old * (e.evt.deltaY > 0 ? 0.9 : 1.1)));
    setScale(next);
    setPos({ x: ptr.x - wx * next, y: ptr.y - wy * next });
  }

  function zoomBy(factor: number) {
    const next = Math.max(0.05, Math.min(60, scale * factor));
    const cx = size.width / 2;
    const cy = size.height / 2;
    setScale(next);
    setPos({ x: cx - ((cx - pos.x) / scale) * next, y: cy - ((cy - pos.y) / scale) * next });
  }

  const pinch = useRef<{ dist: number } | null>(null);
  function onTouchMove(e: Konva.KonvaEventObject<TouchEvent>) {
    const t = e.evt.touches;
    if (t.length !== 2) return;
    e.evt.preventDefault();
    const p1 = { x: t[0].clientX, y: t[0].clientY };
    const p2 = { x: t[1].clientX, y: t[1].clientY };
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    if (pinch.current) {
      const next = Math.max(0.05, Math.min(60, scale * (dist / pinch.current.dist)));
      const wx = (center.x - pos.x) / scale;
      const wy = (center.y - pos.y) / scale;
      setScale(next);
      setPos({ x: center.x - wx * next, y: center.y - wy * next });
    }
    pinch.current = { dist };
  }

  function onStageClick(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const p = pointer();
    if (!p) return;

    if (mode === "calibrate") {
      if (!calib.a) setCalib({ a: p });
      else if (!calib.b) setCalib({ a: calib.a, b: p });
      return;
    }

    if (mode === "draw") {
      const c = computeCandidate(p);
      if (draft.length >= 3 && distance(c.pt, draft[0]) <= worldRadius) {
        finishPlane();
        return;
      }
      setDraft((d) => [...d, c.pt]);
      setDirty(true);
      return;
    }

    // pan mode: tapping empty space clears selection
    if (e.target === e.target.getStage()) {
      setSelectedId(null);
      setSelectedEdge(null);
    }
  }

  function onStageMove() {
    if (mode === "pan") return;
    const p = pointer();
    if (!p) return;
    if (mode === "draw") {
      const c = computeCandidate(p);
      setCand(c);
      setAlign(alignmentVertices(c.pt, planes, worldRadius));
    } else if (mode === "calibrate") {
      setCand({ pt: p, kind: "free" });
    }
  }

  function finishPlane() {
    if (draft.length < 3) return;
    const plane: Plane = {
      id: newId(),
      name: `Plane ${planes.length + 1}`,
      pitch: 6,
      points: draft,
      edgeTypes: draft.map(() => "eave" as EdgeType),
    };
    setPlanes((ps) => [...ps, plane]);
    setSelectedId(plane.id);
    setDraft([]);
    setCand(null);
    setDirty(true);
  }

  function applyCalibration() {
    if (!calib.a || !calib.b) return;
    const feet = parseFloat(feetInput);
    const px = distance(calib.a, calib.b);
    if (!feet || feet <= 0 || px <= 0) return;
    setFeetPerPixel(feet / px);
    setCalib({});
    setFeetInput("");
    setMode("pan");
    setDirty(true);
  }

  function updatePlane(id: string, patch: Partial<Plane>) {
    setPlanes((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setDirty(true);
  }
  function setEdgeType(planeId: string, index: number, type: EdgeType) {
    setPlanes((ps) =>
      ps.map((p) => {
        if (p.id !== planeId) return p;
        const edgeTypes = [...p.edgeTypes];
        edgeTypes[index] = type;
        return { ...p, edgeTypes };
      }),
    );
    setDirty(true);
  }
  function deletePlane(id: string) {
    setPlanes((ps) => ps.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/measurements/${measurementId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feetPerPixel, planes }),
      });
      if (res.ok) setDirty(false);
      else alert("Could not save measurement.");
    } catch {
      alert("Network error saving.");
    } finally {
      setSaving(false);
    }
  }

  const totals = feetPerPixel ? totalMetrics(planes, feetPerPixel) : null;
  const candColor =
    cand?.kind === "vertex" ? "#dc2626" : cand?.kind === "edge" ? "#f59e0b" : "#1d4ed8";
  const selectedPlane = planes.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {(["pan", "calibrate", "draw"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setDraft([]);
              setCalib({});
              setCand(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
              mode === m ? "bg-brand text-white" : "border border-slate-300 bg-white text-ink"
            }`}
          >
            {m === "calibrate" ? "Set scale" : m === "pan" ? "Pan / select" : "Draw"}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <button type="button" onClick={() => zoomBy(1.25)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs">＋</button>
        <button type="button" onClick={() => zoomBy(0.8)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs">－</button>
        {mode === "draw" && draft.length >= 3 && (
          <button type="button" onClick={finishPlane} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white">Finish</button>
        )}
        {mode === "draw" && draft.length > 0 && (
          <button type="button" onClick={() => { setDraft((d) => d.slice(0, -1)); }} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs">Undo pt</button>
        )}
        <span className="ml-auto text-xs text-ink-soft">{feetPerPixel ? "scale ✓" : "no scale"}</span>
        <button type="button" onClick={save} disabled={saving || !dirty} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>

      {mode === "calibrate" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Tap two points along a known distance, then enter its length in feet.</p>
      )}
      {mode === "draw" && (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">Tap corners. Snaps to corners (red), existing edges (orange), and 90°/45° angles. Tap the first point or “Finish” to close.</p>
      )}
      {mode === "pan" && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-ink-soft">Tap an edge to label it, or a plane to set its pitch. Drag to pan, pinch/scroll to zoom.</p>
      )}

      {/* Canvas */}
      <div ref={containerRef} className="overflow-hidden rounded-xl border border-slate-300 bg-slate-100" style={{ touchAction: "none" }}>
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          scaleX={scale}
          scaleY={scale}
          x={pos.x}
          y={pos.y}
          draggable={mode === "pan"}
          onDragEnd={(e) => setPos({ x: e.target.x(), y: e.target.y() })}
          onWheel={onWheel}
          onClick={onStageClick}
          onTap={onStageClick}
          onMouseMove={onStageMove}
          onTouchMove={onTouchMove}
          onTouchEnd={() => (pinch.current = null)}
        >
          <Layer listening={false}>
            {img && <KImage image={img} width={imageWidth} height={imageHeight} />}
          </Layer>

          {/* alignment + crosshair guides while drawing */}
          {mode === "draw" && cand && (
            <Layer listening={false}>
              <Line points={[cand.pt.x, -1e5, cand.pt.x, 1e5]} stroke={align.vertical ? "#dc2626" : "#93c5fd"} strokeWidth={1 / scale} dash={[6 / scale, 6 / scale]} />
              <Line points={[-1e5, cand.pt.y, 1e5, cand.pt.y]} stroke={align.horizontal ? "#dc2626" : "#93c5fd"} strokeWidth={1 / scale} dash={[6 / scale, 6 / scale]} />
            </Layer>
          )}

          <Layer>
            {/* committed planes: fill + per-edge colored, clickable segments */}
            {planes.map((pl) => {
              const flat = pl.points.flatMap((p) => [p.x, p.y]);
              const isSel = pl.id === selectedId;
              return (
                <Line
                  key={`fill-${pl.id}`}
                  points={flat}
                  closed
                  stroke="transparent"
                  fill={isSel ? "rgba(15,23,42,0.14)" : "rgba(29,78,216,0.08)"}
                  onClick={() => { setSelectedId(pl.id); setSelectedEdge(null); }}
                  onTap={() => { setSelectedId(pl.id); setSelectedEdge(null); }}
                />
              );
            })}
            {planes.flatMap((pl) => {
              const n = pl.points.length;
              return pl.points.map((a, i) => {
                const b = pl.points[(i + 1) % n];
                const type = pl.edgeTypes[i] ?? "other";
                const isSelEdge = selectedEdge?.planeId === pl.id && selectedEdge.index === i;
                return (
                  <Line
                    key={`edge-${pl.id}-${i}`}
                    points={[a.x, a.y, b.x, b.y]}
                    stroke={EDGE_COLORS[type]}
                    strokeWidth={(isSelEdge ? 5 : 2.5) / scale}
                    hitStrokeWidth={16 / scale}
                    onClick={(e) => { e.cancelBubble = true; setSelectedEdge({ planeId: pl.id, index: i }); setSelectedId(pl.id); }}
                    onTap={(e) => { e.cancelBubble = true; setSelectedEdge({ planeId: pl.id, index: i }); setSelectedId(pl.id); }}
                  />
                );
              });
            })}
            {planes.flatMap((pl) =>
              pl.points.map((p, i) => (
                <Circle key={`v-${pl.id}-${i}`} x={p.x} y={p.y} radius={4 / scale} fill="#1d4ed8" />
              )),
            )}

            {/* draft */}
            {draft.length > 0 && (
              <Line points={[...draft.flatMap((p) => [p.x, p.y]), ...(cand ? [cand.pt.x, cand.pt.y] : [])]} stroke={candColor} strokeWidth={2 / scale} />
            )}
            {draft.map((p, i) => (
              <Circle key={`d${i}`} x={p.x} y={p.y} radius={4 / scale} fill={candColor} />
            ))}
            {cand && mode === "draw" && (
              <Circle x={cand.pt.x} y={cand.pt.y} radius={(cand.kind === "free" ? 5 : 9) / scale} stroke={candColor} strokeWidth={2 / scale} />
            )}

            {/* calibration */}
            {calib.a && <Circle x={calib.a.x} y={calib.a.y} radius={5 / scale} fill="#d97706" />}
            {calib.a && (calib.b || cand) && (
              <Line points={[calib.a.x, calib.a.y, (calib.b ?? cand!.pt).x, (calib.b ?? cand!.pt).y]} stroke="#d97706" strokeWidth={2 / scale} dash={[6 / scale, 4 / scale]} />
            )}
            {calib.b && <Circle x={calib.b.x} y={calib.b.y} radius={5 / scale} fill="#d97706" />}
          </Layer>
        </Stage>
      </div>

      {/* Contextual label bar */}
      {selectedEdge && (
        <div className="rounded-lg border border-slate-300 bg-white p-2">
          <p className="mb-1 text-xs font-medium text-ink-soft">Label this edge:</p>
          <div className="flex flex-wrap gap-1.5">
            {EDGE_TYPES.map((t) => {
              const active =
                planes.find((p) => p.id === selectedEdge.planeId)?.edgeTypes[selectedEdge.index] === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEdgeType(selectedEdge.planeId, selectedEdge.index, t)}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${active ? "text-white" : "border border-slate-300 text-ink"}`}
                  style={active ? { backgroundColor: EDGE_COLORS[t] } : undefined}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {!selectedEdge && selectedPlane && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white p-2">
          <span className="text-xs font-medium text-ink-soft">{selectedPlane.name} pitch:</span>
          <select
            value={selectedPlane.pitch}
            onChange={(e) => updatePlane(selectedPlane.id, { pitch: Number(e.target.value) })}
            className="rounded border border-slate-300 px-1.5 py-1 text-xs"
          >
            {Array.from({ length: 19 }, (_, i) => i).map((n) => (
              <option key={n} value={n}>{n}:12</option>
            ))}
          </select>
          <button type="button" onClick={() => deletePlane(selectedPlane.id)} className="ml-auto text-xs font-medium text-red-600">Delete plane</button>
        </div>
      )}

      {calib.a && calib.b && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <span className="text-sm text-amber-900">Length:</span>
          <input type="number" inputMode="decimal" value={feetInput} onChange={(e) => setFeetInput(e.target.value)} placeholder="feet" className="w-24 rounded border border-amber-300 px-2 py-1 text-sm" />
          <button type="button" onClick={applyCalibration} className="rounded bg-amber-600 px-3 py-1 text-sm font-semibold text-white">Set scale</button>
        </div>
      )}

      {/* Totals */}
      {totals && planes.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <p className="font-semibold text-ink">Totals</p>
          <div className="mt-1 grid grid-cols-3 gap-2 text-center">
            <Stat label="Sloped area" value={`${totals.slopedAreaSqFt.toFixed(0)} ft²`} />
            <Stat label="Squares" value={totals.squares.toFixed(1)} />
            <Stat label="Plan area" value={`${totals.planAreaSqFt.toFixed(0)} ft²`} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
            {EDGE_TYPES.map((t) =>
              totals.edgeLengthsByType[t] > 0.5 ? (
                <span key={t} className="capitalize">{t}: {totals.edgeLengthsByType[t].toFixed(0)} ft</span>
              ) : null,
            )}
          </div>
        </div>
      )}

      {!feetPerPixel && <p className="text-xs text-ink-soft">Set the scale first — areas need a calibrated scale.</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-canvas p-2">
      <div className="text-sm font-semibold text-ink">{value}</div>
      <div className="text-[11px] text-ink-soft">{label}</div>
    </div>
  );
}
