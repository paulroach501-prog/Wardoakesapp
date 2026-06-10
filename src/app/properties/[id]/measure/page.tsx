import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatAddress } from "@/lib/customers";
import { MeasureClient, type MeasurementData } from "@/components/measure/MeasureClient";
import type { Plane } from "@/lib/measure/geometry";

export const dynamic = "force-dynamic";

export default async function MeasurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      customer: true,
      measurements: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!property) notFound();

  const latest = property.measurements[0];
  const measurement: MeasurementData | null =
    latest && latest.imageWidth && latest.imageHeight
      ? {
          id: latest.id,
          imageWidth: latest.imageWidth,
          imageHeight: latest.imageHeight,
          feetPerPixel: latest.feetPerPixel,
          planes: (latest.planes as unknown as Plane[]) ?? [],
        }
      : null;

  return (
    <div className="space-y-4">
      <Link href={`/customers/${property.customerId}`} className="text-sm text-brand">
        ← Back to customer
      </Link>
      <div>
        <h1 className="text-lg font-semibold text-ink">Measure</h1>
        <p className="text-sm text-ink-soft">{formatAddress(property)}</p>
      </div>
      <MeasureClient propertyId={property.id} measurement={measurement} />
    </div>
  );
}
