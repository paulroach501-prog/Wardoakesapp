import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";

export const maxDuration = 60;

// POST /api/inspections/:id/photos — upload one or more photos (multipart,
// field "files"). Stores each and returns the created photo ids.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const inspection = await prisma.inspection.findUnique({ where: { id } });
  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
  }

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided." }, { status: 400 });
  }

  const created: string[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const photo = await prisma.inspectionPhoto.create({
      data: { inspectionId: id },
    });
    const url = await uploadFile(
      `inspections/${id}/photos/${photo.id}`,
      bytes,
      file.type || "image/jpeg",
    );
    await prisma.inspectionPhoto.update({
      where: { id: photo.id },
      data: { imageUrl: url, imageData: url ? null : Buffer.from(bytes) },
    });
    created.push(photo.id);
  }

  return NextResponse.json({ ids: created }, { status: 201 });
}
