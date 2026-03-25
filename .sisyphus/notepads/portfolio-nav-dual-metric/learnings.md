# Portfolio Nav Dual Metric - Learnings

## Task 1: Test Stack Setup

### Summary
Successfully set up Vitest + React Testing Library + jsdom test stack for React/Vite project.

### Files Created/Modified
- `package.json` - Added test dependencies and updated scripts
- `vite.config.ts` - Added Vitest configuration with jsdom environment
- `src/test/setup.ts` - Created test setup file with DOM matchers and matchMedia mock
- `src/components/NavChart.test.tsx` - Created smoke test for empty state

### Key Findings

1. **Vitest Configuration**: Added `/// <reference types="vitest" />` to vite.config.ts for TypeScript support. This is a necessary triple-slash directive for Vitest globals.

2. **Zustand Store Mocking**: The NavChart component uses Zustand stores with both selector-based and non-selector calls:
   - `useAssetStore((state) => state.assets)` - uses selector
   - `useThemeStore()` - returns entire store
   
   The mock must handle both cases by checking if selector is a function.

3. **jsdom Environment**: Added `window.matchMedia` mock in setup.ts because theme detection uses this browser API which isn't available in jsdom.

4. **Test Script**: Changed from `tsc -b --noEmit` (type-check only) to `vitest run`. Added separate `typecheck` script to preserve type-checking in pipeline.

### Dependencies Installed
- vitest@3.2.4
- @testing-library/react@16.3.2
- @testing-library/jest-dom@6.9.1
- jsdom@27.0.1

### Verification
- `npm run test` exits 0 ✓
- `npx vitest run src/components/NavChart.test.tsx -t "renders empty state when no assets exist"` exits 0 ✓
- `npm run build` exits 0 ✓

## Task 2: Portfolio Series Extraction Setup

### Summary
Extracted chart-series helpers into `src/utils/portfolioSeries.ts` and introduced explicit scale/performance contracts so future dual-mode chart work no longer relies on the overloaded `NavPoint` shape.

### Key Findings

1. **Historical valuation FX must be point-date based**: Purchase contributions still belong to purchase-date FX, but mark-to-market valuation must call `getHistoricalExchangeRate(pointDate)` for each chart date. A fixed live FX rate hides real historical HKD/USD swings.

2. **Scale and performance semantics must stay separate**: `PortfolioScalePoint` needs floating PnL/cost fields, while `PortfolioPerformancePoint` needs contribution/unit/NAV fields. Keeping both behind one point interface would leak incorrect assumptions into later chart mode work.

3. **Extraction can be staged safely**: The reusable module now owns binary-search lookup, natural-day iteration, price-history map assembly, contribution detection, and point-date valuation helpers. Performance-series generation can remain a scaffold until later tasks wire the new contracts into UI behavior.

### Verification
- `npx vitest run src/utils/portfolioSeries.test.ts -t "uses point-date FX for historical valuation"` exits 0 ✓
- `npm run typecheck` exits 0 ✓

## Task 4: Unitized Performance Series

### Summary
Implemented `buildPortfolioPerformanceSeries` as a unitized return series that treats `purchaseDate` cash injections as external contributions, starts first investable day at NAV 100, and defers market repricing impact for newly added assets until the day after purchase.

### Key Findings

1. **Contribution-day distortion can be neutralized without reintroducing cost-ratio math**: Issuing units by `newUnits = contribution / previousUnitValue` keeps unit value unchanged on cashflow days when contribution-day valuation uses `previousPortfolioValue + contribution`.

2. **First investable day baseline is deterministic**: Seeding with `previousUnitValue = 1` makes NAV normalization straightforward (`nav = unitValue * 100`) and guarantees first valid point starts at exactly 100 with `returnRate = 0`.

3. **Purchase-day vs post-purchase pricing split is easiest at performance builder layer**: Keeping scale series untouched and applying contribution-day override only in performance series preserves legacy scale behavior while enforcing cashflow-adjusted performance semantics.

### Verification
- `npx vitest run src/utils/portfolioSeries.test.ts -t "performance mode neutralizes contribution-day jumps"` exits 0 ✓
- `npx vitest run src/utils/portfolioSeries.test.ts -t "performance mode starts at 100 on first investable day"` exits 0 ✓
- `npx vitest run src/utils/portfolioSeries.test.ts -t "performance mode uses market pricing only after purchase day"` exits 0 ✓

## Task 3: Explicit Scale Series

### Summary
Made the scale-series path explicit about active holdings by date, cumulative invested cost, and floating PnL fields while keeping scale mode's visible contribution jumps intact.

### Key Findings

1. **Scale mode should filter by holding start date first**: Building each point from only `purchaseDate <= pointDate` assets keeps contribution-day jumps real instead of leaking future holdings backward into earlier dates.

2. **Cost and value need different FX timestamps**: `totalCostCNY` stays anchored to cached purchase-date contributions, while `totalValueCNY` must still revalue each active asset with point-date FX and resolved market price.

3. **Same-day CNY portfolios are a good regression anchor**: When all assets share a purchase date and currency, the explicit scale logic should collapse to the legacy aggregate-value behavior, so that fixture catches accidental semantic drift.

### Verification
- `npx vitest run src/utils/portfolioSeries.test.ts -t "scale mode preserves contribution-driven step changes"` exits 0 ✓
- `npx vitest run src/utils/portfolioSeries.test.ts -t "scale mode matches legacy CNY-only behavior for same-day assets"` exits 0 ✓

## Task 6: Mode-Specific Metrics Split

### Summary
Split `NavChart` metrics into scale-safe and performance-only sets, moved risk analytics onto performance NAV behavior, and locked benchmark cards behind performance mode with component coverage.

### Key Findings

1. **Risk metrics must follow unitized NAV, not asset scale**: max drawdown, volatility, Sharpe, Calmar, and streaks all need to read the cash-flow-adjusted performance series or they will misclassify contribution jumps as market behavior.

2. **Scale mode needs operational summary cards instead of return analytics**: `最新总资产 / 总投入成本 / 浮动收益 / 浮动收益率 / 持仓天数 / 资产数量` stays semantically correct even when later purchases create real asset-scale jumps.

3. **Tooltip help text duplicates visible labels in tests**: RTL assertions on these cards should prefer `getAllByText` or role-based queries because each label appears both in the card header and hidden hover help content.

### Verification
- `npx vitest run src/components/NavChart.test.tsx` exits 0 ✓
- `npm run test` exits 0 ✓
- `npm run build` exits 0 ✓
