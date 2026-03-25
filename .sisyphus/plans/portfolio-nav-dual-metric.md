# Portfolio NAV Dual-Metric Split

## TL;DR
> **Summary**: Split the current single portfolio chart into two explicit semantics: default **总资产规模** and switchable **收益净值**. Preserve scale-view visibility of cash inflows while adding a cash-flow-adjusted performance series that no longer jumps when assets are added on different dates.
> **Deliverables**:
> - Default `总资产规模` chart mode with unchanged scale semantics
> - New `收益净值` chart mode using cash-flow-adjusted unitization
> - Benchmark comparison limited to `收益净值` mode
> - Mode-specific metric cards and regression tests
> - Historical FX correction for non-CNY assets in chart calculations
> **Effort**: Medium
> **Parallel**: YES - 2 waves
> **Critical Path**: 1 → 2 → 3 → 4 → 5 → 6

## Context
### Original Request
资产列表中的资产若在不同日期添加，总资产净值在资产加入当天会突然升高，希望有可行解决方案。

### Interview Summary
- User chose to **split display semantics** instead of forcing one curve to represent both performance and asset scale.
- Default view must be **总资产规模**.
- A second mode must expose **收益净值** that is not mechanically distorted by later asset additions.
- User asked for the concrete next step for Sisyphus execution after planning.

### Metis Review (gaps addressed)
- Do not compare benchmark against total asset scale; benchmark is valid only in performance mode.
- Do not reuse one `NavPoint` semantic for both chart meanings.
- Metric cards must switch semantics with the selected mode.
- Avoid scope creep into transaction-ledger modeling; derive contribution timing from existing `purchaseDate` only.
- Add deterministic regression coverage for multi-date additions before refactor completion.

## Work Objectives
### Core Objective
Replace the ambiguous single “总资产走势/净值” implementation with a dual-mode chart that cleanly separates **portfolio size** from **investment performance**, while preserving current default usability and preventing false jumps caused by contribution flows.

### Deliverables
- Introduce explicit chart modes: `scale` and `performance`
- Extract chart history logic out of `src/components/NavChart.tsx` into a testable module
- Add date-aware FX conversion for historical valuation points
- Add unit/component test infrastructure and regression suites
- Implement UI toggle, labels, tooltip semantics, benchmark gating, and mode-specific metrics

### Definition of Done (verifiable conditions with commands)
- `npm run test` passes with calculation and component coverage for dual-mode chart behavior
- `npm run build` completes without TypeScript or Vite errors
- `npx vitest run src/utils/portfolioSeries.test.ts` passes the multi-date asset addition regression cases
- `npx vitest run src/components/NavChart.test.tsx` passes the mode toggle, benchmark visibility, and metric label assertions

### Must Have
- Default chart mode is `总资产规模`
- `收益净值` is cash-flow-adjusted and does not jump solely because a new asset is added
- `总资产规模` continues to show real contribution-driven step changes
- Benchmark selector/series/cards are available only in `收益净值` mode
- Historical HKD/USD valuation in the chart uses the point date’s historical FX rate, not today’s live rate
- Mode labels, tooltips, and metric cards clearly state what the user is seeing

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- Must NOT add a new `addDate`, transaction ledger, or cash account model in this scope
- Must NOT persist chart mode; always open in `总资产规模`
- Must NOT show return/risk analytics in `总资产规模` mode where they are semantically misleading
- Must NOT compare benchmark to `总资产规模`
- Must NOT silently keep the old overloaded `NavPoint` contract if dual semantics would remain ambiguous

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: tests-after + Vitest + React Testing Library + jsdom
- QA policy: Every task includes agent-executed happy-path and edge/failure scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: test foundation, shared series extraction, scale-mode preservation

Wave 2: performance-mode logic, chart UI split, mode-specific metrics/regressions

