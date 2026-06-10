import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "Ward & Oakes — Forensic Condition Assessments",
  description:
    "Field app for capturing forensic condition assessments: customers, property history, measurements, inspections, and report deliverables.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ward & Oakes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-ink text-white">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-sm font-bold">
                W&amp;O
              </span>
              <span className="text-sm font-semibold tracking-wide">
                Ward &amp; Oakes
              </span>
            </Link>
            <Link
              href="/settings"
              className="text-[11px] uppercase tracking-widest text-slate-400 active:text-white"
            >
              Settings
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-5">{children}</main>
        <ServiceWorker />
      </body>
    </html>
  );
}
