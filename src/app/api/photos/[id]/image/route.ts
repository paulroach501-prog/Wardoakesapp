import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/photos/:id/image — serve the photo (Blob redirect or inline bytes).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const photo = await prisma.inspectionPhoto.findUnique({
    where: { id },
    select: { imageUrl: true, imageData: true },
  });
  if (photo?.imageUrl) return NextResponse.redirect(photo.imageUrl);
  if (photo?.imageData) {
    return new NextResponse(new Uint8Array(photo.imageData), {
      status: 200,
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
    });
  }
  return NextResponse.json({ error: "No image." }, { status: 404 });
}
