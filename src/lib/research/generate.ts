import { prisma } from "@/lib/prisma";
import { formatAddress, customerDisplayName } from "@/lib/customers";
import { getWeatherContext } from "@/lib/research/weather";
import { selectProvider, ResearchResult } from "@/lib/ai";
import { renderReportPdf } from "@/lib/pdf/report";
import { uploadPdf } from "@/lib/storage";

// Runs the Weather & Property History Report pipeline for an existing Report
// row: gather NOAA/NWS context -> AI research (if an engine is configured) ->
// render branded PDF -> store. Updates the row's status as it goes.
//
// Designed to be resilient: if the AI step is unavailable or fails, it still
// produces a NOAA-backed PDF rather than failing the whole report.
export async function generateWeatherHistoryReport(
  reportId: string,
  providerName?: string,
): Promise<void> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { property: { include: { customer: true } } },
  });
  if (!report) throw new Error("Report not found.");

  const property = report.property;
  const address = formatAddress(property);
  const customerName = customerDisplayName(property.customer);

  try {
    const weather = await getWeatherContext(address);

    let research: ResearchResult | null = null;
    let usedProvider: string | null = null;
    const provider = selectProvider(providerName);
    if (provider && provider.available) {
      try {
        research = await provider.research({
          address,
          weatherContext: weather.summary,
        });
        usedProvider = provider.name;
      } catch (err) {
        // AI failed — keep going with the NOAA-only report.
        console.error("AI research failed:", err);
      }
    }

    const bytes = await renderReportPdf({
      customerName,
      address,
      generatedAt: new Date(),
      aiProvider: usedProvider,
      weatherSummary: weather.summary,
      research,
    });

    const filename = `reports/${report.id}/weather-history-${Date.now()}.pdf`;
    const url = await uploadPdf(filename, bytes);

    await prisma.report.update({
      where: { id: report.id },
      data: {
        status: "READY",
        aiProvider: usedProvider,
        findings: research ? JSON.parse(JSON.stringify(research)) : undefined,
        pdfUrl: url,
        // Fall back to inline bytes when Blob isn't configured yet.
        pdfData: url ? null : Buffer.from(bytes),
        error: null,
      },
    });
  } catch (err) {
    await prisma.report.update({
      where: { id: report.id },
      data: { status: "FAILED", error: (err as Error).message },
    });
    throw err;
  }
}
