import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT /api/measurements/:id — save calibration scale + drawn planes.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { feetPerPixel?: number | null; planes?: unknown; label?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    await prisma.measurement.update({
      where: { id },
      data: {
        feetPerPixel: body.feetPerPixel ?? undefined,
        planes:
          body.planes !== undefined
            ? JSON.parse(JSON.stringify(body.planes))
            : undefined,
        label: body.label ?? undefined,
      },
    });
  } catch {
    return NextResponse.json({ error: "Measurement not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/measurements/:id
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.measurement.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