### Dependency Matrix (full, all tasks)
| Task | Depends On | Enables |
|---|---|---|
| 1 | - | 2, 3, 4, 5, 6 |
| 2 | 1 | 3, 4, 5, 6 |
| 3 | 1, 2 | 5, 6 |
| 4 | 1, 2 | 5, 6 |
| 5 | 1, 2, 3, 4 | 6 |
| 6 | 1, 2, 3, 4, 5 | Final verification |

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 3 tasks → `quick`, `unspecified-high`, `unspecified-high`
- Wave 2 → 3 tasks → `deep`, `visual-engineering`, `unspecified-high`

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [ ] 1. Add frontend test infrastructure for chart refactor safety

  **What to do**: Add a minimal React/Vite test stack using Vitest + React Testing Library + jsdom. Update `package.json` scripts so `npm run test` executes real tests instead of type-check-only, keep type-checking in the pipeline, and add a shared test setup file for DOM matchers. Add one smoke test that renders `NavChart` in the empty-assets state so later UI tasks can build on a working harness.
  **Must NOT do**: Must NOT introduce Playwright/Cypress as the primary test runner for this task. Must NOT change production UI behavior while only setting up tests.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: bounded config/bootstrap work across a few files
  - Skills: [`vercel-react-best-practices`] — helps keep React/Vite test setup aligned with current stack
  - Omitted: [`playwright`] — reserve browser automation for final verification, not the initial harness

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [2, 3, 4, 5, 6] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `package.json:6-12` — current scripts show `test` is only `tsc -b --noEmit`
  - Pattern: `vite.config.ts:1-13` — active Vite config to extend with Vitest `test` section
  - Pattern: `src/App.tsx:62-67` — `NavChart` is mounted inside the primary dashboard card
  - Pattern: `src/components/NavChart.tsx:280-285` — empty-state branch for the first render smoke test

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npm run test` executes Vitest suites and exits 0
  - [ ] `npm run build` exits 0 after the new test config and setup files are added
  - [ ] `src/components/NavChart.test.tsx` (or equivalent) contains a passing empty-state smoke test

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Test harness boots successfully
    Tool: Bash
    Steps: Run `npm run test`
    Expected: Vitest runs at least one suite and exits with status 0
    Evidence: .sisyphus/evidence/task-1-test-infra.txt

  Scenario: Empty-state component rendering remains safe
    Tool: Bash
    Steps: Run `npx vitest run src/components/NavChart.test.tsx -t "renders empty state when no assets exist"`
    Expected: The targeted smoke test passes and confirms no crash on initial render
    Evidence: .sisyphus/evidence/task-1-test-infra-empty-state.txt
  ```

  **Commit**: NO | Message: `test(nav-chart): add frontend test harness` | Files: `package.json`, `vite.config.ts`, test setup files, `src/components/NavChart.test.tsx`

