"use client";

import { useEffect, useState } from "react";

export type ModelOption = { id: string; label: string };

// Fetches the live list of Gemini models the configured key supports. Returns
// null while loading / when disabled; an array (possibly empty) once resolved.
export function useGeminiModels(enabled: boolean): ModelOption[] | null {
  const [models, setModels] = useState<ModelOption[] | null>(null);

  useEffect(() => {
    if (!enabled) {
      setModels(null);
      return;
    }
    let active = true;
    fetch("/api/gemini-models")
      .then((r) => r.json())
      .then((d) => {
        if (active) setModels(Array.isArray(d.models) ? d.models : []);
      })
      .catch(() => {
        if (active) setModels([]);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return models;
}
