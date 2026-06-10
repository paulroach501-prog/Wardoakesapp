import Link from "next/link";
import { listProviders } from "@/lib/ai";
import { getReportAIConfig } from "@/lib/settings";
import { SettingsForm } from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const providers = listProviders();
  const config = await getReportAIConfig();

  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-brand">
        ← Customers
      </Link>
      <h1 className="text-lg font-semibold text-ink">Settings</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
          Report AI engine
        </h2>
        <p className="text-sm text-ink-soft">
          Default engine + model for the Weather &amp; Property History Report.
          You can still override this per report. Engines without an API key set
          are shown but disabled.
        </p>
        <SettingsForm
          providers={providers}
          initialProvider={config.provider}
          initialModel={config.model}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-ink-soft">
        <p className="font-medium text-ink">Engine availability</p>
        <ul className="mt-2 space-y-1">
          {providers.map((p) => (
            <li key={p.name} className="flex items-center justify-between">
              <span>{p.label}</span>
              <span
                className={
                  p.available ? "text-green-700" : "text-amber-700"
                }
              >
                {p.available ? "key set ✓" : "no key"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs">
          Add <code>ANTHROPIC_API_KEY</code> and/or <code>GEMINI_API_KEY</code>{" "}
          in your hosting environment to enable an engine.
        </p>
      </section>
    </div>
  );
}
