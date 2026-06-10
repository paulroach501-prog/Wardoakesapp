"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Stage, Layer, Image as KImage, Line, Circle, Text } from "react-konva";
import type Konva from "konva";
import {
  Plane,
  Point,
  EdgeType,
  EDGE_TYPES,
  snapToVertex,
  totalMetrics,
  planeMetrics,
  distance,
} from "@/lib/measure/geometry";

type Mode = "pan" | "calibrate" | "draw";
const SNAP_PX = 14; // screen-pixel snap threshold (scaled by zoom into world units)

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
  const [hover, setHover] = useState<Point | null>(null);
  const [snapPt, setSnapPt] = useState<Point | null>(null);

  const [calib, setCalib] = useState<{ a?: Point; b?: Point }>({});
  const [feetPerPixel, setFeetPerPixel] = useState<number | null>(initialFeetPerPixel);
  const [feetInput, setFeetInput] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // --- load underlay image + fit to container ---
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
      const w = el.clientWidth;
      const h = Math.max(380, Math.min(window.innerHeight - 240, 720));
      setSize({ width: w, height: h });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Fit the image into view once both image + size are known.
  useEffect(() => {
    if (!img || !size.width) return;
    const s = Math.min(size.width / imageWidth, size.height / imageHeight) * 0.95;
    setScale(s);
    setPos({
      x: (size.width - imageWidth * s) / 2,
      y: (size.height - imageHeight * s) / 2,
    });
  }, [img, size, imageWidth, imageHeight]);

  const worldRadius = SNAP_PX / scale;

  const pointer = useCallback((): Point | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const p = stage.getRelativePointerPosition();
    return p ? { x: p.x, y: p.y } : null;
  }, []);

  // --- zoom (wheel) about the cursor ---
  function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const old = scale;
    const ptr = stage.getPointerPosition();
    if (!ptr) return;
    const worldX = (ptr.x - pos.x) / old;
    const worldY = (ptr.y - pos.y) / old;
    const next = Math.max(0.05, Math.min(40, old * (e.evt.deltaY > 0 ? 0.9 : 1.1)));
    setScale(next);
    setPos({ x: ptr.x - worldX * next, y: ptr.y - worldY * next });
  }

  function zoomBy(factor: number) {
    const next = Math.max(0.05, Math.min(40, scale * factor));
    const cx = size.width / 2;
    const cy = size.height / 2;
    const worldX = (cx - pos.x) / scale;
    const worldY = (cy - pos.y) / scale;
    setScale(next);
    setPos({ x: cx - worldX * next, y: cy - worldY * next });
  }

  // --- pinch zoom (two-finger) ---
  const pinch = useRef<{ dist: number; center: Point } | null>(null);
  function onTouchMove(e: Konva.KonvaEventObject<TouchEvent>) {
    const t = e.evt.touches;
    if (t.length !== 2) return;
    e.evt.preventDefault();
    const p1 = { x: t[0].clientX, y: t[0].clientY };
    const p2 = { x: t[1].clientX, y: t[1].clientY };
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    if (pinch.current) {
      const ratio = dist / pinch.current.dist;
      const next = Math.max(0.05, Math.min(40, scale * ratio));
      const worldX = (center.x - pos.x) / scale;
      const worldY = (center.y - pos.y) / scale;
      setScale(next);
      setPos({ x: center.x - worldX * next, y: center.y - worldY * next });
    }
    pinch.current = { dist, center };
  }
  function onTouchEnd() {
    pinch.current = null;
  }

  // --- placing points (click / tap) ---
  function onStageClick() {
    const p = pointer();
    if (!p) return;

    if (mode === "calibrate") {
      if (!calib.a) setCalib({ a: p });
      else if (!calib.b) setCalib({ a: calib.a, b: p });
      return;
    }

    if (mode === "draw") {
      const snapped = snapToVertex(p, planes, worldRadius, draft) ?? p;
      // Close the polygon if tapping near the first point.
      if (draft.length >= 3 && distance(snapped, draft[0]) <= worldRadius) {
        finishPlane();
        return;
      }
      setDraft((d) => [...d, snapped]);
    }
  }

  function onStageMove() {
    if (mode === "pan") return;
    const p = pointer();
    if (!p) return;
    setHover(p);
    if (mode === "draw") {
      const s = snapToVertex(p, planes, worldRadius, draft);
      setSnapPt(s);
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
    setSnapPt(null);
    setDirty(true);
  }

  function applyCalibration() {
    if (!calib.a || !calib.b) return;
    const feet = parseFloat(feetInput);
    if (!feet || feet <= 0) return;
    const px = distance(calib.a, calib.b);
    if (px <= 0) return;
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
  const selected = planes.find((p) => p.id === selectedId) ?? null;

  const previewColor = snapPt ? "#dc2626" : "#1d4ed8";

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
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
              mode === m
                ? "bg-brand text-white"
                : "border border-slate-300 bg-white text-ink"
            }`}
          >
            {m === "calibrate" ? "Set scale" : m}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <button type="button" onClick={() => zoomBy(1.25)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs">＋</button>
        <button type="button" onClick={() => zoomBy(0.8)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs">－</button>
        {mode === "draw" && draft.length >= 3 && (
          <button type="button" onClick={finishPlane} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white">
            Finish plane
          </button>
        )}
        <span className="ml-auto text-xs text-ink-soft">
          {feetPerPixel ? "scale set ✓" : "scale not set"}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>

      {mode === "calibrate" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Tap two points along a known distance (a wall, a documented ridge), then enter its length in feet.
        </p>
      )}
      {mode === "draw" && (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Tap to place corners. Tap the first point (or “Finish plane”) to close. Points snap to existing corners — zoom in for finer snapping.
        </p>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className="overflow-hidden rounded-xl border border-slate-300 bg-slate-100"
        style={{ touchAction: "none" }}
      >
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
          onTouchEnd={onTouchEnd}
        >
          <Layer listening={false}>
            {img && <KImage image={img} width={imageWidth} height={imageHeight} />}
          </Layer>

          <Layer>
            {/* committed planes */}
            {planes.map((pl) => {
              const flat = pl.points.flatMap((p) => [p.x, p.y]);
              const isSel = pl.id === selectedId;
              return (
                <Line
                  key={pl.id}
                  points={flat}
                  closed
                  stroke={isSel ? "#0f172a" : "#1d4ed8"}
                  strokeWidth={(isSel ? 2.5 : 1.8) / scale}
                  fill={isSel ? "rgba(15,23,42,0.12)" : "rgba(29,78,216,0.10)"}
                  onClick={() => setSelectedId(pl.id)}
                  onTap={() => setSelectedId(pl.id)}
                />
              );
            })}
            {/* vertices of committed planes */}
            {planes.flatMap((pl) =>
              pl.points.map((p, i) => (
                <Circle key={`${pl.id}-${i}`} x={p.x} y={p.y} radius={4 / scale} fill="#1d4ed8" />
              )),
            )}

            {/* draft polygon */}
            {draft.length > 0 && (
              <Line
                points={[
                  ...draft.flatMap((p) => [p.x, p.y]),
                  ...(hover ? [(snapPt ?? hover).x, (snapPt ?? hover).y] : []),
                ]}
                stroke={previewColor}
                strokeWidth={2 / scale}
              />
            )}
            {draft.map((p, i) => (
              <Circle key={`d${i}`} x={p.x} y={p.y} radius={4 / scale} fill={previewColor} />
            ))}
            {snapPt && (
              <Circle x={snapPt.x} y={snapPt.y} radius={9 / scale} stroke="#dc2626" strokeWidth={2 / scale} />
            )}

            {/* calibration line */}
            {calib.a && (
              <Circle x={calib.a.x} y={calib.a.y} radius={5 / scale} fill="#d97706" />
            )}
            {calib.a && (calib.b || hover) && (
              <Line
                points={[calib.a.x, calib.a.y, (calib.b ?? hover!).x, (calib.b ?? hover!).y]}
                stroke="#d97706"
                strokeWidth={2 / scale}
                dash={[6 / scale, 4 / scale]}
              />
            )}
            {calib.b && <Circle x={calib.b.x} y={calib.b.y} radius={5 / scale} fill="#d97706" />}
          </Layer>
        </Stage>
      </div>

      {/* Calibration input */}
      {calib.a && calib.b && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <span className="text-sm text-amber-900">Length of that line:</span>
          <input
            type="number"
            inputMode="decimal"
            value={feetInput}
            onChange={(e) => setFeetInput(e.target.value)}
            placeholder="feet"
            className="w-24 rounded border border-amber-300 px-2 py-1 text-sm"
          />
          <button type="button" onClick={applyCalibration} className="rounded bg-amber-600 px-3 py-1 text-sm font-semibold text-white">
            Set scale
          </button>
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
                <span key={t} className="capitalize">
                  {t}: {totals.edgeLengthsByType[t].toFixed(0)} ft
                </span>
              ) : null,
            )}
          </div>
        </div>
      )}

      {!feetPerPixel && (
        <p className="text-xs text-ink-soft">
          Tip: set the scale first (the “Set scale” tool), then draw — areas need a calibrated scale.
        </p>
      )}

      {/* Plane list + per-plane editor */}
      {planes.length > 0 && (
        <div className="space-y-2">
          {planes.map((pl) => {
            const m = feetPerPixel ? planeMetrics(pl, feetPerPixel) : null;
            const isSel = pl.id === selectedId;
            return (
              <div
                key={pl.id}
                className={`rounded-lg border p-3 ${isSel ? "border-ink bg-slate-50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => setSelectedId(isSel ? null : pl.id)} className="text-left">
                    <span className="text-sm font-medium text-ink">{pl.name}</span>
                    {m && (
                      <span className="ml-2 text-xs text-ink-soft">
                        {m.slopedAreaSqFt.toFixed(0)} ft² · pitch {pl.pitch}:12
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-ink-soft">Pitch</label>
                    <select
                      value={pl.pitch}
                      onChange={(e) => updatePlane(pl.id, { pitch: Number(e.target.value) })}
                      className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                    >
                      {Array.from({ length: 19 }, (_, i) => i).map((n) => (
                        <option key={n} value={n}>{n}:12</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => deletePlane(pl.id)} className="text-xs font-medium text-red-600">
                      Delete
                    </button>
                  </div>
                </div>

                {isSel && (
                  <div className="mt-2 border-t border-slate-200 pt-2">
                    <p className="mb-1 text-xs font-medium text-ink-soft">Edge labels</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {pl.points.map((_, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="text-xs text-ink-soft">Edge {i + 1}</span>
                          <select
                            value={pl.edgeTypes[i] ?? "eave"}
                            onChange={(e) => {
                              const edgeTypes = [...pl.edgeTypes];
                              edgeTypes[i] = e.target.value as EdgeType;
                              updatePlane(pl.id, { edgeTypes });
                            }}
                            className="rounded border border-slate-300 px-1 py-0.5 text-xs capitalize"
                          >
                            {EDGE_TYPES.map((t) => (
                              <option key={t} value={t} className="capitalize">{t}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
