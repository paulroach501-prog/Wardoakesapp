"use client";

// The pipeline actions that live on each property. These are wired as stubs
// for now — each becomes its own feature slice (history report, measure tool,
// inspection capture, then the FCA + cost-to-cure deliverables).
const ACTIONS: { key: string; label: string; hint: string }[] = [
  {
    key: "history",
    label: "Weather & Property History Report",
    hint: "NOAA + public records → branded PDF",
  },
  {
    key: "measure",
    label: "Measure Roof / Siding",
    hint: "Maps / Solar API or upload & scale",
  },
  {
    key: "inspect",
    label: "Start Inspection",
    hint: "Photos, tags, voice notes, review bot",
  },
];

export function PropertyActions() {
  return (
    <div className="mt-3 grid gap-2">
      {ACTIONS.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() =>
            alert(`“${a.label}” is coming in a future slice. Foundation is ready.`)
          }
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-canvas px-3 py-2.5 text-left active:bg-slate-100"
        >
          <span>
            <span className="block text-sm font-medium text-ink">{a.label}</span>
            <span className="block text-xs text-ink-soft">{a.hint}</span>
          </span>
          <span className="text-ink-soft">›</span>
        </button>
      ))}
    </div>
  );
}
