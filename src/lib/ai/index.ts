import { AIProvider } from "./types";
import { ClaudeProvider } from "./claude";
import { GeminiProvider } from "./gemini";

export * from "./types";

// Registry of available engines. The UI selector reads this list; the
// orchestrator resolves a provider by name. Claude is the default.
const PROVIDERS: AIProvider[] = [new ClaudeProvider(), new GeminiProvider()];

export function listProviders(): {
  name: string;
  label: string;
  available: boolean;
}[] {
  return PROVIDERS.map((p) => ({
    name: p.name,
    label: p.label,
    available: p.available,
  }));
}

export function selectProvider(name?: string): AIProvider | null {
  if (name) {
    return PROVIDERS.find((p) => p.name === name) ?? null;
  }
  // Default: first configured provider, else null (NOAA-only report).
  return PROVIDERS.find((p) => p.available) ?? null;
}
