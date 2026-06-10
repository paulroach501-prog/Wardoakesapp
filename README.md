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
- **Prisma** ORM on **Postgres** (Vercel Postgres / Neon)

## Deploying (Vercel)

1. Import the repo on [vercel.com](https://vercel.com) and deploy.
2. In the project, open **Storage → Create Database → Postgres** and connect it
   to the project. This injects `POSTGRES_PRISMA_URL` and
   `POSTGRES_URL_NON_POOLING` automatically.
3. **Redeploy.** The build runs `prisma db push`, which creates the tables from
   `prisma/schema.prisma` — no manual migration step needed at this stage.

## Run locally

```bash
npm install
# Put your Postgres connection strings in .env (e.g. from a free Neon project),
# or run `vercel env pull` to fetch them from your Vercel project.
npm run db:push   # creates the tables + generates the client
npm run dev       # http://localhost:3000
```
