// Provider-agnostic AI layer. The app talks to this interface; concrete
// engines (Claude, Gemini) implement it, and `selectProvider` picks one by
// name so the UI can offer a model selector. Adding an engine = one new file.

export type ResearchSource = {
  title: string;
  url: string;
};

export type ResearchFinding = {
  // e.g. "Ownership History", "Year Built / Construction", "Applicable Codes",
  // "Weather & Hail History".
  category: string;
  summary: string;
  sources: ResearchSource[];
};

export type PropertyResearchInput = {
  /** Full formatted address of the subject property. */
  address: string;
  /** Authoritative weather/location context already gathered from NOAA/NWS. */
  weatherContext: string;
};

export type ResearchResult = {
  /** Which engine produced this ("claude" | "gemini"). */
  provider: string;
  /** Short executive summary of what the research found. */
  narrative: string;
  findings: ResearchFinding[];
};

export interface AIProvider {
  /** Stable identifier used by the selector and stored on the Report. */
  readonly name: string;
  /** Human-facing label for the UI. */
  readonly label: string;
  /** True when the required API key is present in the environment. */
  readonly available: boolean;
  /**
   * Research the property using live web sources and return structured
   * findings. Implementations should cite sources for each finding.
   */
  research(input: PropertyResearchInput): Promise<ResearchResult>;
}

// The JSON shape we ask the model to return. Kept in one place so both
// providers (and any future one) format their output identically.
export const RESEARCH_OUTPUT_INSTRUCTIONS = `Return ONLY a JSON object with this exact shape:
{
  "narrative": "2-4 sentence executive summary of the property and findings",
  "findings": [
    {
      "category": "Ownership History" | "Year Built / Construction" | "Applicable Codes" | "Weather & Hail History" | "Other",
      "summary": "what you found, with specifics (dates, names, code editions) where available",
      "sources": [{ "title": "source name", "url": "https://..." }]
    }
  ]
}
Rules:
- Base every claim on a source you actually found; include its URL.
- If a fact cannot be verified, say so plainly in the summary rather than guessing.
- Do NOT fabricate owners, dates, or code citations.
- Cover ownership history, year built, applicable building codes for the jurisdiction, and weather/hail exposure.`;

export const SYSTEM_PROMPT = `You are a forensic property research assistant for Ward & Oakes, a firm that produces Forensic Condition Assessments. You compile a "Weather & Property History Report" for a specific address using authoritative, publicly available sources. Be precise, cite sources, and never invent facts. This report may be relied upon in an insurance or legal context, so accuracy and sourcing matter more than completeness.`;
