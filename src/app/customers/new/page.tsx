import Link from "next/link";
import { NewCustomerForm } from "@/components/NewCustomerForm";

export default function NewCustomerPage() {
  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-brand">
        ← Customers
      </Link>
      <h1 className="text-lg font-semibold text-ink">Add customer</h1>
      <p className="text-sm text-ink-soft">
        Enter contact info and the property address. This seeds a primary
        property — you can add more properties from the profile later.
      </p>
      <NewCustomerForm />
    </div>
  );
}
