import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/reports/:id/pdf — serve the report PDF. Redirects to the hosted Blob
// URL when present, otherwise streams the inline bytes stored in the database.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const report = await prisma.report.findUnique({
    where: { id },
    select: { pdfUrl: true, pdfData: true, status: true },
  });

  if (!report || report.status !== "READY") {
    return NextResponse.json({ error: "Report not ready." }, { status: 404 });
  }

  if (report.pdfUrl) {
    return NextResponse.redirect(report.pdfUrl);
  }

  if (report.pdfData) {
    const body = new Uint8Array(report.pdfData);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="weather-history-report.pdf"`,
      },
    });
  }

  return NextResponse.json({ error: "No PDF available." }, { status: 404 });
}
