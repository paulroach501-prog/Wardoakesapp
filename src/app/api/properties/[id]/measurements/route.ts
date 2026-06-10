import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";

export const maxDuration = 60;

// POST /api/properties/:id/measurements — create a measurement from an uploaded
// underlay image (multipart form: file, kind, width, height).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "An image file is required." }, { status: 400 });
  }

  const kind = (form.get("kind") as string) || "ROOF";
  const width = Number(form.get("width")) || null;
  const height = Number(form.get("height")) || null;

  const bytes = new Uint8Array(await file.arrayBuffer());

  const measurement = await prisma.measurement.create({
    data: { propertyId: id, kind, imageWidth: width, imageHeight: height },
  });

  const url = await uploadFile(
    `measurements/${measurement.id}/underlay`,
    bytes,
    file.type || "image/jpeg",
  );

  const saved = await prisma.measurement.update({
    where: { id: measurement.id },
    data: { imageUrl: url, imageData: url ? null : Buffer.from(bytes) },
    select: { id: true },
  });

  return NextResponse.json({ id: saved.id }, { status: 201 });
}
