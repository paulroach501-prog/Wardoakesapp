import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateCustomerInput } from "@/lib/customers";

// GET /api/customers — list customers, optional ?q= search by name.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const customers = await prisma.customer.findMany({
    where: q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { companyName: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      properties: { orderBy: { createdAt: "asc" } },
    },
  });

  return NextResponse.json({ customers });
}

// POST /api/customers — create a customer plus a seeded primary property.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = validateCustomerInput(body);
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 422 });
  }

  const { property, ...customer } = result.value;
  const created = await prisma.customer.create({
    data: {
      ...customer,
      properties: {
        create: {
          label: property.label ?? "Primary property",
          street: property.street,
          city: property.city,
          state: property.state,
          zip: property.zip,
        },
      },
    },
    include: { properties: true },
  });

  return NextResponse.json({ customer: created }, { status: 201 });
}
