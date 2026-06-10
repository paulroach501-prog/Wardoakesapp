import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { ResearchResult } from "@/lib/ai/types";

export type ReportPdfInput = {
  customerName: string;
  address: string;
  generatedAt: Date;
  aiProvider: string | null;
  weatherSummary: string;
  research: ResearchResult | null;
};

const BRAND = rgb(0.11, 0.31, 0.85); // matches the app's --color-brand
const INK = rgb(0.06, 0.09, 0.16);
const SOFT = rgb(0.2, 0.25, 0.33);
const MARGIN = 56;

// Renders the branded Weather & Property History Report as a PDF and returns
// the bytes. Layout is intentionally simple and robust (pdf-lib, no HTML).
export async function renderReportPdf(input: ReportPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage();
  const { width, height } = page.getSize();
  let y = height - MARGIN;

  const ctx = { doc, page, font, bold, width, y };

  // Header band
  ctx.page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: BRAND });
  ctx.page.drawText("WARD & OAKES", {
    x: MARGIN, y: height - 48, size: 20, font: bold, color: rgb(1, 1, 1),
  });
  ctx.page.drawText("Weather & Property History Report", {
    x: MARGIN, y: height - 70, size: 12, font, color: rgb(0.9, 0.93, 1),
  });
  ctx.y = height - 120;

  ctx.y = line(ctx, `Subject Property: ${input.address}`, bold, 13, INK);
  ctx.y = line(ctx, `Prepared for: ${input.customerName}`, font, 11, SOFT);
  ctx.y = line(
    ctx,
    `Generated: ${input.generatedAt.toLocaleString()}${
      input.aiProvider ? `  ·  Research engine: ${input.aiProvider}` : ""
    }`,
    font, 10, SOFT,
  );
  ctx.y -= 8;

  ctx.y = heading(ctx, "Location & Weather Context");
  ctx.y = paragraph(ctx, input.weatherSummary);

  if (input.research?.narrative) {
    ctx.y = heading(ctx, "Executive Summary");
    ctx.y = paragraph(ctx, input.research.narrative);
  }

  for (const f of input.research?.findings ?? []) {
    ctx.y = heading(ctx, f.category);
    ctx.y = paragraph(ctx, f.summary);
    if (f.sources.length) {
      ctx.y = line(ctx, "Sources:", bold, 9, SOFT);
      for (const s of f.sources) {
        ctx.y = paragraph(ctx, `• ${s.title} — ${s.url}`, 9, BRAND);
      }
    }
    ctx.y -= 4;
  }

  if (!input.research) {
    ctx.y = paragraph(
      ctx,
      "No AI research engine was configured for this run, so this report contains the authoritative location/weather context only. Add an Anthropic or Gemini API key to include ownership history, year built, applicable codes, and hail-event research.",
      10, SOFT,
    );
  }

  // Footer on every page
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(
      `Ward & Oakes — Forensic Condition Assessments   ·   Page ${i + 1} of ${pages.length}`,
      { x: MARGIN, y: 28, size: 8, font, color: SOFT },
    );
  });

  return doc.save();
}

// --- layout helpers (mutable cursor, auto page breaks) ---

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  width: number;
  y: number;
};

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < 50) {
    ctx.page = ctx.doc.addPage();
    ctx.y = ctx.page.getSize().height - MARGIN;
  }
}

function line(ctx: Ctx, text: string, font: PDFFont, size: number, color = INK): number {
  ensureSpace(ctx, size + 6);
  ctx.page.drawText(text, { x: MARGIN, y: ctx.y, size, font, color });
  return ctx.y - (size + 6);
}

function heading(ctx: Ctx, text: string): number {
  ctx.y -= 8;
  ensureSpace(ctx, 22);
  ctx.page.drawText(text, { x: MARGIN, y: ctx.y, size: 13, font: ctx.bold, color: BRAND });
  return ctx.y - 18;
}

function paragraph(ctx: Ctx, text: string, size = 10.5, color = INK): number {
  const maxWidth = ctx.width - MARGIN * 2;
  const words = text.split(/\s+/);
  let lineText = "";
  for (const word of words) {
    const test = lineText ? `${lineText} ${word}` : word;
    if (ctx.font.widthOfTextAtSize(test, size) > maxWidth) {
      ctx.y = line(ctx, lineText, ctx.font, size, color);
      lineText = word;
    } else {
      lineText = test;
    }
  }
  if (lineText) ctx.y = line(ctx, lineText, ctx.font, size, color);
  return ctx.y - 2;
}
