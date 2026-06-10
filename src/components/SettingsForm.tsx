"use client";

import { useMemo, useState } from "react";
import type { ProviderInfo } from "@/lib/ai";

const selectClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export function SettingsForm({
  providers,
  initialProvider,
  initialModel,
}: {
  providers: ProviderInfo[];
  initialProvider: string | null;
  initialModel: string | null;
}) {
  const [provider, setProvider] = useState(
    initialProvider ?? providers.find((p) => p.available)?.name ?? providers[0]?.name ?? "",
  );
  const current = useMemo(
    () => providers.find((p) => p.name === provider),
    [providers, provider],
  );
  const [model, setModel] = useState(
    initialModel ?? current?.defaultModel ?? "",
  );
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function onProviderChange(name: string) {
    setProvider(name);
    const next = providers.find((p) => p.name === name);
    setModel(next?.defaultModel ?? "");
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model }),
      });
      if (res.ok) setSaved(true);
      else alert("Could not save settings.");
    } catch {
      alert("Network error saving settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="space-y-1">
        <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
          Provider
        </label>
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value)}
          className={selectClass}
        >
          {providers.map((p) => (
            <option key={p.name} value={p.name} disabled={!p.available}>
              {p.label}
              {p.available ? "" : " (no key)"}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
          Model
        </label>
        <select
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setSaved(false);
          }}
          className={selectClass}
        >
          {(current?.models ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white active:bg-brand-dark disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save defaults"}
        </button>
        {saved && <span className="text-sm text-green-700">Saved ✓</span>}
      </div>
    </div>
  );
}
