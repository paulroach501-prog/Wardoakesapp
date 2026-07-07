"use client";

import { useState } from "react";

export function AssembleClient({
  propertyId,
  markdown,
}: {
  propertyId: string;
  markdown: string;
}) {
  const [copied, setCopied] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Copy failed — you can select the text below manually.");
    }
  }

  function downloadText(text: string, filename: string) {
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function compileDraft() {
    setDrafting(true);
    setDraft(null);
    try {
      const res = await fetch(`/api/properties/${propertyId}/assemble/fca`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) setDraft(data.draft);
      else alert(data.error || "Draft compile failed.");
    } catch {
      alert("Network error compiling draft.");
    } finally {
      setDrafting(false);
    }
  }

  async function generateSummary() {
    setBusy(true);
    setSummary(null);
    try {
      const res = await fetch(`/api/properties/${propertyId}/assemble/summary`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) setSummary(data.summary);
      else alert(data.error || "Summary failed.");
    } catch {
      alert("Network error generating summary.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white active:bg-brand-dark"
        >
          {copied ? "Copied ✓" : "Copy package"}
        </button>
        <button
          type="button"
          onClick={() => downloadText(markdown, "fca-context-package.md")}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink"
        >
          Download .md
        </button>
        <button
          type="button"
          onClick={compileDraft}
          disabled={drafting}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {drafting ? "Compiling…" : "Compile draft FCA"}
        </button>
        <button
          type="button"
          onClick={generateSummary}
          disabled={busy}
          className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand disabled:opacity-60"
        >
          {busy ? "Summarizing…" : "Quick summary"}
        </button>
      </div>

      {draft && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Draft FCA (in-app compile)</p>
            <button
              type="button"
              onClick={() => downloadText(draft, "draft-fca.md")}
              className="text-xs font-semibold text-brand"
            >
              Download
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm text-ink">{draft}</p>
          <p className="mt-2 text-xs text-ink-soft">
            This is the ~90% draft. Hand the package + photos to the heavy model
            (Claude Code) to catch mistakes and refine.
          </p>
        </div>
      )}

      {summary && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-1 text-sm font-semibold text-ink">AI field summary</p>
          <p className="whitespace-pre-wrap text-sm text-ink">{summary}</p>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">Package preview</p>
        <pre className="max-h-96 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-ink whitespace-pre-wrap">
          {markdown}
        </pre>
      </div>
    </div>
  );
}
