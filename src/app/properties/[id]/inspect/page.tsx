import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatAddress } from "@/lib/customers";
import { InspectionClient } from "@/components/inspect/InspectionClient";

export const dynamic = "force-dynamic";

export default async function InspectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      customer: true,
      inspections: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          photos: { orderBy: { createdAt: "asc" } },
          messages: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!property) notFound();

  const insp = property.inspections[0] ?? null;

  return (
    <div className="space-y-4">
      <Link href={`/customers/${property.customerId}`} className="text-sm text-brand">
        ← Back to customer
      </Link>
      <div>
        <h1 className="text-lg font-semibold text-ink">Inspection</h1>
        <p className="text-sm text-ink-soft">{formatAddress(property)}</p>
      </div>
      <InspectionClient
        propertyId={property.id}
        inspection={
          insp
            ? {
                id: insp.id,
                photos: insp.photos.map((p) => ({
                  id: p.id,
                  tags: p.tags,
                  description: p.description,
                  aiDescription: p.aiDescription,
                })),
                messages: insp.messages.map((m) => ({ role: m.role, content: m.content })),
              }
            : null
        }
      />
    </div>
  );
}
