# PLAN_DASH.md — ARCHITECT REVIEW (approved with binding additions)

Reviewed by the engineering lead. The plan is approved as written — the aggregation decision (ratio of sums, with the
worked counter-example) is exactly right, and the URL-as-state + single-CTA-query approach is what I would pick.
Where this file and the plan disagree, **this file wins**.

## Approvals worth recording
1. **Ratio of sums, never the average of percentages** — approved, and the counter-example must survive into the code
   comments and the test names so nobody "simplifies" it later.
2. **Zero/missing revenue ⇒ excluded from that month's ratio** — approved (no divide-by-zero, no distortion).
3. **URL search params parsed server-side** — approved. Unknown slugs are ignored, duplicates deduped, an empty value
   means "all", and the parsed set is validated against real company slugs.
4. **Single batched query, zero N+1** — approved; the filter must not introduce a per-company query.
5. **Filter UI as a low-footprint popover** with All / None / With-MIS-only presets — approved; it must be
   keyboard-operable, announce its state (`aria-*`), and not disturb the KPI row's rhythm.

## Binding additions
6. **Sign convention, pinned.** EBITDA margin is positive when profitable, negative when loss-making. Burn is an
   outflow, so its series is **negative** (`−(Σ|burn| ÷ Σ revenue) × 100`) — state that both series share the same
   sign convention so the zero line reads correctly, and pin it in a unit test (a fixture where EBITDA is a loss and
   burn is an outflow must produce two negative values).
7. **Label the aggregate for what it is.** No bare "Portfolio revenue". The KPI must read as
   `Sum of latest reported revenue · N companies with data`, and the page must state coverage explicitly
   (`Reporting: N of M selected have a <Month> MIS`). Never imply portfolio-wide coverage — this is a hard product rule.
8. **The chart carries its own coverage.** Under (or in) the burn/EBITDA-% chart, state the companies included and
   note when a month's ratio is built from fewer companies than another month's (e.g. "Jun'25: 2 companies ·
   Sep'25: 3 companies"). If only one company has data, render the series with a one-line honest note rather than
   hiding the chart.
9. **Chat hand-off.** "Open in Chat" carries the selection into the chat scope when the filter resolves to exactly one
   company; otherwise the chat stays portfolio-wide (the chat's scope model is single-company or all-portfolio — a
   multi-company filter has no chat equivalent). Do not silently drop the selection; if it cannot be carried, say so
   in the UI hint.
10. **Do not regress the KPI cards.** The metric-vs-count classification and the delta-chip behaviour fixed in
    `8132e51` must still hold after this change (no "No baseline"/"no prior period" on count cards).
11. **Reconciliation tests are the contract.** Unit-test the pure aggregator (`packages/core/src/dashboard/burn-ebitda.ts`)
    against a fixture with 2–3 companies over 3–4 months: ratio-of-sums correctness, the exclude-zero-revenue month,
    the sign convention, the filter reducing the aggregate exactly to the selected companies, and URL parsing
    (unknown slug ignored, duplicates deduped, empty = all). Deterministic DB rows only — never model output.
12. **Verification must show the filter working.** The headless check must load `/` twice (all companies vs a subset
    selected via the URL), assert the KPI numbers and the chart series actually differ between the two states, assert
    the new percentage chart renders with two series and a zero line, and capture before/after screenshots into
    `docs/review/`. Report the numbers you observed, not impressions.
13. **Ship rules.** `npm run typecheck`, `npm run lint`, `npm test` (scanner + all tests) and `npm run build` green
    from a clean tree; conventional commits; `git push origin main`; do not deploy (the owner's pipeline does).
    **Run every command in the FOREGROUND — never background one and never exit while a command is still running.**
    Never print or hardcode a credential.

## Definition of done
The Overview page lets the user pick companies, everything on it recomputes for that selection with honest coverage
labelling, a burn + EBITDA-% month-on-month chart renders (ratio of sums, correct signs, zero line, checkable
tooltips), the reconciliation tests pass, and the screenshots + numbers from the headless check are in the report.
