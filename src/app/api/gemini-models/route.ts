import { NextResponse } from "next/server";

// GET /api/gemini-models — list the Gemini models the configured key can
// actually use for text generation. Keeps the model dropdown current without
// hardcoding IDs that Google renames over time.
export async function GET() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ models: [] });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`,
    );
    if (!r.ok) return NextResponse.json({ models: [] });
    const data = (await r.json()) as {
      models?: {
        name?: string;
        displayName?: string;
        supportedGenerationMethods?: string[];
      }[];
    };

    const models = (data.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) => ({
        id: (m.name ?? "").replace(/^models\//, ""),
        label: m.displayName || (m.name ?? "").replace(/^models\//, ""),
      }))
      .filter(
        (m) =>
          m.id &&
          (m.id.includes("flash") || m.id.includes("pro")) &&
          !m.id.includes("embedding") &&
          !m.id.includes("vision") && // legacy vision-only variants
          !m.id.includes("thinking"),
      );

    // Flash (free-tier) models first, then by id descending (newest-ish first).
    models.sort((a, b) => {
      const af = a.id.includes("flash") ? 0 : 1;
      const bf = b.id.includes("flash") ? 0 : 1;
      if (af !== bf) return af - bf;
      return b.id.localeCompare(a.id);
    });

    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] });
  }
}
