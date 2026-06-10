import { NextResponse } from "next/server";
import { getReportAIConfig, setReportAIConfig } from "@/lib/settings";

// GET /api/settings — current saved AI defaults.
export async function GET() {
  const config = await getReportAIConfig();
  return NextResponse.json({ report: config });
}

// POST /api/settings — save default AI provider + model for the report task.
export async function POST(request: Request) {
  let body: { provider?: string | null; model?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  await setReportAIConfig({
    provider: body.provider?.trim() || null,
    model: body.model?.trim() || null,
  });

  return NextResponse.json({ ok: true });
}
