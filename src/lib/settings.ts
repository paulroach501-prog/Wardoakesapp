import { prisma } from "@/lib/prisma";

// Thin wrapper over the Setting key/value table for app configuration.
// Currently holds the default AI provider + model for the report task; the
// same pattern extends to future tasks (inspection bot, FCA writer, etc.).

export type ReportAIConfig = {
  provider: string | null;
  model: string | null;
};

export async function getReportAIConfig(): Promise<ReportAIConfig> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ["report.provider", "report.model"] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    provider: map.get("report.provider") ?? null,
    model: map.get("report.model") ?? null,
  };
}

export async function setReportAIConfig(config: ReportAIConfig): Promise<void> {
  const entries: [string, string | null][] = [
    ["report.provider", config.provider],
    ["report.model", config.model],
  ];
  await Promise.all(
    entries.map(([key, value]) =>
      value
        ? prisma.setting.upsert({
            where: { key },
            create: { key, value },
            update: { value },
          })
        : prisma.setting.deleteMany({ where: { key } }),
    ),
  );
}
