# PLAN_CH.md — ARCHITECT REVIEW (approved with refinements)

Reviewed by the engineering lead. The plan is approved; the two open questions are answered below, plus a short list
of additions that are **binding for the build run**. Everything else in `PLAN_CH.md` stands as written.

## Decisions
1. **Chart payload structure — APPROVED: `ChartConfig[]` with `series: ChartSeriesData[]`.**
   The critique of my flat `ChartSeries[]` is correct: one `ChartConfig` = one chart card = one Y-axis, so the
   frontend never has to guess how to group series. Implement exactly as specified in §1.2. Do not fall back to the
   flat array.
2. **Height and stacking — APPROVED:** 170 px per chart card, stacked vertically above the prose, max 4 charts,
   max 12 points per series (this also keeps the `X-Charts` header safely under the 8 KB limit).
   Refinement: at `≥1280px`, when there are 3 or 4 charts, lay them out in a **2-column grid** so they fit without
   scrolling; below that (and always at mobile widths) stack them one per row at 150 px with no horizontal overflow.

## Also approved
3. **Fix the session rehydration bug** (`chat-workspace.tsx`: `data.messages` vs `data.session.messages`).
   Add a regression test that loads an existing session and asserts the stored messages **and their charts** render.

## Binding additions
4. **Charts must match the answer's scope.** Build the payload with the same scope resolution the router already
   produced — never attach a chart for a company the answer does not discuss, and never for a metric that has no rows
   in that scope.
5. **Numeric consistency guard.** Add a unit test asserting that for each chart series, the last point equals the last
   row of the metric series it was built from (no rounding drift, no re-derivation), and that no point appears that
   is absent from the input rows.
6. **Trend language needs evidence.** In the prompt, permit the closing "trend to watch" line **only when the series
   has at least 3 periods** for the metric being discussed; with 1–2 points, describe the values and stop. Never
   characterise a trend from two data points.
7. **Forecast ban stays absolute.** Annualisation proxies (×12 month, ×4 quarter) computed from **actuals** are
   allowed and must be labelled with the arithmetic, `≈`, the input citations and the caveat (as in the reference
   answer). Predicting a future period remains forbidden.
8. **Accessibility.** Each chart card gets an `aria-label` naming metric · company · period range, a visible mono
   micro-label with the same, and a `role="img"`. No colour-only meaning: negatives also carry a minus sign in the
   tooltip and axis labels.
9. **Do not regress anything.** `npm test` (scanner + 101 existing tests) must stay green; add the new tests on top.
   No change to the streaming text contract or the `X-Citations` header name.
10. **Two commits, one push.** Commit the chart work and the prompt/narrative work separately with conventional
    messages, then push to `origin main`.

## Definition of done for the build run
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all green.
- A scripted end-to-end check that, for a company-scoped question like
  "how is the monthly revenue for the past few months and how is the ebitda burn", the response carries **two
  separately scaled charts** (revenue positive on its own axis; burn with negatives red on its own axis) plus
  narrative prose with bolded figures, and that an ARR-style question yields a labelled annualisation with its caveat
  and the better-proxy recommendation. Report the evidence (screenshot path + the raw payload you observed).