- [ ] 2. Extract shared portfolio-series calculation module and explicit data contracts

  **What to do**: Move chart-history logic out of `src/components/NavChart.tsx` into a new pure/testable module (for example `src/utils/portfolioSeries.ts`). Introduce explicit chart contracts in `src/types/index.ts`: `PortfolioChartMode = 'scale' | 'performance'`, `PortfolioScalePoint`, `PortfolioPerformancePoint`, and a result type that returns both series together. Keep `findNearestPriceBinary` and all price-history assembly logic close to the new module, and add helper functions for date-point valuation, contribution detection, and per-date FX conversion. Historical valuation must use `getHistoricalExchangeRate(pointDate)` for each day; purchase contributions must still use purchase-date FX.
  **Must NOT do**: Must NOT leave dual semantics hidden behind the old single `NavPoint` shape. Must NOT keep historical chart points converted with the single live rate fetched for today.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: multi-file refactor with type and calculation boundary changes
  - Skills: [] — existing project patterns are sufficient
  - Omitted: [`vercel-react-best-practices`] — this task is calculation-contract focused, not React rendering focused

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [3, 4, 5, 6] | Blocked By: [1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/components/NavChart.tsx:49-126` — current data-fetch lifecycle and `navData` state ownership
  - Pattern: `src/components/NavChart.tsx:430-662` — current binary-search and history-construction logic to extract
  - API/Type: `src/types/index.ts:19-25` — current single `NavPoint` contract that must be replaced or retired for dual semantics
  - Pattern: `src/api/adapters/exchange.ts:52-76` — available historical FX helper and CNY conversion function
  - Pattern: `src/utils/calculator.ts:20-104` — existing analytics helpers currently tied to `NavPoint`

  **Acceptance Criteria** (agent-executable only):
  - [ ] The extracted module exports separate scale/performance point types and a shared series builder API
  - [ ] Historical point valuation for HKD/USD assets uses point-date FX in unit tests
  - [ ] `npx vitest run src/utils/portfolioSeries.test.ts -t "uses point-date FX for historical valuation"` exits 0

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Shared series module builds deterministic snapshots
    Tool: Bash
    Steps: Run `npx vitest run src/utils/portfolioSeries.test.ts -t "builds deterministic daily snapshots from fixture assets"`
    Expected: The extracted helper returns stable daily snapshots and the targeted test exits 0
    Evidence: .sisyphus/evidence/task-2-series-extraction.txt

  Scenario: Historical FX conversion no longer uses today's rate
    Tool: Bash
    Steps: Run `npx vitest run src/utils/portfolioSeries.test.ts -t "uses point-date FX for historical valuation"`
    Expected: The test passes only when historical conversion follows the series point date rather than one global live rate
    Evidence: .sisyphus/evidence/task-2-series-fx.txt
  ```

  **Commit**: NO | Message: `refactor(nav-chart): extract portfolio series contracts` | Files: `src/components/NavChart.tsx`, `src/utils/portfolioSeries.ts`, `src/types/index.ts`, related tests

- [ ] 3. Implement and lock the default `总资产规模` series behavior

  **What to do**: Build the explicit scale-series calculator on top of the extracted module. For each date, include only assets where `purchaseDate <= date`, value them with the resolved market price for that date, convert them with that date’s historical FX rate, and compute `totalCostCNY` as cumulative invested cost through that date. Return fields needed for scale-mode cards: `totalValueCNY`, `totalCostCNY`, `floatingPnLCNY`, and `floatingReturnRate`. Preserve current user-facing default semantics: the scale chart remains the default view and continues to show real contribution-driven step changes when new assets are added.
  **Must NOT do**: Must NOT use risk/return analytics from this scale series as if it were a pure performance index. Must NOT regress same-day single-asset or CNY-only behavior.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: logic-heavy change with regression sensitivity
  - Skills: [] — no extra framework guidance required
  - Omitted: [`playwright`] — deterministic unit tests are the primary guardrail here

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [5, 6] | Blocked By: [1, 2]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/components/NavChart.tsx:167-248` — current chart option uses `totalValueCNY` as the plotted series
  - Pattern: `src/components/NavChart.tsx:467-659` — current date loop and active-asset inclusion rule
  - Pattern: `src/components/AssetList.tsx:34-40` — current total-cost calculation by purchase-date FX
  - API/Type: `src/api/adapters/exchange.ts:52-76` — historical FX lookup for date-specific conversion

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npx vitest run src/utils/portfolioSeries.test.ts -t "scale mode preserves contribution-driven step changes"` exits 0
  - [ ] `npx vitest run src/utils/portfolioSeries.test.ts -t "scale mode matches legacy CNY-only behavior for same-day assets"` exits 0
  - [ ] Scale-mode fixtures expose `floatingPnLCNY` and `floatingReturnRate` for the latest point

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Default scale mode keeps real inflow step changes
    Tool: Bash
    Steps: Run `npx vitest run src/utils/portfolioSeries.test.ts -t "scale mode preserves contribution-driven step changes"`
    Expected: The targeted test passes and confirms step changes remain visible in the scale series
    Evidence: .sisyphus/evidence/task-3-scale-series.txt

  Scenario: Legacy-safe same-day portfolio behavior remains intact
    Tool: Bash
    Steps: Run `npx vitest run src/utils/portfolioSeries.test.ts -t "scale mode matches legacy CNY-only behavior for same-day assets"`
    Expected: The targeted regression passes, proving no unintended change for same-day CNY-only portfolios
    Evidence: .sisyphus/evidence/task-3-scale-regression.txt
  ```

  **Commit**: NO | Message: `feat(nav-chart): preserve explicit scale series` | Files: `src/utils/portfolioSeries.ts`, `src/types/index.ts`, related tests

- [ ] 4. Implement cash-flow-adjusted `收益净值` with unitization semantics

  **What to do**: Build a separate performance-series calculator that treats every `purchaseDate` contribution as external cash flow instead of investment performance. Use unitization, not weighted-average total return. Decision rules are fixed for this plan:
  1. The first investable day starts at `nav = 100` and `returnRate = 0`.
  2. `contributionCNY` for date `d` equals the sum of purchase costs for assets with `purchaseDate === d`, converted with purchase-date FX.
  3. On the contribution date itself, newly added assets enter the performance series at **purchase cost**, not same-day market close, so the contribution does not create a false jump.
  4. Starting on the next date after purchase, those assets use resolved market prices and the point date’s FX.
  5. Maintain `unitsOutstanding`; on each contribution date, issue `newUnits = contributionCNY / previousUnitValue`, where `previousUnitValue = previousPortfolioValueCNY / previousUnitsOutstanding`.
  6. Compute `currentUnitValue = currentPortfolioValueCNY / currentUnitsOutstanding`, `nav = currentUnitValue * 100`, and `returnRate = nav / 100 - 1` when the initial unit value is normalized to `1`.
  Return `PortfolioPerformancePoint[]` with at least `date`, `portfolioValueCNY`, `contributionCNY`, `unitsOutstanding`, `nav`, and `returnRate`.
  **Must NOT do**: Must NOT compute performance mode as `(sum current value / sum cumulative cost)` because that reintroduces contribution distortion. Must NOT let same-day purchase-day market noise create an artificial jump.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: logic-heavy financial-series semantics with multiple edge cases and no room for judgment drift
  - Skills: [] — the repo-specific math rules are defined directly in this plan
  - Omitted: [`vercel-react-best-practices`] — this task is series math, not React optimization

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [5, 6] | Blocked By: [1, 2]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/components/NavChart.tsx:108-118` — current benchmark fetch is tied to the old single series lifecycle
  - Pattern: `src/components/NavChart.tsx:467-659` — old single-series implementation that must no longer define performance mode
  - API/Type: `src/types/index.ts:19-25` — current `NavPoint` is insufficient; replace with explicit performance point contract
  - Pattern: `src/api/adapters/exchange.ts:52-76` — use purchase-date FX for contributions, point-date FX for valuation

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npx vitest run src/utils/portfolioSeries.test.ts -t "performance mode neutralizes contribution-day jumps"` exits 0
  - [ ] `npx vitest run src/utils/portfolioSeries.test.ts -t "performance mode starts at 100 on first investable day"` exits 0
  - [ ] `npx vitest run src/utils/portfolioSeries.test.ts -t "performance mode uses market pricing only after purchase day"` exits 0

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Multi-date purchases no longer cause false performance jumps
    Tool: Bash
    Steps: Run `npx vitest run src/utils/portfolioSeries.test.ts -t "performance mode neutralizes contribution-day jumps"`
    Expected: The targeted regression passes and the contribution-day point stays continuous except for real market movement
    Evidence: .sisyphus/evidence/task-4-performance-jump.txt

  Scenario: Purchase day is neutralized but later days still move with the market
    Tool: Bash
    Steps: Run `npx vitest run src/utils/portfolioSeries.test.ts -t "performance mode uses market pricing only after purchase day"`
    Expected: The targeted test passes only when the purchase day uses cost basis and the next day resumes real pricing
    Evidence: .sisyphus/evidence/task-4-performance-entry.txt
  ```

  **Commit**: NO | Message: `feat(nav-chart): add cash-flow-adjusted performance series` | Files: `src/utils/portfolioSeries.ts`, `src/types/index.ts`, related tests

- [ ] 5. Update `NavChart` UI for dual modes, benchmark gating, and explicit chart semantics

  **What to do**: Refactor `src/components/NavChart.tsx` to consume both series and render a local non-persisted `chartMode` toggle with exactly two options: `总资产规模` and `收益净值`. Default to `总资产规模` on every load. In `总资产规模` mode, plot `scaleSeries.totalValueCNY`, set the y-axis label to `总资产 (CNY)`, show tooltip fields `总资产 / 累计投入 / 浮动收益率`, and hide the benchmark selector while showing a short helper line such as `基准对比仅在收益净值模式下可用`. In `收益净值` mode, plot `performanceSeries.nav`, set the y-axis label to `收益净值`, show tooltip fields `收益净值 / 累计收益率 / 当日净流入` (only show the inflow row when `contributionCNY > 0`), and restore the existing persisted benchmark selection. Fetch benchmark data only when `chartMode === 'performance' && selectedBenchmark !== 'none'`; do not fetch or render benchmark data in scale mode.
  **Must NOT do**: Must NOT persist `chartMode`. Must NOT render benchmark selector/series in scale mode. Must NOT continue using the old header text `总资产走势` for both semantics.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: UI state split, chart semantics, and interaction details all change together
  - Skills: [`vercel-react-best-practices`] — useful for controlled state, effects, and render branching in React
  - Omitted: [`playwright`] — component tests should establish behavior before browser-level QA

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [6] | Blocked By: [1, 2, 3, 4]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/components/NavChart.tsx:49-58` — current local state and benchmark store wiring
  - Pattern: `src/components/NavChart.tsx:105-126` — current fetch lifecycle to split by mode
  - Pattern: `src/components/NavChart.tsx:167-276` — current ECharts option, tooltip, axis, and benchmark overlay logic
  - Pattern: `src/components/NavChart.tsx:288-315` — current header/benchmark selector/refresh UI to refactor into a mode-aware layout
  - API/Type: `src/stores/benchmarkStore.ts:10-19` — persisted benchmark selection should remain intact, only hidden when irrelevant

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npx vitest run src/components/NavChart.test.tsx -t "defaults to scale mode and hides benchmark selector"` exits 0
  - [ ] `npx vitest run src/components/NavChart.test.tsx -t "shows benchmark selector only in performance mode"` exits 0
  - [ ] `npx vitest run src/components/NavChart.test.tsx -t "switches chart title and axis labels with mode"` exits 0

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Default render opens in total asset scale mode
    Tool: Bash
    Steps: Run `npx vitest run src/components/NavChart.test.tsx -t "defaults to scale mode and hides benchmark selector"`
    Expected: The test passes and confirms the default mode is scale with no benchmark selector shown
    Evidence: .sisyphus/evidence/task-5-ui-default-mode.txt

  Scenario: Mode toggle reveals benchmark controls only for performance view
    Tool: Bash
    Steps: Run `npx vitest run src/components/NavChart.test.tsx -t "shows benchmark selector only in performance mode"`
    Expected: The test passes and proves benchmark UI is gated by chart mode
    Evidence: .sisyphus/evidence/task-5-ui-benchmark.txt
  ```

  **Commit**: NO | Message: `feat(nav-chart): add scale and performance toggle` | Files: `src/components/NavChart.tsx`, related tests

- [ ] 6. Split metric cards by mode and finish integration regressions

  **What to do**: Replace the current one-size-fits-all metrics block with two explicit metric sets. In `总资产规模` mode, render exactly six cards: `最新总资产`, `总投入成本`, `浮动收益`, `浮动收益率`, `持仓天数`, `资产数量`. In `收益净值` mode, render the existing return/risk family using the performance series only: `当前净值`, `累计收益`, `最大回撤`, `年化收益率`, `持仓天数`, `最大连涨/连跌`, `波动率`, `夏普比率`, `卡玛比率`. Benchmark cards (`基准收益`, `超额收益 (Alpha)`, `相对表现`) must render only in `收益净值` mode when a benchmark is selected. Update `src/utils/calculator.ts` or create a dedicated performance-metrics helper so volatility, Sharpe, drawdown, and consecutive streaks are computed from performance-series NAV behavior rather than raw asset-scale value changes. Finish with full regression coverage and a green build.
  **Must NOT do**: Must NOT show drawdown/Sharpe/Calmar in scale mode. Must NOT compute performance analytics from `totalValueCNY` after the mode split.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: mixed analytics + component integration work across helper and UI layers
  - Skills: [`vercel-react-best-practices`] — helpful for predictable memoization and derived-state rendering
  - Omitted: [`playwright`] — rely on deterministic tests here; browser QA belongs in the final wave

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [] | Blocked By: [1, 2, 3, 4, 5]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/components/NavChart.tsx:64-90` — current monolithic metrics derivation that mixes cost/value and return analytics
  - Pattern: `src/components/NavChart.tsx:325-425` — current card layout to split by mode
  - Pattern: `src/components/NavChart.tsx:134-140` — current benchmark comparison logic tied to one series
  - Pattern: `src/utils/calculator.ts:20-104` — analytics helpers currently assume the old `NavPoint` semantics
  - Pattern: `src/stores/assetStore.ts:16-54` — asset count and persisted portfolio source for scale-mode cards

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npx vitest run src/components/NavChart.test.tsx -t "renders scale metrics without return-risk cards"` exits 0
  - [ ] `npx vitest run src/components/NavChart.test.tsx -t "renders performance metrics and benchmark cards only in performance mode"` exits 0
  - [ ] `npm run test` exits 0 with the full suite
  - [ ] `npm run build` exits 0 after all mode-specific metrics and helpers are wired

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Scale mode shows only scale-safe summary cards
    Tool: Bash
    Steps: Run `npx vitest run src/components/NavChart.test.tsx -t "renders scale metrics without return-risk cards"`
    Expected: The targeted test passes and confirms drawdown/Sharpe/Calmar are absent in scale mode
    Evidence: .sisyphus/evidence/task-6-scale-metrics.txt

  Scenario: Full integration suite is green after dual-mode split
    Tool: Bash
    Steps: Run `npm run test && npm run build`
    Expected: All unit/component tests and the production build succeed without manual intervention
    Evidence: .sisyphus/evidence/task-6-full-regression.txt
  ```

  **Commit**: NO | Message: `feat(nav-chart): split metrics by chart mode` | Files: `src/components/NavChart.tsx`, `src/utils/calculator.ts` or new metrics helper, related tests

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle

  **Execution**: Run an `oracle` review against the completed diff, the final `.sisyphus/plans/portfolio-nav-dual-metric.md`, and the collected test evidence.
  **Exact check**: Verify every Deliverable, Must Have, and task-level Acceptance Criteria in this plan is satisfied by the implemented files and evidence.
  **Pass condition**: Oracle explicitly reports no missing deliverables, no unmet acceptance criteria, and no unresolved critical risks.
  **Evidence**: `.sisyphus/evidence/f1-plan-compliance.md`

- [ ] F2. Code Quality Review — unspecified-high

  **Execution**: Run a high-effort code review over all files changed for Tasks 1-6, focusing on React state management, effect dependencies, type safety, chart branching, and test quality.
  **Exact check**: Review `src/components/NavChart.tsx`, `src/utils/portfolioSeries.ts`, `src/utils/calculator.ts` (or replacement helper), `src/types/index.ts`, test files, and config updates for dead code, duplicated logic, fragile mocks, and semantic drift between scale/performance paths.
  **Pass condition**: Reviewer explicitly approves with no critical or high-severity issues remaining.
  **Evidence**: `.sisyphus/evidence/f2-code-quality.md`

- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)

  **Execution**: Start the app locally, then use Playwright-backed browser QA against a seeded localStorage fixture portfolio containing two assets with different `purchaseDate` values.
  **Exact steps**:
  1. Start the app with a local web server (`npm run dev` or the project’s agreed preview command).
  2. Seed `localStorage['asset-storage']` with a deterministic fixture containing at least two assets purchased on different dates and one benchmark selection in `localStorage['benchmark-storage']`.
  3. Reload the page and confirm the default chart mode label is `总资产规模`.
  4. Confirm the benchmark selector is hidden in scale mode.
  5. Switch to `收益净值`.
  6. Confirm the benchmark selector appears, benchmark cards can render, and the mode-specific metrics change from scale-safe cards to performance cards.
  7. Capture screenshots of both modes.
  **Pass condition**: All seven steps succeed without console errors, and screenshots show distinct scale/performance states.
  **Evidence**: `.sisyphus/evidence/f3-manual-qa.md`, `.sisyphus/evidence/f3-scale-mode.png`, `.sisyphus/evidence/f3-performance-mode.png`

- [ ] F4. Scope Fidelity Check — deep

  **Execution**: Run a deep review comparing the completed diff to this plan’s Scope Boundaries, Must NOT Have list, and user-confirmed decisions.
  **Exact check**: Verify the implementation did not add `addDate`, transaction-ledger modeling, persisted chart mode, benchmark behavior in scale mode, or return/risk cards in scale mode. Verify the historical FX fix stayed inside chart-calculation scope.
  **Pass condition**: Reviewer explicitly confirms the delivered change is in-scope and no forbidden expansion occurred.
  **Evidence**: `.sisyphus/evidence/f4-scope-fidelity.md`

## Commit Strategy
- Do not create intermediate commits during tasks 1-6 unless the user explicitly asks.
- After final verification approvals and explicit user okay, create one commit:
  - `feat(nav-chart): split asset-scale and performance views`

## Success Criteria
- User can open the app and see `总资产规模` by default.
- Switching to `收益净值` removes contribution-day false jumps in the regression fixture.
- Benchmark controls and benchmark metrics appear only in `收益净值` mode.
- CNY-only portfolios preserve previous default visual trend; non-CNY portfolios use historically correct FX conversion.
- All automated tests and build commands pass without manual patching.
