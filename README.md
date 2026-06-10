# Ward & Oakes — FCA Field App

A mobile-first PWA for capturing **Forensic Condition Assessments** in the
field, from first customer contact through to the final FCA and Cost-to-Cure
deliverables.

## The vision (pipeline)

Everything attaches to a **Customer → Property**:

1. **CRM** — customers with contact info + address. _(This slice ✅)_
2. **Weather & Property History Report** — NOAA weather/hail data + public
   records (ownership, build date, applicable codes), compiled by a Claude
   agent into a branded PDF.
3. **Measure tool** — Google Maps / Solar API or upload-and-scale → an
   architecturally-snapped roof/siding plan.
4. **Inspection capture** — photos, tagging (hail, general condition), voice
   notes, and a review bot that organizes photos and writes descriptions.
5. **Annotated roof plan** — markups correlated to photos (e.g. test squares).
6. **FCA writer** — a multi-agent handoff that ingests the history report,
   weather, photos + descriptions, measurements, annotated plan, and inspection
   chat transcripts to produce the FCA.
7. **Cost-to-Cure** — a line-item database; measurements auto-build a macro; a
   bot assists with out-of-scope items.

## Current status

The **CRM foundation** is built and runnable:

- Add a customer (contact info + address). The address seeds a primary
  property; a customer can hold multiple properties.
- Customer list with debounced search; customer profile page.
- Each property surfaces the pipeline actions (history / measure / inspect) as
  stubs, ready to become their own slices.
- Installable PWA (manifest + service worker, mobile-first UI).

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Prisma** ORM — SQLite for local dev, swappable to Postgres for production

## Run locally

```bash
npm install
npm run db:push   # creates the SQLite dev database + generates the client
npm run dev       # http://localhost:3000
```

## Notes

- Local data lives in `prisma/dev.db` (git-ignored). For production, point
  `DATABASE_URL` at Postgres and change the datasource provider in
  `prisma/schema.prisma`.
