import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { gatherAssembleInput, buildFcaMarkdown } from "@/lib/assemble";
import { AssembleClient } from "@/components/assemble/AssembleClient";

export const dynamic = "force-dynamic";

export default async function AssemblePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  const input = await gatherAssembleInput(id, origin);
  if (!input) notFound();

  const markdown = buildFcaMarkdown(input);

  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-brand">
        ← Customers
      </Link>
      <div>
        <h1 className="text-lg font-semibold text-ink">FCA Context Package</h1>
        <p className="text-sm text-ink-soft">{input.address}</p>
      </div>
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-ink-soft">
        Everything captured for this property, assembled into one package. Copy or
        download it and hand it to the multi-agent FCA writer in Claude Code — or
        generate a quick AI field summary here first.
      </p>
      <AssembleClient propertyId={id} markdown={markdown} />
    </div>
  );
}
