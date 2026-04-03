import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { ECharts } from 'echarts';
import dayjs from 'dayjs';
import { HelpCircle, RefreshCw } from 'lucide-react';

import { api } from '../api';
import { useAssetStore } from '../stores/assetStore';
import { useBenchmarkStore } from '../stores/benchmarkStore';
import { useThemeStore } from '../stores/themeStore';
import type {
  BenchmarkIndex,
  BenchmarkNavPoint,
  PortfolioChartMode,
  PortfolioPerformancePoint,
  PortfolioScalePoint,
} from '../types';
import { calculatePerformanceMetrics, calculateBeta } from '../utils/calculator';
import { dataCache, initCache } from '../utils/dataCache';
import { calculatePortfolioSeries, clearPortfolioSeriesCache } from '../utils/portfolioSeries';

function MetricCard({
  label,
  value,
  subValue,
  valueClass,
  helpTitle,
  helpDesc,
}: {
  label: string;
  value: React.ReactNode;
  subValue?: string;
  valueClass?: string;
  helpTitle: string;
  helpDesc: string;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-3 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors duration-200">
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[10px] text-gray-400 dark:text-gray-500">{label}</span>
        <div className="group relative">
          <HelpCircle className="w-3 h-3 text-gray-300 dark:text-gray-600 cursor-help" />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 p-2.5 bg-gray-900 dark:bg-gray-800 text-white text-[11px] rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg">
            <p className="font-medium mb-1">{helpTitle}</p>
            <p className="text-gray-300 leading-relaxed">{helpDesc}</p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
          </div>
        </div>
      </div>
      <p className={`text-lg font-semibold text-gray-900 dark:text-white ${valueClass || ''}`}>{value}</p>
      {subValue && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{subValue}</p>}
    </div>
  );
}

const METRIC_GRID_CLASS = 'grid grid-cols-3 gap-2';

