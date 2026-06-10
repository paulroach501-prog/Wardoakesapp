import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateWeatherHistoryReport } from "@/lib/research/generate";

// AI web research can take a while; give the function headroom.
export const maxDuration = 60;

// POST /api/properties/:id/reports — create and generate a Weather & Property
// History Report for the property. Returns once generation finishes (READY or
// FAILED), so the client can just refresh.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  let providerName: string | undefined;
  try {
    const body = (await request.json()) as { provider?: string };
    providerName = body?.provider;
  } catch {
    // No body is fine — use the default provider.
  }

  const report = await prisma.report.create({
    data: { propertyId: id, type: "WEATHER_HISTORY", status: "GENERATING" },
  });

  try {
    await generateWeatherHistoryReport(report.id, providerName);
  } catch {
    // Status is already persisted as FAILED by the orchestrator.
  }

  const finished = await prisma.report.findUnique({
    where: { id: report.id },
    select: { id: true, status: true, aiProvider: true, error: true },
  });

  return NextResponse.json({ report: finished }, { status: 201 });
}
