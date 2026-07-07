import { headers } from "next/headers";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { gatherAssembleInput, buildFcaMarkdown } from "@/lib/assemble";

export const maxDuration = 60;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

// GET /api/properties/:id/package.zip — a self-contained job bundle:
// package.md + all inspection photos. Save it to Drive as your archive, or hand
// it to the FCA writer. (Photos are already compressed at capture.)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  const input = await gatherAssembleInput(id, origin);
  if (!input) return new Response("Property not found.", { status: 404 });

  const zip = new JSZip();
  zip.file("package.md", buildFcaMarkdown(input));

  // Pull the latest inspection's photos with their bytes.
  const inspection = input.inspection
    ? await prisma.inspectionPhoto.findMany({
        where: { inspectionId: input.inspection.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, imageUrl: true, imageData: true, tags: true },
      })
    : [];

  const photosFolder = zip.folder("photos");
  let idx = 0;
  for (const p of inspection) {
    idx += 1;
    let bytes: Uint8Array | null = null;
    if (p.imageData) bytes = new Uint8Array(p.imageData);
    else if (p.imageUrl) {
      const r = await fetch(p.imageUrl);
      if (r.ok) bytes = new Uint8Array(await r.arrayBuffer());
    }
    if (!bytes) continue;
    const tagPart = p.tags.length ? `-${slug(p.tags.join("-"))}` : "";
    photosFolder?.file(`${String(idx).padStart(3, "0")}${tagPart}.jpg`, bytes);
  }

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const filename = `${slug(input.address) || "job"}-package.zip`;

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
