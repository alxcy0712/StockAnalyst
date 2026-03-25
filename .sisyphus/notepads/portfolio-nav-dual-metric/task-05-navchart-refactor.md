
## Task 5: Refactor NavChart for Dual-Metric Mode - COMPLETED

### Summary
Successfully refactored `src/components/NavChart.tsx` to support dual-metric visualization with `总资产规模` and `收益净值` modes.

### Changes Made

1. **State Management**
   - Added `chartMode` state: `'scale' | 'performance'` with default `'scale'`
   - Split data into `scaleSeries` and `performanceSeries` states
   - Mode is local-only (non-persisted) as required

2. **Data Integration**
   - Replaced `calculatePortfolioNavHistory` with `calculatePortfolioSeries` from `portfolioSeries.ts`
   - Consumes both `scale` and `performance` series from the new API

3. **Mode Toggle UI**
   - Added toggle buttons for switching between modes
   - Active mode highlighted with `bg-white` styling
   - Header text dynamically updates based on mode

4. **Scale Mode (`总资产规模`)
   - Plots `scaleSeries.totalValueCNY`
   - Y-axis label: `总资产 (CNY)`
   - Tooltip fields: `总资产 / 累计投入 / 浮动收益率`
   - Metrics cards: 最新总资产, 总投入成本, 浮动收益, 浮动收益率, 持仓天数, 资产数量

5. **Performance Mode (`收益净值`)
   - Plots `performanceSeries.nav`
   - Y-axis label: `收益净值`
   - Tooltip fields: `收益净值 / 累计收益率 / 当日净流入`
   - Metrics cards: 当前净值, 累计收益, 最大回撤, 年化收益率, 最大连涨/连跌, 波动率, 夏普比率, 卡玛比率

6. **Benchmark Integration**
   - Benchmark selector ONLY visible in performance mode
   - In scale mode, shows helper text: "基准对比仅在收益净值模式下可用"
   - Benchmark data fetched only when `chartMode === 'performance' && selectedBenchmark !== 'none'`

7. **Tests Updated**
   - Fixed test selectors to use `getAllByText` since labels appear in both cards and tooltips
   - All 3 tests passing:
     - renders empty state when no assets exist
     - renders scale metrics without return-risk cards
     - renders performance metrics and benchmark cards only in performance mode

### Key Implementation Details

- Chart options dynamically built based on `chartMode`
- Tooltip formatter switches content based on active mode
- Benchmark series only added to chart in performance mode
- Cancelled flag used in fetch effect to prevent state updates after unmount

### Files Modified
- `src/components/NavChart.tsx` - Main component refactored
- `src/components/NavChart.test.tsx` - Tests updated for new selectors

### Verification
- All component tests pass (3/3)
- TypeScript compilation clean (no errors)
- Feature verified: mode toggle works, benchmark hidden in scale mode, correct metrics display per mode
