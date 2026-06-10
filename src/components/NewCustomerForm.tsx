"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Errors = Record<string, string>;

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-ink-soft";

function Field({
  label,
  name,
  error,
  ...props
}: {
  label: string;
  name: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <input id={name} name={name} className={inputClass} {...props} />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function NewCustomerForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});

    const fd = new FormData(e.currentTarget);
    const payload = {
      firstName: fd.get("firstName"),
      lastName: fd.get("lastName"),
      companyName: fd.get("companyName"),
      email: fd.get("email"),
      phone: fd.get("phone"),
      notes: fd.get("notes"),
      property: {
        label: fd.get("label"),
        street: fd.get("street"),
        city: fd.get("city"),
        state: fd.get("state"),
        zip: fd.get("zip"),
      },
    };

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 201) {
        const { customer } = await res.json();
        router.push(`/customers/${customer.id}`);
        return;
      }
      if (res.status === 422) {
        const { errors } = await res.json();
        setErrors(errors ?? {});
      } else {
        setErrors({ _form: "Something went wrong. Please try again." });
      }
    } catch {
      setErrors({ _form: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-ink">Contact</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" name="firstName" error={errors.firstName} autoComplete="given-name" />
          <Field label="Last name" name="lastName" error={errors.lastName} autoComplete="family-name" />
        </div>
        <Field label="Company (optional)" name="companyName" autoComplete="organization" />
        <Field label="Email (optional)" name="email" type="email" inputMode="email" error={errors.email} autoComplete="email" />
        <Field label="Phone (optional)" name="phone" type="tel" inputMode="tel" autoComplete="tel" />
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-ink">Property address</legend>
        <Field label="Label (optional)" name="label" placeholder="Primary property" />
        <Field label="Street" name="street" error={errors["property.street"]} autoComplete="address-line1" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" name="city" error={errors["property.city"]} autoComplete="address-level2" />
          <Field label="State" name="state" error={errors["property.state"]} autoComplete="address-level1" />
        </div>
        <Field label="ZIP" name="zip" inputMode="numeric" error={errors["property.zip"]} autoComplete="postal-code" />
      </fieldset>

      <div className="space-y-1">
        <label htmlFor="notes" className={labelClass}>
          Notes (optional)
        </label>
        <textarea id="notes" name="notes" rows={3} className={inputClass} />
      </div>

      {errors._form && <p className="text-sm text-red-600">{errors._form}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white shadow-sm active:bg-brand-dark disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Save customer"}
      </button>
    </form>
  );
}
