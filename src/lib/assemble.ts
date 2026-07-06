import { Plane, totalMetrics, planeMetrics, EDGE_TYPES } from "@/lib/measure/geometry";
import { prisma } from "@/lib/prisma";
import { customerDisplayName, formatAddress } from "@/lib/customers";

// Assembles everything captured for a property into a single Markdown dossier —
// the "full picture" the light in-app model can synthesize and, more
// importantly, the package the heavy Claude multi-agent FCA writer ingests.
// Kept text-first (LLM- and human-readable); image handoff is by link.

export type AssembleInput = {
  origin: string;
  customerName: string;
  address: string;
  report: {
    narrative: string;
    findings: { category: string; summary: string; sources: { title: string; url: string }[] }[];
    pdfUrl: string | null;
    reportId: string;
    provider: string | null;
    model: string | null;
  } | null;
  measurement: {
    feetPerPixel: number | null;
    planes: Plane[];
  } | null;
  inspection: {
    id: string;
    photos: { id: string; tags: string[]; description: string | null; aiDescription: string | null }[];
    messages: { role: string; content: string }[];
  } | null;
};

// Load everything captured for a property into the assemble input shape.
export async function gatherAssembleInput(
  propertyId: string,
  origin: string,
): Promise<AssembleInput | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      customer: true,
      reports: {
        where: { type: "WEATHER_HISTORY", status: "READY" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      measurements: { orderBy: { createdAt: "desc" }, take: 1 },
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
  if (!property) return null;

  const rep = property.reports[0];
  const research = (rep?.findings as unknown as {
    narrative?: string;
    findings?: { category: string; summary: string; sources: { title: string; url: string }[] }[];
  } | null) ?? null;

  const meas = property.measurements[0];
  const insp = property.inspections[0];

  return {
    origin,
    customerName: customerDisplayName(property.customer),
    address: formatAddress(property),
    report: rep
      ? {
          narrative: research?.narrative ?? "",
          findings: research?.findings ?? [],
          pdfUrl: rep.pdfUrl,
          reportId: rep.id,
          provider: rep.aiProvider,
          model: rep.aiModel,
        }
      : null,
    measurement: meas
      ? { feetPerPixel: meas.feetPerPixel, planes: (meas.planes as unknown as Plane[]) ?? [] }
      : null,
    inspection: insp
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
      : null,
  };
}

function line(s = ""): string {
  return s + "\n";
}

export function buildFcaMarkdown(i: AssembleInput): string {
  let md = "";
  md += line(`# Forensic Condition Assessment — Context Package`);
  md += line();
  md += line(`**Property:** ${i.address}`);
  md += line(`**Customer:** ${i.customerName}`);
  md += line();

  // --- Weather & Property History ---
  md += line(`## Weather & Property History`);
  if (i.report) {
    if (i.report.narrative) md += line(i.report.narrative) + line();
    for (const f of i.report.findings) {
      md += line(`### ${f.category}`);
      md += line(f.summary);
      for (const s of f.sources) md += line(`- Source: ${s.title} — ${s.url}`);
      md += line();
    }
    if (i.report.pdfUrl) md += line(`Branded PDF: ${i.report.pdfUrl}`);
    else md += line(`Branded PDF: ${i.origin}/api/reports/${i.report.reportId}/pdf`);
    md += line();
  } else {
    md += line(`_No history report generated yet._`) + line();
  }

  // --- Measurements ---
  md += line(`## Roof Measurements`);
  if (i.measurement?.feetPerPixel && i.measurement.planes.length) {
    const fpp = i.measurement.feetPerPixel;
    const t = totalMetrics(i.measurement.planes, fpp);
    md += line(`**Totals:** ${t.slopedAreaSqFt.toFixed(0)} sq ft sloped · ${t.squares.toFixed(1)} squares · ${t.planAreaSqFt.toFixed(0)} sq ft plan`);
    md += line();
    md += line(`Edge lengths (linear feet):`);
    for (const et of EDGE_TYPES) {
      if (t.edgeLengthsByType[et] > 0.5) md += line(`- ${et}: ${t.edgeLengthsByType[et].toFixed(0)} ft`);
    }
    md += line();
    md += line(`Per plane:`);
    i.measurement.planes.forEach((pl, idx) => {
      const m = planeMetrics(pl, fpp);
      md += line(`- ${pl.name || `Plane ${idx + 1}`}: ${m.slopedAreaSqFt.toFixed(0)} sq ft, pitch ${pl.pitch}:12`);
    });
    md += line();
  } else {
    md += line(`_No calibrated measurement yet._`) + line();
  }

  // --- Inspection ---
  md += line(`## Inspection`);
  if (i.inspection && i.inspection.photos.length) {
    i.inspection.photos.forEach((p, idx) => {
      const tags = p.tags.length ? ` [${p.tags.join(", ")}]` : "";
      md += line(`### Photo ${idx + 1}${tags}`);
      if (p.description) md += line(`Inspector: ${p.description}`);
      if (p.aiDescription) md += line(`AI: ${p.aiDescription}`);
      md += line(`Image: ${i.origin}/api/photos/${p.id}/image`);
      md += line();
    });
  } else {
    md += line(`_No inspection photos yet._`) + line();
  }

  // --- Chat transcript ---
  if (i.inspection && i.inspection.messages.length) {
    md += line(`## Inspection Chat Transcript`);
    for (const m of i.inspection.messages) {
      md += line(`**${m.role === "assistant" ? "Bot" : "Inspector"}:** ${m.content}`);
    }
    md += line();
  }

  return md;
}
