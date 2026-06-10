import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  customerDisplayName,
  formatAddress,
} from "@/lib/customers";
import { DeleteCustomerButton } from "@/components/DeleteCustomerButton";
import { PropertyActions } from "@/components/PropertyActions";
import { listProviders } from "@/lib/ai";

export const dynamic = "force-dynamic";

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      properties: {
        orderBy: { createdAt: "asc" },
        include: {
          reports: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              type: true,
              status: true,
              aiProvider: true,
              aiModel: true,
              error: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  const providers = listProviders();

  if (!customer) notFound();

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-brand">
        ← Customers
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-ink">
          {customerDisplayName(customer)}
        </h1>
        <dl className="mt-2 space-y-1 text-sm text-ink-soft">
          {customer.email && (
            <div>
              <dt className="inline font-medium text-ink">Email: </dt>
              <a href={`mailto:${customer.email}`} className="text-brand">
                {customer.email}
              </a>
            </div>
          )}
          {customer.phone && (
            <div>
              <dt className="inline font-medium text-ink">Phone: </dt>
              <a href={`tel:${customer.phone}`} className="text-brand">
                {customer.phone}
              </a>
            </div>
          )}
          {customer.notes && (
            <p className="pt-1 italic text-ink-soft">{customer.notes}</p>
          )}
        </dl>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
          Properties
        </h2>
        {customer.properties.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            {p.label && (
              <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                {p.label}
              </p>
            )}
            <p className="font-medium text-ink">{formatAddress(p)}</p>
            <PropertyActions
              propertyId={p.id}
              providers={providers}
              reports={p.reports.map((r) => ({
                ...r,
                createdAt: r.createdAt.toISOString(),
              }))}
            />
          </div>
        ))}
      </section>

      <div className="pt-2">
        <DeleteCustomerButton customerId={customer.id} />
      </div>
    </div>
  );
}