function formatCurrency(value: number, digits: number = 0): string {
  return `¥${value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatPercent(value: number, digits: number = 2, alwaysSign: boolean = false): string {
  const formatted = `${(value * 100).toFixed(digits)}%`;
  return alwaysSign && value > 0 ? `+${formatted}` : formatted;
}

function getValueClass(value: number): string {
  return value >= 0 ? 'text-red-500' : 'text-green-500';
}

function buildScaleTooltip(point: PortfolioScalePoint): string {
  return `
    <div style="font-weight: 600; margin-bottom: 4px;">${point.date}</div>
    <div>总资产: <span style="font-weight: 600;">${formatCurrency(point.totalValueCNY, 2)}</span></div>
    <div>累计投入: <span style="font-weight: 600;">${formatCurrency(point.totalCostCNY, 2)}</span></div>
    <div>浮动收益率: <span style="font-weight: 600; color: ${point.floatingReturnRate >= 0 ? '#ef4444' : '#22c55e'}">${formatPercent(point.floatingReturnRate, 2, true)}</span></div>
  `;
}

function buildPerformanceTooltip(point: PortfolioPerformancePoint): string {
  const contributionRow = point.contributionCNY > 0
    ? `<div>当日净流入: <span style="font-weight: 600;">${formatCurrency(point.contributionCNY, 2)}</span></div>`
    : '';

  return `
    <div style="font-weight: 600; margin-bottom: 4px;">${point.date}</div>
    <div>收益净值: <span style="font-weight: 600;">${point.nav.toFixed(2)}</span></div>
    <div>累计收益率: <span style="font-weight: 600; color: ${point.returnRate >= 0 ? '#ef4444' : '#22c55e'}">${formatPercent(point.returnRate, 2, true)}</span></div>
    ${contributionRow}
  `;
}

export function NavChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ECharts | null>(null);
  const assets = useAssetStore((state) => state.assets);
  const { isDark } = useThemeStore();
  const { selectedBenchmark, setBenchmark } = useBenchmarkStore();
  const [chartMode, setChartMode] = useState<PortfolioChartMode>('scale');
  const [scaleSeries, setScaleSeries] = useState<PortfolioScalePoint[]>([]);
  const [performanceSeries, setPerformanceSeries] = useState<PortfolioPerformancePoint[]>([]);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkNavPoint[]>([]);
  const [isSeriesLoading, setIsSeriesLoading] = useState(false);
  const [isBenchmarkLoading, setIsBenchmarkLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // 基准数据缓存: key = `${benchmark}:${startDate}:${endDate}`
  const benchmarkCacheRef = useRef<Map<string, BenchmarkNavPoint[]>>(new Map());

  // 是否在加载中（系列或基准）
  const isChartLoading = isSeriesLoading || (chartMode === 'performance' && selectedBenchmark !== 'none' && isBenchmarkLoading);

  useEffect(() => {
    initCache();
  }, []);

  const holdingDays = useMemo(() => {
    if (assets.length === 0) return 0;
    const earliestPurchase = Math.min(...assets.map((asset) => dayjs(asset.purchaseDate).valueOf()));
    return dayjs().diff(dayjs(earliestPurchase), 'day');
  }, [assets]);

  const scaleMetrics = useMemo(() => {
    if (scaleSeries.length === 0) return null;
    const latest = scaleSeries[scaleSeries.length - 1];
    return {
      latestTotalValue: latest.totalValueCNY,
      totalCost: latest.totalCostCNY,
      floatingPnL: latest.floatingPnLCNY,
      floatingReturnRate: latest.floatingReturnRate,
      holdingDays,
      assetCount: assets.length,
    };
  }, [assets.length, holdingDays, scaleSeries]);

  const performanceMetrics = useMemo(() => {
    const metrics = calculatePerformanceMetrics(performanceSeries);
    if (!metrics) return null;

    return {
      ...metrics,
      holdingDays,
    };
  }, [holdingDays, performanceSeries]);

  const benchmarkComparison = useMemo(() => {
    if (chartMode !== 'performance' || performanceSeries.length === 0 || benchmarkData.length === 0) {
      return null;
    }

    const portfolioReturn = performanceSeries[performanceSeries.length - 1].returnRate;
    const benchmarkReturn = benchmarkData[benchmarkData.length - 1].returnRate;
    const alpha = portfolioReturn - benchmarkReturn;

    const portfolioDailyReturns: number[] = [];
    const benchmarkDailyReturns: number[] = [];

    const benchmarkMap = new Map(benchmarkData.map((item, index) => [item.date, { item, index }]));

    for (let i = 1; i < performanceSeries.length; i++) {
      const portfolioDailyReturn = performanceSeries[i].returnRate - performanceSeries[i - 1].returnRate;
      const date = performanceSeries[i].date;
      const benchmarkEntry = benchmarkMap.get(date);
      if (benchmarkEntry && benchmarkEntry.index > 0) {
        const benchmarkDailyReturn = benchmarkEntry.item.returnRate - benchmarkData[benchmarkEntry.index - 1].returnRate;
        portfolioDailyReturns.push(portfolioDailyReturn);
        benchmarkDailyReturns.push(benchmarkDailyReturn);
      }
    }

    const { beta, betaReturn } = calculateBeta(portfolioDailyReturns, benchmarkDailyReturns, benchmarkReturn);

    return { portfolioReturn, benchmarkReturn, alpha, beta, betaReturn };
  }, [benchmarkData, chartMode, performanceSeries]);

  // 计算系列数据（仅在资产或刷新键变化时）
  useEffect(() => {
    if (assets.length === 0) {
      setScaleSeries([]);
      setPerformanceSeries([]);
      return;
    }

    let cancelled = false;

    const fetchSeriesData = async (forceRefresh: boolean = false) => {
      setIsSeriesLoading(true);
      try {
        const seriesResult = await calculatePortfolioSeries(assets, forceRefresh);
        if (cancelled) return;
        setScaleSeries(seriesResult.scale);
        setPerformanceSeries(seriesResult.performance);
      } catch (error) {
        console.error('Error calculating series:', error);
      } finally {
        if (!cancelled) {
          setIsSeriesLoading(false);
        }
      }
    };

    fetchSeriesData();

    return () => {
      cancelled = true;
    };
  }, [assets, refreshKey]);

  // 获取基准数据（在performance模式下且选择基准时，使用缓存）
  useEffect(() => {
    if (chartMode !== 'performance' || selectedBenchmark === 'none' || performanceSeries.length === 0) {
      setBenchmarkData([]);
      setIsBenchmarkLoading(false);
      return;
    }

    let cancelled = false;

    const fetchBenchmark = async () => {
      const startDate = performanceSeries[0].date.replace(/-/g, '');
      const endDate = performanceSeries[performanceSeries.length - 1].date.replace(/-/g, '');
      const cacheKey = `${selectedBenchmark}:${startDate}:${endDate}`;

      // 检查缓存
      const cached = benchmarkCacheRef.current.get(cacheKey);
      if (cached) {
        setBenchmarkData(cached);
        setIsBenchmarkLoading(false);
        return;
      }

      setIsBenchmarkLoading(true);
      try {
        const benchmarkNav = await api.benchmark.getNavHistory(selectedBenchmark, startDate, endDate);
        if (!cancelled) {
          setBenchmarkData(benchmarkNav);
          benchmarkCacheRef.current.set(cacheKey, benchmarkNav);
        }
      } catch (error) {
        console.error('Error fetching benchmark:', error);
        if (!cancelled) {
          setBenchmarkData([]);
        }
      } finally {
        if (!cancelled) {
          setIsBenchmarkLoading(false);
        }
      }
    };

    fetchBenchmark();

    return () => {
      cancelled = true;
    };
  }, [chartMode, selectedBenchmark, performanceSeries]);

  const handleRefresh = async () => {
    await dataCache.clearAll();
    benchmarkCacheRef.current.clear();
    clearPortfolioSeriesCache();
    setRefreshKey((previous) => previous + 1);
  };

  useEffect(() => {
    if (!chartRef.current) return;

    const activeSeries = chartMode === 'scale' ? scaleSeries : performanceSeries;

    // 初始化或获取图表实例
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    // 如果没有数据，清除图表
    if (activeSeries.length === 0) {
      if (chartInstance.current && typeof chartInstance.current.clear === 'function') {
        chartInstance.current.clear();
      }
      return;
    }

    const colors = {
      line: isDark ? '#60a5fa' : '#2563eb',
      lineArea: isDark
        ? ['rgba(96, 165, 250, 0.3)', 'rgba(96, 165, 250, 0.02)']
        : ['rgba(37, 99, 235, 0.15)', 'rgba(37, 99, 235, 0)'],
      text: isDark ? '#94a3b8' : '#64748b',
      gridLine: isDark ? 'rgba(148, 163, 184, 0.1)' : '#f1f5f9',
      axisLine: isDark ? 'rgba(148, 163, 184, 0.2)' : '#e2e8f0',
      tooltipBg: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      tooltipText: isDark ? '#f1f5f9' : '#1e293b',
      tooltipBorder: isDark ? 'rgba(148, 163, 184, 0.2)' : '#e2e8f0',
      sliderBg: isDark ? 'rgba(148, 163, 184, 0.1)' : '#f1f5f9',
      sliderFiller: isDark ? 'rgba(96, 165, 250, 0.3)' : 'rgba(37, 99, 235, 0.15)',
      sliderHandle: isDark ? '#60a5fa' : '#2563eb',
    };

    const xAxisData = activeSeries.map((point) => point.date);
    const yAxisData = chartMode === 'scale'
      ? scaleSeries.map((point) => point.totalValueCNY)
      : performanceSeries.map((point) => point.nav);

    const option: echarts.EChartsOption = {
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '10%',
        containLabel: true,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: colors.tooltipText },
        formatter: (params: any) => {
          const normalizedParams = Array.isArray(params) ? params : [params];
          const point = activeSeries[normalizedParams[0]?.dataIndex ?? 0];
          if (!point) return '';
          return chartMode === 'scale'
            ? buildScaleTooltip(point as PortfolioScalePoint)
            : buildPerformanceTooltip(point as PortfolioPerformancePoint);
        },
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisLine: { lineStyle: { color: colors.axisLine } },
        axisLabel: { color: colors.text, rotate: 45 },
      },
      yAxis: {
        type: 'value',
        name: chartMode === 'scale' ? '总资产 (CNY)' : '收益净值',
        nameTextStyle: { color: colors.text },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: colors.gridLine } },
        axisLabel: { color: colors.text },
        scale: true,
        min: (value: { min: number }) => Math.floor(value.min * 0.95),
        max: (value: { max: number }) => Math.ceil(value.max * 1.05),
      },
      series: (() => {
        const seriesData: echarts.SeriesOption[] = [
          {
            name: chartMode === 'scale' ? '总资产' : '收益净值',
            type: 'line',
            data: yAxisData,
            smooth: true,
            symbol: 'none',
            lineStyle: { width: 2.5, color: colors.line },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: colors.lineArea[0] },
                { offset: 1, color: colors.lineArea[1] },
              ]),
            },
          },
        ];

        if (chartMode === 'performance' && benchmarkData.length > 0 && selectedBenchmark !== 'none') {
          const benchmarkMap = new Map(benchmarkData.map((item) => [item.date, item.nav]));
          const benchmarkSeries = performanceSeries.map((point) => benchmarkMap.get(point.date) ?? null);

          seriesData.push({
            name: api.benchmark.configs[selectedBenchmark].name,
            type: 'line',
            data: benchmarkSeries,
            smooth: true,
            symbol: 'none',
            lineStyle: { width: 1.5, color: '#9ca3af', type: 'solid' },
          });
        }

        return seriesData;
      })(),
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        {
          type: 'slider',
          start: 0,
          end: 100,
          bottom: 10,
          height: 20,
          borderColor: 'transparent',
          backgroundColor: colors.sliderBg,
          fillerColor: colors.sliderFiller,
          handleStyle: { color: colors.sliderHandle },
        },
      ],
    };

    chartInstance.current.setOption(option, true);

    const handleResize = () => {
      chartInstance.current?.resize();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [benchmarkData, chartMode, isDark, performanceSeries, scaleSeries, selectedBenchmark]);

  if (assets.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800/30 rounded-2xl p-12 text-center">
        <p className="text-gray-400 dark:text-gray-500 text-sm">添加资产后将在此显示净值走势</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {chartMode === 'scale' ? '总资产规模' : '收益净值'}
          </h3>
          <div className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 p-1">
            <button
              type="button"
              onClick={() => setChartMode('scale')}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${chartMode === 'scale'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400'}`}
            >
              总资产规模
            </button>
            <button
              type="button"
              onClick={() => setChartMode('performance')}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${chartMode === 'performance'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400'}`}
            >
              收益净值
            </button>
          </div>
          {chartMode === 'performance' ? (
            <select
              aria-label="基准选择"
              value={selectedBenchmark}
              onChange={(event) => setBenchmark(event.target.value as BenchmarkIndex)}
              className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-none outline-none cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <option value="none">无基准</option>
              <option value="csi300">沪深300</option>
              <option value="shanghai">上证指数</option>
            </select>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500">基准对比仅在收益净值模式下可用</p>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={handleRefresh}
            disabled={isChartLoading}
            className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="刷新数据"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChartLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="relative h-72 w-full">
        <div ref={chartRef} className="h-72 w-full" />
        {isChartLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-white mb-2"></div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isSeriesLoading ? '正在计算组合走势...' : '正在加载基准数据...'}
            </p>
          </div>
        )}
      </div>

      {chartMode === 'scale' && scaleMetrics && (
        <div className="space-y-2 mt-5">
          <div className={METRIC_GRID_CLASS}>
            <MetricCard
              label="最新总资产"
              value={formatCurrency(scaleMetrics.latestTotalValue)}
              helpTitle="最新总资产"
              helpDesc="当前投资组合的总市值，基于最新价格与对应日期汇率计算"
            />
            <MetricCard
              label="总投入成本"
              value={formatCurrency(scaleMetrics.totalCost)}
              helpTitle="总投入成本"
              helpDesc="当前持仓资产累计投入成本，按各自买入日汇率换算为人民币"
            />
            <MetricCard
              label="浮动收益"
              value={formatCurrency(scaleMetrics.floatingPnL)}
              valueClass={getValueClass(scaleMetrics.floatingPnL)}
              helpTitle="浮动收益"
              helpDesc="最新总资产减去总投入成本后的未实现盈亏"
            />
          </div>
          <div className={METRIC_GRID_CLASS}>
            <MetricCard
              label="浮动收益率"
              value={formatPercent(scaleMetrics.floatingReturnRate, 2, true)}
              valueClass={getValueClass(scaleMetrics.floatingReturnRate)}
              helpTitle="浮动收益率"
              helpDesc="浮动收益除以总投入成本，反映当前持仓整体盈亏比例"
            />
            <MetricCard
              label="持仓天数"
              value={`${scaleMetrics.holdingDays}天`}
              helpTitle="持仓天数"
              helpDesc="从最早买入资产至今的持仓天数"
            />
            <MetricCard
              label="资产数量"
              value={`${scaleMetrics.assetCount}项`}
              helpTitle="资产数量"
              helpDesc="当前组合中纳入统计的资产条目数量"
            />
          </div>
        </div>
      )}

      {chartMode === 'performance' && performanceMetrics && (
        <div className="space-y-2 mt-5">
          <div className={METRIC_GRID_CLASS}>
            <MetricCard
              label="当前净值"
              value={performanceMetrics.currentNav.toFixed(2)}
              helpTitle="当前净值"
              helpDesc="以首个可投资日为 100 的现金流调整后组合净值"
            />
            <MetricCard
              label="累计收益"
              value={formatPercent(performanceMetrics.totalReturn, 2, true)}
              valueClass={getValueClass(performanceMetrics.totalReturn)}
              helpTitle="累计收益"
              helpDesc="基于收益净值序列计算的累计收益率，不受后续加仓规模扭曲"
            />
            <MetricCard
              label="最大回撤"
              value={formatPercent(performanceMetrics.maxDrawdown, 2)}
              valueClass="text-green-500"
              helpTitle="最大回撤"
              helpDesc="收益净值从阶段高点回落到低点的最大跌幅，衡量回撤风险"
            />
          </div>

          {benchmarkComparison && selectedBenchmark !== 'none' && (
            <div className={METRIC_GRID_CLASS}>
              <MetricCard
                label="基准收益"
                value={formatPercent(benchmarkComparison.benchmarkReturn, 2, true)}
                valueClass={getValueClass(benchmarkComparison.benchmarkReturn)}
                helpTitle="基准收益"
                helpDesc={`${api.benchmark.configs[selectedBenchmark].name}在同一收益净值周期内的累计收益率`}
              />
              <MetricCard
                label="超额收益 (Alpha)"
                value={formatPercent(benchmarkComparison.alpha, 2, true)}
                valueClass={getValueClass(benchmarkComparison.alpha)}
                helpTitle="超额收益"
                helpDesc="组合收益减去基准收益，正值表示跑赢基准"
              />
              <MetricCard
                label="Beta收益"
                value={formatPercent(benchmarkComparison.betaReturn, 2, true)}
                valueClass={getValueClass(benchmarkComparison.betaReturn)}
                subValue={`β=${benchmarkComparison.beta.toFixed(2)}`}
                helpTitle="Beta收益"
                helpDesc="基于组合Beta系数计算的系统性风险收益：Beta收益 = Beta × 基准收益。子值显示组合的Beta系数，β>1表示波动大于基准，β<1表示波动小于基准。"
              />
            </div>
          )}

          <div className={METRIC_GRID_CLASS}>
            <MetricCard
              label="年化收益率"
              value={formatPercent(performanceMetrics.annualizedReturn, 2, true)}
              valueClass={getValueClass(performanceMetrics.annualizedReturn)}
              helpTitle="年化收益率"
              helpDesc="将累计收益按持有时间年化后的收益率，便于不同周期比较"
            />
            <MetricCard
              label="持仓天数"
              value={`${performanceMetrics.holdingDays}天`}
              helpTitle="持仓天数"
              helpDesc="从最早买入资产至今的持仓天数"
            />
            <MetricCard
              label="最大连涨/连跌"
              value={
                <span>
                  <span className="text-red-500">{performanceMetrics.gain}天</span>
                  <span className="mx-1 text-gray-300">/</span>
                  <span className="text-green-500">{performanceMetrics.loss}天</span>
                </span>
              }
              helpTitle="最大连涨/连跌"
              helpDesc="收益净值连续上涨/下跌的最大天数，反映趋势持续性"
            />
          </div>

          <div className={METRIC_GRID_CLASS}>
            <MetricCard
              label="波动率"
              value={formatPercent(performanceMetrics.volatility, 2)}
              helpTitle="波动率"
              helpDesc="收益净值日收益率的年化标准差，衡量波动程度"
            />
            <MetricCard
              label="夏普比率"
              value={performanceMetrics.sharpeRatio.toFixed(2)}
              helpTitle="夏普比率"
              helpDesc="(年化收益率 - 无风险利率) / 波动率，衡量风险调整后收益"
            />
            <MetricCard
              label="卡玛比率"
              value={performanceMetrics.calmarRatio.toFixed(2)}
              helpTitle="卡玛比率"
              helpDesc="年化收益率 / 最大回撤，衡量收益对最大回撤风险的补偿能力"
            />
          </div>
        </div>
      )}
    </div>
  );
}
