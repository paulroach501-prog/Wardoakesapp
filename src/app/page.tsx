import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { customerDisplayName, formatAddress } from "@/lib/customers";
import { SearchBox } from "@/components/SearchBox";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim();

  const customers = await prisma.customer.findMany({
    where: query
      ? {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { companyName: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { properties: { orderBy: { createdAt: "asc" } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">Customers</h1>
        <Link
          href="/customers/new"
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white shadow-sm active:bg-brand-dark"
        >
          + Add customer
        </Link>
      </div>

      <SearchBox initialQuery={query ?? ""} />

      {customers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-ink-soft">
            {query
              ? `No customers match “${query}”.`
              : "No customers yet. Add your first one to get started."}
          </p>
          {!query && (
            <Link
              href="/customers/new"
              className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              + Add customer
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {customers.map((c) => {
            const primary = c.properties[0];
            return (
              <li key={c.id}>
                <Link
                  href={`/customers/${c.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink">
                      {customerDisplayName(c)}
                    </span>
                    {c.properties.length > 1 && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                        {c.properties.length} properties
                      </span>
                    )}
                  </div>
                  {primary && (
                    <p className="mt-1 text-sm text-ink-soft">
                      {formatAddress(primary)}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
