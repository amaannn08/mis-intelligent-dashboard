# TASK — MIS Intelligence Dashboard, RUN 4: the product UI

Coding agent run. Project `/home/amann/intern-weh/mis-intelligent-dashboard`.
Read `PLAN.md` §5, inspect the API from Run 3, then build the interface. **This is a design-led run** — the brief
is explicit about quality because the UI is the deliverable the user judges first.

## EXECUTION RULES
Foreground commands; `nice -n 15 ionice -c3`; kill by PID; **kill any dev server you start, by PID, before you
finish**; never print secrets; no mock data anywhere.

## DESIGN DIRECTION (non-negotiable)
Light-first, dark supported. Think "polished internal SaaS / portfolio-intelligence terminal", **not** a cluttered
enterprise template and not the CRM's branding.
- Type: one clean sans (use `next/font`), 3 sizes of heading + 2 of body; system-grade spacing scale; generous
  whitespace; thin neutral borders; soft neutral page background with white surfaces; one restrained accent for
  primary actions and one for positive/negative deltas.
- Numbers are first-class: tabular figures, right-aligned in tables, consistent compact formatting
  (`₹1.2 Cr`, `₹45.6 L`, `12.4%`, `-₹8.3 L`), explicit "not available" state instead of `0`.
- Motion: restrained (sub-200ms, opacity/translate only). No gratuitous animation.
- Every list/table/chart ships **loading (skeleton), empty, and error** states. Empty states say what to do next.
- Keyboard accessible: focus-visible rings, real `<button>`/`<a>` semantics, labelled inputs, Escape closes
  dialogs, ⌘K/ctrl+K opens the global query palette.
- Fully responsive: usable at 380px wide, no horizontal scroll, tables collapse to cards on narrow screens.

## PAGES (all real data from the API — no placeholders)
- `/login` — username + password gate (`AUTH_USERNAME` / `AUTH_PASSWORD`), labelled fields, honest error on wrong
  credentials, autofocus on the first field.
- `/` — portfolio overview: KPI strip (companies tracked, documents processed, latest reporting month, companies
  reporting this month, total latest revenue where available), a portfolio-wide revenue trend chart, recent uploads
  list, and an inline global AI query box that submits to `/api/query`.
- `/companies` — directory: search, industry filter, sort (name / latest revenue / latest period / documents /
  updated), pagination; table on desktop, cards on mobile; "Add company" dialog; row → detail page.
- `/companies/[slug]` — company workspace: header (name, industry, latest period, edit), KPI cards (net revenue,
  gross margin, EBITDA, burn, run rate — each showing value, MoM delta, period, and a "no data" state), MoM trend
  charts (metric selector + period-range selector), a metrics table with source document references and
  reported/calculated badges, an inline company-scoped AI query panel, and a recent documents list.
- `/companies/[slug]/documents` — upload dropzone (drag & drop + picker, multiple files, per-file progress and
  status), document table with status pills, processing error surfacing, download (when retained), delete with
  confirmation, and a document detail drawer showing the extracted metrics, the job log, and the source reference.
  **Processing is asynchronous**: the upload returns `202` with a document id, so the UI must poll
  `GET /api/documents/[id]` (or the list endpoint) and move each row through pending → parsing → extracting →
  embedding → processed/failed live, with a visible spinner and a surfaced failure reason. Enforce and display the
  **4.5 MB** upload ceiling (15 MB in dev) before the request is sent.
  `PLAN_AGY.md` §8 is the authoritative UI information architecture and component inventory — follow it.
- `/settings` — app info: env-derived config names (never values), metric definitions list (with aliases),
  theme toggle, and a documented note about MVP access control.
- Shared components (build once, reuse): `AppShell` (sidebar + topbar + ⌘K), `KpiCard`, `TrendChart` (Recharts,
  responsive container, tooltip with period + value, empty state), `MetricTable`, `DataTable`, `UploadDropzone`,
  `StatusPill`, `CitationList` (clickable → document detail), `QueryPanel` (streaming answer + citations + stop),
  `EmptyState`, `Skeleton`, `ConfirmDialog`, `ThemeToggle`.

## RULES
- Real data only. A metric with no row renders "Not available" with a tooltip explaining why.
- Numbers shown as `calculated` must display their derivation on hover/expand.
- No dead links, no fake buttons, no `TODO`-only handlers. If a feature is not implemented, do not render it.
- Reuse shadcn/ui primitives; do not hand-roll dialogs/dropdowns/tables that the library already provides.
- Client components only where interaction requires it; everything else stays a server component.

## VERIFY
1. `npm run typecheck`, `npm run lint`, `npm run build` → all green.
2. Start the production server, and walk every route with a headless browser over CDP at **1440×900 and 412×915**:
   capture a screenshot per route, assert **0 console errors** and no failed requests, and confirm real content
   renders (not skeletons stuck on screen). Save screenshots under `docs/screenshots/` and reference them in the
   README.
3. Exercise the real flows: log in → add a company → upload the Run 2 fixture → watch the status go to processed →
   open the company dashboard and confirm the chart + KPI cards populate from the pipeline's output → ask a
   question in the query panel and confirm a cited answer streams in → verify dark mode → verify a 380px viewport.
4. Kill the server by PID.

## COMMIT
Commit per page/component group. Do not push.

## REPORT
Routes built, component inventory, screenshots produced, the verification output, and anything unfinished with the
honest reason.
