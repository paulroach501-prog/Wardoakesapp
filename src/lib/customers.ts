// Shared types and validation for customer/property input, used by both the
// API routes and the client forms so the contract stays in one place.

export type PropertyInput = {
  label?: string;
  street: string;
  city: string;
  state: string;
  zip: string;
};

export type CustomerInput = {
  firstName: string;
  lastName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  notes?: string;
  // The address entered on the form seeds a primary Property.
  property: PropertyInput;
};

export type ValidationResult =
  | { ok: true; value: CustomerInput }
  | { ok: false; errors: Record<string, string> };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function optional(v: unknown): string | undefined {
  const s = str(v);
  return s.length ? s : undefined;
}

export function validateCustomerInput(body: unknown): ValidationResult {
  const errors: Record<string, string> = {};
  const data = (body ?? {}) as Record<string, unknown>;
  const prop = (data.property ?? {}) as Record<string, unknown>;

  const firstName = str(data.firstName);
  const lastName = str(data.lastName);
  if (!firstName) errors.firstName = "First name is required.";
  if (!lastName) errors.lastName = "Last name is required.";

  const street = str(prop.street);
  const city = str(prop.city);
  const state = str(prop.state);
  const zip = str(prop.zip);
  if (!street) errors["property.street"] = "Street is required.";
  if (!city) errors["property.city"] = "City is required.";
  if (!state) errors["property.state"] = "State is required.";
  if (!zip) errors["property.zip"] = "ZIP is required.";

  const email = optional(data.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      firstName,
      lastName,
      companyName: optional(data.companyName),
      email,
      phone: optional(data.phone),
      notes: optional(data.notes),
      property: {
        label: optional(prop.label),
        street,
        city,
        state,
        zip,
      },
    },
  };
}

export function customerDisplayName(c: {
  firstName: string;
  lastName: string;
  companyName?: string | null;
}): string {
  const name = `${c.firstName} ${c.lastName}`.trim();
  return c.companyName ? `${name} · ${c.companyName}` : name;
}

export function formatAddress(p: {
  street: string;
  city: string;
  state: string;
  zip: string;
}): string {
  return `${p.street}, ${p.city}, ${p.state} ${p.zip}`;
}
