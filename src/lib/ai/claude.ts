import Anthropic from "@anthropic-ai/sdk";
import {
  AIProvider,
  PropertyResearchInput,
  ResearchResult,
  ResearchFinding,
  RESEARCH_OUTPUT_INSTRUCTIONS,
  SYSTEM_PROMPT,
} from "./types";

// Claude-backed research provider. Uses the server-side web_search tool so the
// model gathers live, citable sources, then returns structured findings.
export class ClaudeProvider implements AIProvider {
  readonly name = "claude";
  readonly label = "Claude (Anthropic)";

  get available(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async research(input: PropertyResearchInput): Promise<ResearchResult> {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

    const userPrompt = `Subject property: ${input.address}

Authoritative weather/location context already gathered (from NOAA/NWS):
${input.weatherContext}

Research this property and compile the Weather & Property History Report.
${RESEARCH_OUTPUT_INSTRUCTIONS}`;

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userPrompt },
    ];

    // The web_search tool runs a server-side loop; it can return pause_turn,
    // which we continue by re-sending the accumulated turn.
    let response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20260209", name: "web_search" }],
      messages,
    });

    let guard = 0;
    while (response.stop_reason === "pause_turn" && guard < 6) {
      messages.push({ role: "assistant", content: response.content });
      response = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        system: SYSTEM_PROMPT,
        tools: [{ type: "web_search_20260209", name: "web_search" }],
        messages,
      });
      guard += 1;
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return parseResearch(text, this.name);
  }
}

// Tolerant extraction of the JSON object from the model's final text (handles
// ```json fences or a bare object).
export function parseResearch(text: string, provider: string): ResearchResult {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("{"));

  try {
    const parsed = JSON.parse(candidate);
    const findings: ResearchFinding[] = Array.isArray(parsed.findings)
      ? parsed.findings.map((f: Record<string, unknown>) => ({
          category: String(f.category ?? "Other"),
          summary: String(f.summary ?? ""),
          sources: Array.isArray(f.sources)
            ? (f.sources as Record<string, unknown>[]).map((s) => ({
                title: String(s.title ?? s.url ?? "source"),
                url: String(s.url ?? ""),
              }))
            : [],
        }))
      : [];
    return {
      provider,
      narrative: String(parsed.narrative ?? "").trim(),
      findings,
    };
  } catch {
    // If the model didn't return clean JSON, preserve its prose so the report
    // still has content rather than failing outright.
    return {
      provider,
      narrative: text.slice(0, 1200),
      findings: [],
    };
  }
}
