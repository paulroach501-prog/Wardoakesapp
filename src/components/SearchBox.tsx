"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Debounced search that updates the ?q= query param so the server re-renders
// the filtered customer list.
export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value.trim());
      const qs = params.toString();
      router.replace(qs ? `/?${qs}` : "/");
    }, 250);
    return () => clearTimeout(handle);
  }, [value, router]);

  return (
    <input
      type="search"
      inputMode="search"
      placeholder="Search by name or company…"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
    />
  );
}
