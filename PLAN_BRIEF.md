# TASK (PLAN MODE — do not edit any code) — derive the full implementation plan from the PRD

You are the planning agent. **Produce a complete, senior-level implementation plan** for this project and write it to
`PLAN_AGY.md` in this folder. **Do not modify code, do not run migrations, do not commit.** Plan mode only.

## Read these first, in this order
1. `PRD.md` — the product owner's authoritative requirements (this is the input you must satisfy).
2. `PLAN.md` — the plan the engineering lead already committed to, and which is **already being implemented**
   (npm-workspaces monorepo, Drizzle, pgvector, AI SDK for chat only, no Mastra, username+password MVP auth).
3. Whatever already exists on disk: `apps/web/`, `packages/db/` (Drizzle schema + a generated migration),
   `packages/core/` (stub), the env files (read key **names** only — never print values, never commit them).

## What the plan must contain
1. **System architecture** — the monorepo layout, each package's responsibility, the request/data flow for
   upload→process→query, and where the boundaries are. Call out anything in `PLAN.md` you would change, with reasons.
2. **Database design** — every table, column, type, constraint, FK, enum and index, including the pgvector index
   and its operator class; the migration strategy; how a **new metric can be added without a schema change**; and
   how the existing migration must evolve (a fresh Neon database must work with one documented command).
3. **Extraction & normalisation strategy** — the concrete algorithm for messy MIS files: how you locate the metric
   table in an arbitrary sheet, how the label→canonical-metric alias layer works, unit and scale detection
   (₹/lakh/crore/million, thousands separators, parenthesised negatives), period detection and canonicalisation,
   how you store provenance/confidence, and the deterministic-first / LLM-second split. Include the failure modes
   and what happens when a metric genuinely cannot be found (it must be absent, never invented).
4. **RAG design** — chunking parameters with justification, embedding model + output dimensions (note: the model's
   native output is 3072 while the column is `vector(1536)`), retrieval (k, similarity floor, optional company
   filter, metadata filters), the exact prompt/answer contract (answer-first, cite `[n]`, reported vs calculated
   labelling, refusal when retrieval is empty), and how citations are carried to the UI.
5. **API surface** — a route table: method, path, auth, request shape (zod-level), response shape, error codes.
6. **File-storage decision under Vercel's read-only filesystem** — evaluate the options (store bytes in Postgres,
   external blob storage, text-only retention) and recommend one for this MVP with the trade-off stated, plus the
   upgrade path.
7. **Auth & security posture** — the MVP approach, what it does and does not protect against, input validation,
   upload validation, secret handling, and the things you would do before calling it production-grade.
8. **UI information architecture** — page by page: purpose, data shown, interactions, empty/loading/error states,
   and a **component inventory** with the props they need. Include the responsive behaviour and accessibility notes.
9. **Processing under Vercel limits** — the concrete strategy for large files and long pipelines (what runs
   synchronously, what is capped, what moves to a queue later, and where the seam is in the code).
10. **Milestones** — an ordered, independently verifiable list (each with the exact command or check that proves it).
11. **Risks, unknowns and ambiguities** — every place the PRD is silent or self-contradictory, with the decision you
    recommend and the reason. Be specific; this list is how the human knows what you assumed.
12. **Out of scope for the MVP** — explicit.

## Quality bar
- Concrete, not generic: name files, tables, columns, functions and packages.
- Where you disagree with `PLAN.md`, say so plainly and argue it — the human wants the strongest plan, not agreement.
- Do not restate the PRD back; interpret it into engineering decisions.
- Write `PLAN_AGY.md` and, in your final message, summarise the decisions that differ from `PLAN.md` and the
  questions only a human can answer.
