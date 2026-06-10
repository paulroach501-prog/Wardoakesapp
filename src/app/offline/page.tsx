export default function OfflinePage() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
      <h1 className="text-lg font-semibold text-ink">You&apos;re offline</h1>
      <p className="mt-2 text-sm text-ink-soft">
        This page isn&apos;t cached. Reconnect to continue — field data syncs
        when you&apos;re back online.
      </p>
    </div>
  );
}
