import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/measurements/:id/image — serve the underlay image (Blob redirect or
// inline bytes).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const m = await prisma.measurement.findUnique({
    where: { id },
    select: { imageUrl: true, imageData: true },
  });

  if (m?.imageUrl) return NextResponse.redirect(m.imageUrl);
  if (m?.imageData) {
    return new NextResponse(new Uint8Array(m.imageData), {
      status: 200,
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
    });
  }
  return NextResponse.json({ error: "No image." }, { status: 404 });
}
