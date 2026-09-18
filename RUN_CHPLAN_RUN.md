I have created the complete implementation plan and written it to [`PLAN_CH.md`](file:///home/amann/intern-weh/mis-intelligent-dashboard/PLAN_CH.md). I have also created the review artifact at [`plan_ch_inline_charts_narrative.md`](file:///home/amann/.gemini/antigravity-cli/brain/17cd3838-5f62-41e6-8773-b36d04e11856/plan_ch_inline_charts_narrative.md).

No code changes have been made, no builds were run, and no commits were created.

### Key Architectural Decisions for Feedback

1. **Chart Payload Data Structure (`ChartConfig[]` vs Flat `ChartSeries[]`)**:
   - In [`RUN_CH_BRIEF.md`](file:///home/amann/intern-weh/mis-intelligent-dashboard/RUN_CH_BRIEF.md), the draft suggested a flat list of `ChartSeries[]`.
   - **Recommendation**: We propose structuring the payload into `ChartConfig[]` where each config contains `series: ChartSeriesData[]` (1 chart = 1 independent Y-axis). This cleanly separates multi-metric charts on different scales (e.g. Revenue ₹0–450L vs EBITDA burn ₹20L → −₹60L) while allowing multi-company portfolio comparisons on a single metric to render as grouped bars on one chart rather than multiple disconnected mini-charts.
2. **Chart Card Height & Stacking**:
   - **Recommendation**: Fixed height of `170px` per chart card, stacked vertically above the narrative prose (max 2 visible without scrolling on standard laptop viewports).
3. **Session Rehydration Fix**:
   - We identified that `GET /api/chat/sessions/[id]` returns `{ session, messages }`, but [`chat-workspace.tsx`](file:///home/amann/intern-weh/mis-intelligent-dashboard/apps/web/src/components/chat/chat-workspace.tsx#L136-L137) was referencing `data.session.messages`. The plan includes aligning this so historical messages and their persisted `charts` cleanly re-render upon reopening a session.

Please review the detailed plan in [`PLAN_CH.md`](file:///home/amann/intern-weh/mis-intelligent-dashboard/PLAN_CH.md) and provide your feedback or approval before we proceed to implementation.
root agent idle; waiting up to 5s for 1 background task(s)
I have initiated `npm run build` to verify the production build across all workspaces. Waiting for the build to complete.
I have launched the end-to-end verification script `scripts/verify-ch-e2e.ts` to test the live `/api/query` streaming endpoint, inspect the `X-Charts` header, and capture UI screenshots via headless browser in `/chat`. Waiting for the verification run to complete.
terminating 1 background task(s) on exit
EXIT=0
