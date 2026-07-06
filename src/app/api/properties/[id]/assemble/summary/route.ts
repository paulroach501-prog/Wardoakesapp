import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { gatherAssembleInput, buildFcaMarkdown } from "@/lib/assemble";
import { synthesize } from "@/lib/ai/inspection";

export const maxDuration = 60;

const SYSTEM =
  "You are a forensic roofing consultant preparing to write a Forensic Condition Assessment. Given the assembled field package (weather/property history, roof measurements, and inspection photos/notes/transcript), write a concise preliminary field synthesis: the likely condition story, notable findings, apparent causation direction, and what's still missing or should be confirmed. Be specific and grounded in the provided data; do not invent facts. This is a working summary, not the final report.";

// POST /api/properties/:id/assemble/summary — light-model synthesis of the
// assembled package.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  const input = await gatherAssembleInput(id, origin);
  if (!input) return NextResponse.json({ error: "Property not found." }, { status: 404 });

  const markdown = buildFcaMarkdown(input);
  try {
    const summary = await synthesize(SYSTEM, markdown);
    return NextResponse.json({ summary });
  } catch (err) {
    if ((err as Error).message === "NO_AI_KEY") {
      return NextResponse.json(
        { error: "No AI engine configured. Add a key in Settings (Gemini's free tier works)." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Summary failed." }, { status: 500 });
  }
}
