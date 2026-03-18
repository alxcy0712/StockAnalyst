import { useEffect, useRef, useState, useMemo } from 'react';
import * as echarts from 'echarts';
import type { ECharts } from 'echarts';
import dayjs from 'dayjs';
import { HelpCircle, RefreshCw } from 'lucide-react';
import { useAssetStore } from '../stores/assetStore';
import { useThemeStore } from '../stores/themeStore';
import { useBenchmarkStore } from '../stores/benchmarkStore';
import { api } from '../api';
import type { NavPoint, Asset, KLineData, BenchmarkNavPoint, BenchmarkIndex } from '../types';
import { calculateVolatility, calculateSharpeRatio, calculateMaxConsecutive, calculateAnnualizedReturn } from '../utils/calculator';
import { getHistoricalExchangeRate, convertToCNY } from '../api/adapters/exchange';
import { dataCache, initCache } from '../utils/dataCache';

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

export function NavChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ECharts | null>(null);
  const assets = useAssetStore((state) => state.assets);
  const { isDark } = useThemeStore();
  const { selectedBenchmark, setBenchmark } = useBenchmarkStore();
  const [navData, setNavData] = useState<NavPoint[]>([]);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkNavPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // 初始化缓存
  useEffect(() => {
    initCache();
  }, []);
  // Metrics for overview cards
  const metrics = useMemo(() => {
    if (!navData || navData.length < 2) return null;
    const first = navData[0];
    const last = navData[navData.length - 1];
    // 计算所有资产的总成本（统一转换为人民币），而不是只使用第一天的成本
    const totalCost = assets.reduce((sum, asset) => {
      const cost = asset.purchasePrice * asset.quantity;
      const rate = getHistoricalExchangeRate(asset.purchaseDate);
      return sum + convertToCNY(cost, asset.currency, rate);
    }, 0);
    const totalValue = last.totalValueCNY;
    const totalReturn = (totalValue - totalCost) / totalCost;
    const ann = calculateAnnualizedReturn(totalReturn, first.date, last.date);
    const vol = calculateVolatility(navData);
    const sh = calculateSharpeRatio(navData, 0.03);
    const { gain, loss } = calculateMaxConsecutive(navData);
    // 计算持股天数：从最早的购买日期到今天
    const holdingDays = assets.length > 0
      ? dayjs().diff(dayjs(Math.min(...assets.map(a => dayjs(a.purchaseDate).valueOf()))), 'day')
      : 0;
    // 计算最大回撤
    const maxDrawdown = calculateMaxDrawdown(navData);
    // 计算卡玛比率 = 年化收益率 / |最大回撤|
    const calmar = maxDrawdown > 0 ? ann / maxDrawdown : 0;
    return { totalCost, totalValue, totalReturn, ann, vol, sh, gain, loss, holdingDays, maxDrawdown, calmar };
  }, [navData, assets]);

  // 当资产或周期变化时重新获取数据
  useEffect(() => {
    // 清理旧的图表实例
    if (chartInstance.current) {
      chartInstance.current.dispose();
      chartInstance.current = null;
    }

    if (assets.length === 0) {
      setNavData([]);
      return;
    }

    const fetchData = async (forceRefresh: boolean = false) => {
      setLoading(true);
      try {
        const navHistory = await calculatePortfolioNavHistory(assets, forceRefresh);
        setNavData(navHistory);

        if (selectedBenchmark !== 'none' && navHistory.length > 0) {
          const startDate = navHistory[0].date.replace(/-/g, '');
          const endDate = navHistory[navHistory.length - 1].date.replace(/-/g, '');
          const benchmarkNav = await api.benchmark.getNavHistory(selectedBenchmark, startDate, endDate);
          setBenchmarkData(benchmarkNav);
        } else {
          setBenchmarkData([]);
        }
      } catch (error) {
        console.error('Error calculating data:', error);
      }
      setLoading(false);
    };

    fetchData();
  }, [assets, refreshKey, selectedBenchmark]);

  // 刷新数据
  const handleRefresh = async () => {
    await dataCache.clearAll();
    setRefreshKey(prev => prev + 1);
  };

  const benchmarkComparison = useMemo(() => {
    if (!navData.length || !benchmarkData.length) return null;
    const portfolioReturn = navData[navData.length - 1].returnRate;
    const benchmarkReturn = benchmarkData[benchmarkData.length - 1].returnRate;
    const alpha = portfolioReturn - benchmarkReturn;
    return { portfolioReturn, benchmarkReturn, alpha };
  }, [navData, benchmarkData]);

  useEffect(() => {
    if (!chartRef.current) return;
    if (navData.length === 0) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const colors = {
      line: isDark ? '#60a5fa' : '#2563eb',
      lineArea: isDark
        ? ['rgba(96, 165, 250, 0.3)', 'rgba(96, 165, 250, 0.02)']
        : ['rgba(37, 99, 235, 0.15)', 'rgba(37, 99, 235, 0)'],
      benchmarkLine: isDark ? '#94a3b8' : '#64748b',
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
          const data = params[0];
          const navPoint = navData[data.dataIndex];
          return `
            <div style="font-weight: 600; margin-bottom: 4px;">${data.name}</div>
            <div>总资产: <span style="font-weight: 600;">¥${data.value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            <div>收益率: <span style="font-weight: 600; color: ${navPoint?.returnRate >= 0 ? '#ef4444' : '#22c55e'}">${(navPoint?.returnRate || 0) >= 0 ? '+' : ''}${((navPoint?.returnRate || 0) * 100).toFixed(2)}%</span></div>
          `;
        },
      },
      xAxis: {
        type: 'category',
        data: navData.map((d) => d.date),
        axisLine: { lineStyle: { color: colors.axisLine } },
        axisLabel: { color: colors.text, rotate: 45 },
      },
      yAxis: {
        type: 'value',
        name: '总资产 (CNY)',
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
            name: '总资产',
            type: 'line',
            data: navData.map((d) => d.totalValueCNY),
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

        if (benchmarkData.length > 0 && navData.length > 0) {
          const initialValue = navData[0].totalValueCNY;
          const benchmarkSeries = navData.map((d) => {
            const benchmarkPoint = benchmarkData.find((b) => b.date === d.date);
            if (benchmarkPoint) {
              return initialValue * (benchmarkPoint.nav / 100);
            }
            return null;
          });

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
  }, [navData, benchmarkData, isDark, selectedBenchmark]);

  // 饼图分配逻辑放在 App 端实现

  if (assets.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800/30 rounded-2xl p-12 text-center">
        <p className="text-gray-400 dark:text-gray-500 text-sm">添加资产后将在此显示净值走势</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            总资产走势
          </h3>
          <select
            value={selectedBenchmark}
            onChange={(e) => setBenchmark(e.target.value as BenchmarkIndex)}
            className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-none outline-none cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <option value="none">无基准</option>
            <option value="csi300">沪深300</option>
            <option value="shanghai">上证指数</option>
          </select>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="刷新数据"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-80 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-white"></div>
        </div>
      ) : (
        <div ref={chartRef} className="h-72 w-full" />
      )}
      
      {metrics && (
        <div className="space-y-2 mt-5">
          <div className="grid grid-cols-3 gap-2">
            <MetricCard
              label="最新总资产"
              value={`¥${metrics.totalValue.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              subValue={`总成本 ¥${metrics.totalCost.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              helpTitle="最新总资产"
              helpDesc="当前投资组合的总市值，基于最新价格计算"
            />
            <MetricCard
              label="累计收益"
              value={`${(metrics.totalReturn * 100).toFixed(2)}%`}
              valueClass={metrics.totalReturn >= 0 ? 'text-red-500' : 'text-green-500'}
              helpTitle="累计收益"
              helpDesc="(当前总资产 - 总成本) / 总成本 × 100%"
            />
            <MetricCard
              label="最大回撤"
              value={`${(metrics.maxDrawdown * 100).toFixed(2)}%`}
              valueClass="text-green-500"
              helpTitle="最大回撤"
              helpDesc="从历史最高点到最低点的最大跌幅，衡量投资风险"
            />
          </div>

          {benchmarkComparison && selectedBenchmark !== 'none' && (
            <div className="grid grid-cols-3 gap-2">
              <MetricCard
                label={`${api.benchmark.configs[selectedBenchmark].name}收益`}
                value={`${(benchmarkComparison.benchmarkReturn * 100).toFixed(2)}%`}
                valueClass={benchmarkComparison.benchmarkReturn >= 0 ? 'text-red-500' : 'text-green-500'}
                helpTitle="基准收益"
                helpDesc={`${api.benchmark.configs[selectedBenchmark].name}在同一投资周期的累计收益率`}
              />
              <MetricCard
                label="超额收益 (Alpha)"
                value={`${benchmarkComparison.alpha >= 0 ? '+' : ''}${(benchmarkComparison.alpha * 100).toFixed(2)}%`}
                valueClass={benchmarkComparison.alpha >= 0 ? 'text-red-500' : 'text-green-500'}
                helpTitle="超额收益"
                helpDesc="组合收益减去基准收益，正值表示跑赢大盘，负值表示跑输大盘"
              />
              <MetricCard
                label="相对表现"
                value={benchmarkComparison.alpha >= 0 ? '跑赢' : '跑输'}
                valueClass={benchmarkComparison.alpha >= 0 ? 'text-red-500' : 'text-green-500'}
                helpTitle="相对表现"
                helpDesc="相对于基准指数的整体表现评价"
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <MetricCard
              label="年化收益率"
              value={`${(metrics.ann * 100).toFixed(2)}%`}
              helpTitle="年化收益率"
              helpDesc="将累计收益按持有时间年化后的收益率，便于不同投资周期比较"
            />
            <MetricCard
              label="持股天数"
              value={`${metrics.holdingDays}天`}
              helpTitle="持股天数"
              helpDesc="从最早购买资产到今天持有的总天数"
            />
            <MetricCard
              label="最大连涨/连跌"
              value={
                <span>
                  <span className="text-red-500">{metrics.gain}天</span>
                  <span className="mx-1 text-gray-300">/</span>
                  <span className="text-green-500">{metrics.loss}天</span>
                </span>
              }
              helpTitle="最大连涨/连跌"
              helpDesc="连续上涨/下跌的最大天数，反映趋势持续性"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MetricCard
              label="波动率"
              value={`${(metrics.vol * 100).toFixed(2)}%`}
              helpTitle="波动率"
              helpDesc="收益率的标准差，衡量投资组合的价格波动程度"
            />
            <MetricCard
              label="夏普比率"
              value={metrics.sh.toFixed(2)}
              helpTitle="夏普比率"
              helpDesc="(年化收益率 - 无风险利率) / 波动率，衡量风险调整后的收益，>1表示较好"
            />
            <MetricCard
              label="卡玛比率"
              value={metrics.calmar.toFixed(2)}
              helpTitle="卡玛比率"
              helpDesc="年化收益率 / 最大回撤，衡量每承担1%最大回撤获得的收益，>1表示收益能覆盖风险"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// 二分查找最近的交易日价格
function findNearestPriceBinary(
  targetDate: string,
  tradingDays: string[],
  history: Map<string, number>,
  assetPurchaseDate: string,
  purchasePrice: number
): number {
  // 如果目标日期早于购买日期，返回购买价格
  if (targetDate < assetPurchaseDate) {
    return purchasePrice;
  }

  // 二分查找小于等于目标日期的最大交易日
  let left = 0;
  let right = tradingDays.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (tradingDays[mid] <= targetDate) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  if (result >= 0) {
    return history.get(tradingDays[result])!;
  }

  // 如果没找到，返回购买价格
  return purchasePrice;
}

// 计算组合历史净值（日线）
async function calculatePortfolioNavHistory(assets: Asset[], forceRefresh: boolean = false): Promise<NavPoint[]> {
  const navPoints: NavPoint[] = [];
  const today = dayjs().format('YYYY-MM-DD');

  // 找到最早的购买日期
  const earliestDate = assets.reduce((earliest, asset) => {
    return asset.purchaseDate < earliest ? asset.purchaseDate : earliest;
  }, assets[0]?.purchaseDate || today);

  // 获取所有交易日日期列表（包括所有自然日，不只是交易日）
  const allDays = getAllDays(earliestDate, today);

  // 并行获取每个资产的历史价格数据（带缓存）
  const assetHistories: Record<string, Map<string, number>> = {};

  // 1. 先尝试从缓存获取（使用 'nav' 类型缓存）
  const cachePromises = assets.map(async (asset) => {
    if (!forceRefresh) {
      const cached = await dataCache.get(asset.id, asset, 'nav');
      if (cached) {
        return { asset, data: cached, fromCache: true };
      }
    }
    return { asset, data: null, fromCache: false };
  });

  const cacheResults = await Promise.all(cachePromises);

  // 2. 需要获取的资产（未命中缓存或强制刷新）
  const needFetch = cacheResults.filter(r => !r.fromCache);

  // 3. 并行获取未缓存的数据
  const fetchPromises = needFetch.map(async ({ asset }) => {
    try {
      const history = new Map<string, number>();

      if (asset.type === 'fund') {
        // 基金：用日增长率累乘计算"调整后净值"
        const fundHist = await api.fund.getNavAll(asset.code, asset.purchaseDate);
        
        // 按日期排序（从早到晚），确保正确累乘
        const sortedHist = [...fundHist].sort((a, b) => a.date.localeCompare(b.date));
        
        // 买入日单位净值作为基准
        const baseNav = asset.purchasePrice;
        let adjustedNav = baseNav;
        
        sortedHist.forEach((entry: { date: string; changePercent: number }) => {
          let date = entry.date;
          if (date.includes('/')) {
            date = date.replace(/\//g, '-');
          } else if (!date.includes('-')) {
            date = date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
          }
          
          if (date === asset.purchaseDate) {
            adjustedNav = baseNav;
            history.set(date, adjustedNav);
          } else {
            const changePercent = entry.changePercent || 0;
            adjustedNav = adjustedNav * (1 + changePercent);
            history.set(date, adjustedNav);
          }
        });

        // 添加当前净值
        const fundData = await api.fund.getQuote(asset.code);
        if (fundData) {
          const latestHist = await api.fund.getNavHistory(asset.code, fundData.jzrq, fundData.jzrq);
          if (latestHist.length > 0) {
            const latestChange = latestHist[0].changePercent || 0;
            adjustedNav = adjustedNav * (1 + latestChange);
          }
          history.set(fundData.jzrq, adjustedNav);
          history.set(today, adjustedNav);
        }
      } else {
        // 股票：使用东方财富API获取K线数据
        let klineData: KLineData[] = [];
        const startDate = asset.purchaseDate.replace(/-/g, '');
        const endDate = today.replace(/-/g, '');
        
        if (asset.type === 'a_stock') {
          klineData = await api.stock.getAStockKLineEastmoney(asset.code, 'day', startDate, endDate);
        } else {
          klineData = await api.stock.getHKStockKLineEastmoney(asset.code, 'day', startDate, endDate);
        }

        klineData.forEach((item) => {
          let date = item.date;
          if (!date.includes('-')) {
            date = date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
          }
          history.set(date, item.close);
        });
      }

      // 缓存获取的数据（使用 'nav' 类型缓存）
      await dataCache.set(asset.id, Array.from(history.entries()), asset, 'nav');
      return { assetId: asset.id, history, success: true };
    } catch (error) {
      console.error(`Error fetching history for ${asset.code}:`, error);
      const fallback = new Map<string, number>();
      fallback.set(asset.purchaseDate, asset.purchasePrice);
      fallback.set(today, asset.purchasePrice);
      return { assetId: asset.id, history: fallback, success: false };
    }
  });

  const fetchResults = await Promise.all(fetchPromises);

  // 4. 合并缓存和获取的结果
  cacheResults.forEach((result) => {
    if (result.fromCache && result.data) {
      // 从缓存恢复Map
      const history = new Map<string, number>(result.data);
      assetHistories[result.asset.id] = history;
    }
  });

  fetchResults.forEach((result) => {
    if (result.success || result.history) {
      assetHistories[result.assetId] = result.history;
    }
  });

  // 获取当前汇率
  const currentRate = await api.exchange.getCurrentRate();

  // 优化1: 预计算每个资产的购入成本（只计算一次）
  const assetCostCache = new Map<string, number>();
  assets.forEach(asset => {
    const costBasis = asset.purchasePrice * asset.quantity;
    const purchaseRate = api.exchange.getHistoricalRate(asset.purchaseDate);
    const purchaseCostCNY = api.exchange.convertToCNY(costBasis, asset.currency, purchaseRate);
    assetCostCache.set(asset.id, purchaseCostCNY);
  });

  // 优化2: 预计算每个资产的有序交易日列表（用于二分查找）
  const assetTradingDays = new Map<string, string[]>();
  Object.entries(assetHistories).forEach(([assetId, history]) => {
    const sortedDays = Array.from(history.keys()).sort();
    assetTradingDays.set(assetId, sortedDays);
  });

  // 计算每一天的净值
  for (const date of allDays) {
    let totalCostCNY = 0;
    let totalValueCNY = 0;
    let hasAnyAsset = false;
    const currentDate = dayjs(date).format('YYYY-MM-DD');

    for (const asset of assets) {
      // 确保日期比较使用相同的格式
      const assetPurchaseDate = dayjs(asset.purchaseDate).format('YYYY-MM-DD');
      
      if (currentDate < assetPurchaseDate) continue;
      
      hasAnyAsset = true;

      // 优化3: 使用预计算的购入成本
      totalCostCNY += assetCostCache.get(asset.id)!;

      const history = assetHistories[asset.id];
      let price = asset.purchasePrice;

      if (history && history.size > 0) {
        // 首先尝试直接获取该日期的价格
        if (history.has(currentDate)) {
          price = history.get(currentDate)!;
        } else {
          // 优化4: 使用二分查找找最近的有效交易日
          const tradingDays = assetTradingDays.get(asset.id)!;
          price = findNearestPriceBinary(currentDate, tradingDays, history, assetPurchaseDate, asset.purchasePrice);
        }
      }
      // 如果没有历史数据，使用购买价格

      const valueCNY = api.exchange.convertToCNY(
        price * asset.quantity,
        asset.currency,
        currentRate
      );
      totalValueCNY += valueCNY;
    }

    if (hasAnyAsset && totalCostCNY > 0) {
      const nav = (totalValueCNY / totalCostCNY) * 100;
      const returnRate = (totalValueCNY - totalCostCNY) / totalCostCNY;

      navPoints.push({ date: currentDate, totalValueCNY, totalCostCNY, nav, returnRate });
    }
  }

  return navPoints;
}

// 获取所有日期（自然日）
function getAllDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  let current = dayjs(startDate);
  const end = dayjs(endDate);

  while (current.isBefore(end) || current.isSame(end)) {
    days.push(current.format('YYYY-MM-DD'));
    current = current.add(1, 'day');
  }

  return days;
}

// 计算最大回撤（基于总资产）
function calculateMaxDrawdown(navHistory: NavPoint[]): number {
  let maxDrawdown = 0;
  let peak = navHistory[0]?.totalValueCNY || 0;

  for (const point of navHistory) {
    if (point.totalValueCNY > peak) {
      peak = point.totalValueCNY;
    } else {
      const drawdown = (peak - point.totalValueCNY) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
  }

  return maxDrawdown;
}
