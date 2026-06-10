"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Provider = {
  name: string;
  label: string;
  available: boolean;
  defaultModel: string;
  models: { id: string; label: string }[];
};
type Report = {
  id: string;
  type: string;
  status: string;
  aiProvider: string | null;
  aiModel: string | null;
  error: string | null;
  createdAt: string;
};

const STATUS_STYLES: Record<string, string> = {
  GENERATING: "bg-amber-100 text-amber-800",
  READY: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-700",
};

export function PropertyActions({
  propertyId,
  providers,
  reports,
}: {
  propertyId: string;
  providers: Provider[];
  reports: Report[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const configured = providers.filter((p) => p.available);
  const [engine, setEngine] = useState(configured[0]?.name ?? "");
  const currentProvider = configured.find((p) => p.name === engine);
  const [model, setModel] = useState(currentProvider?.defaultModel ?? "");

  function onEngineChange(name: string) {
    setEngine(name);
    const next = configured.find((p) => p.name === name);
    setModel(next?.defaultModel ?? "");
  }

  async function orderHistoryReport() {
    setBusy(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(engine ? { provider: engine, model } : {}),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "" }));
        alert(error || "Could not generate the report.");
      } else {
        router.refresh();
      }
    } catch {
      alert("Network error generating the report.");
    } finally {
      setBusy(false);
    }
  }

  const historyReports = reports.filter((r) => r.type === "WEATHER_HISTORY");

  return (
    <div className="mt-3 space-y-3">
      {/* Weather & Property History Report */}
      <div className="rounded-lg border border-slate-200 bg-canvas p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">
              Weather &amp; Property History Report
            </p>
            <p className="text-xs text-ink-soft">
              NOAA/NWS + live web research → branded PDF
            </p>
          </div>
          <button
            type="button"
            onClick={orderHistoryReport}
            disabled={busy}
            className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white active:bg-brand-dark disabled:opacity-60"
          >
            {busy ? "Generating…" : "Generate"}
          </button>
        </div>

        {configured.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={engine}
              onChange={(e) => onEngineChange(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-ink"
            >
              {configured.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.label}
                </option>
              ))}
            </select>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-ink"
            >
              {(currentProvider?.models ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="mt-2 text-xs text-amber-700">
            No AI key set — report will include NOAA/NWS context only.
          </p>
        )}

        {historyReports.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t border-slate-200 pt-2">
            {historyReports.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      STATUS_STYLES[r.status] ?? "bg-slate-100 text-ink-soft"
                    }`}
                  >
                    {r.status}
                  </span>
                  <span className="text-ink-soft">
                    {new Date(r.createdAt).toLocaleDateString()}
                    {r.aiProvider ? ` · ${r.aiProvider}` : ""}
                    {r.aiModel ? ` (${r.aiModel})` : ""}
                  </span>
                </span>
                {r.status === "READY" && (
                  <a
                    href={`/api/reports/${r.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand"
                  >
                    View PDF
                  </a>
                )}
                {r.status === "FAILED" && r.error && (
                  <span className="text-red-600" title={r.error}>
                    error
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Future slices — still stubs */}
      {[
        { label: "Measure Roof / Siding", hint: "Maps / Solar API or upload & scale" },
        { label: "Start Inspection", hint: "Photos, tags, voice notes, review bot" },
      ].map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={() => alert(`“${a.label}” is coming in a future slice.`)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-canvas px-3 py-2.5 text-left active:bg-slate-100"
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
