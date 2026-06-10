import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/customers/:id — single customer with properties.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { properties: { orderBy: { createdAt: "asc" } } },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }
  return NextResponse.json({ customer });
}

// DELETE /api/customers/:id — remove a customer (cascades to properties).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.customer.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
