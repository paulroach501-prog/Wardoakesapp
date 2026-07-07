import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { gatherAssembleInput, buildFcaMarkdown } from "@/lib/assemble";
import { synthesize } from "@/lib/ai/inspection";

export const maxDuration = 60;

const FCA_SYSTEM = `You are a senior forensic roofing consultant writing a Forensic Condition Assessment (FCA) for Ward & Oakes. You are given an assembled field package: weather/property history (with sources), roof measurements, and inspection photos represented by their inspector tags and descriptions, plus the inspection chat transcript.

Write a thorough DRAFT FCA in Markdown with these sections:
1. Property & Assignment
2. Weather & Property History (summarize the relevant findings; cite the sources given)
3. Roof Description & Measurements (areas, squares, slopes, edge lengths)
4. Observed Conditions (organized by area/slope; reference the photo descriptions and any test squares)
5. Causation Analysis (tie observed damage to the weather/history; distinguish functional vs cosmetic where the evidence supports it; be measured and note uncertainty)
6. Preliminary Findings & Recommendations
7. Items to Confirm / Gaps

Rules: Ground every statement in the provided package — do NOT invent owners, dates, damage, or code citations that aren't supported. Where evidence is thin, say so explicitly. This is a draft for expert review, not a final signed report. Write in a professional, defensible tone.`;

// POST /api/properties/:id/assemble/fca — compile a draft FCA from the package
// using the configured light model (the "90%" pass; QC happens downstream).
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
    const draft = await synthesize(FCA_SYSTEM, markdown, 4000);
    return NextResponse.json({ draft });
  } catch (err) {
    if ((err as Error).message === "NO_AI_KEY") {
      return NextResponse.json(
        { error: "No AI engine configured. Add a key in Settings (Gemini's free tier works)." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Draft compile failed." }, { status: 500 });
  }
}
