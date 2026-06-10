import {
  AIProvider,
  ModelOption,
  PropertyResearchInput,
  ResearchResult,
  RESEARCH_OUTPUT_INSTRUCTIONS,
  SYSTEM_PROMPT,
} from "./types";
import { parseResearch } from "./claude";

// Gemini-backed research provider via the Generative Language API, with Google
// Search grounding enabled so it can cite live sources. Implemented with fetch
// to avoid an extra SDK dependency; same ResearchResult contract as Claude.
export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  readonly label = "Gemini (Google)";
  readonly defaultModel = "gemini-2.0-flash";
  readonly models: ModelOption[] = [
    { id: "gemini-2.0-flash", label: "2.0 Flash — fast, free tier" },
    { id: "gemini-1.5-pro", label: "1.5 Pro — higher quality" },
    { id: "gemini-1.5-flash", label: "1.5 Flash — fast" },
  ];

  get available(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async research(
    input: PropertyResearchInput,
    model?: string,
  ): Promise<ResearchResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
    const modelId = model ?? this.defaultModel;

    const prompt = `${SYSTEM_PROMPT}

Subject property: ${input.address}

Authoritative weather/location context already gathered (from NOAA/NWS):
${input.weatherContext}

Research this property and compile the Weather & Property History Report.
${RESEARCH_OUTPUT_INSTRUCTIONS}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini request failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("\n")
        .trim() ?? "";

    return parseResearch(text, this.name);
  }
}
