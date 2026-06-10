"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteCustomerButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm("Delete this customer and all their properties?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        alert("Could not delete customer.");
        setBusy(false);
      }
    } catch {
      alert("Network error.");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      className="text-sm font-medium text-red-600 active:text-red-700 disabled:opacity-60"
    >
      {busy ? "Deleting…" : "Delete customer"}
    </button>
  );
}
