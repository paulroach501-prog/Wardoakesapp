import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/properties/:id/inspections — start a new inspection.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }
  const inspection = await prisma.inspection.create({
    data: { propertyId: id, status: "OPEN" },
  });
  return NextResponse.json({ id: inspection.id }, { status: 201 });
}
