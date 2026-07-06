import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/photos/:id — update inspector tags / description.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { tags?: string[]; description?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  try {
    await prisma.inspectionPhoto.update({
      where: { id },
      data: {
        tags: Array.isArray(body.tags) ? body.tags : undefined,
        description: body.description ?? undefined,
      },
    });
  } catch {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/photos/:id
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.inspectionPhoto.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
