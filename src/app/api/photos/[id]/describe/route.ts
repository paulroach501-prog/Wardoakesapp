import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { describePhoto } from "@/lib/ai/inspection";

export const maxDuration = 60;

// POST /api/photos/:id/describe — AI-write a description from the image + tags.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const photo = await prisma.inspectionPhoto.findUnique({ where: { id } });
  if (!photo) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  // Get the image bytes from inline storage or the hosted URL.
  let bytes: Uint8Array | null = null;
  if (photo.imageData) {
    bytes = new Uint8Array(photo.imageData);
  } else if (photo.imageUrl) {
    const res = await fetch(photo.imageUrl);
    if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
  }
  if (!bytes) {
    return NextResponse.json({ error: "Image unavailable." }, { status: 404 });
  }

  const base64 = Buffer.from(bytes).toString("base64");
  try {
    const aiDescription = await describePhoto(base64, "image/jpeg", photo.tags);
    await prisma.inspectionPhoto.update({ where: { id }, data: { aiDescription } });
    return NextResponse.json({ aiDescription });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "NO_AI_KEY") {
      return NextResponse.json(
        { error: "No AI engine configured. Add an API key in Settings." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "AI description failed." }, { status: 500 });
  }
}
