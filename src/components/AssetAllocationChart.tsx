import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useAssetStore } from '../stores/assetStore';
import { useThemeStore } from '../stores/themeStore';
import { getHistoricalExchangeRate, convertToCNY } from '../api/adapters/exchange';

const CHART_COLORS = [
  '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#84cc16', '#6366f1', '#14b8a6'
];

export function AssetAllocationChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const assets = useAssetStore((state) => state.assets);
  const { isDark } = useThemeStore();

  useEffect(() => {
    if (!chartRef.current) return;
    if (assets.length === 0) {
      chartInstance.current?.dispose();
      chartInstance.current = null;
      return;
    }
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const assetsWithCNYCost = assets.map(asset => {
      const cost = asset.purchasePrice * asset.quantity;
      const rate = getHistoricalExchangeRate(asset.purchaseDate);
      const costCNY = convertToCNY(cost, asset.currency, rate);
      return { ...asset, costCNY };
    });

    const data = assetsWithCNYCost.map((a) => ({ name: a.name, value: a.costCNY }));

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'item',
        backgroundColor: isDark ? 'rgba(28, 28, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        borderWidth: 1,
        textStyle: {
          color: isDark ? '#f5f5f7' : '#1d1d1f',
          fontSize: 12,
        },
        formatter: (params: any) => {
          const name = params.name || '';
          const value = Number(params.value) || 0;
          const percent = params.percent || 0;
          return `<div style="font-weight:500">${name}</div><div>¥${value.toLocaleString('zh-CN')} (${percent.toFixed(1)}%)</div>`;
        }
      },
      legend: { show: false },
      series: [
        {
          type: 'pie',
          radius: ['45%', '72%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 6,
            borderColor: isDark ? '#1c1c1e' : '#ffffff',
            borderWidth: 2,
          },
          label: { show: false },
          labelLine: { show: false },
          data: data.map((d) => ({ ...d, value: d.value })),
        },
      ],
      color: CHART_COLORS,
    };

    chartInstance.current.setOption(option, true);

    const onResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [assets, isDark]);

  if (assets.length === 0) {
    return (
      <div className="text-center text-gray-400 dark:text-gray-500 text-sm py-4">
        暂无资产，饼图将于添加资产后显示
      </div>
    );
  }

  const assetsWithCNYCost = assets.map(asset => {
    const cost = asset.purchasePrice * asset.quantity;
    const rate = getHistoricalExchangeRate(asset.purchaseDate);
    const costCNY = convertToCNY(cost, asset.currency, rate);
    return { ...asset, costCNY };
  });
  const totalCost = assetsWithCNYCost.reduce((sum, a) => sum + a.costCNY, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">资产配置</h3>
      </div>
      <div ref={chartRef} style={{ height: 140, width: '100%' }} />
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 mt-2">
        {assetsWithCNYCost.map((a, idx) => {
          const color = CHART_COLORS[idx % CHART_COLORS.length];
          const displayName = a.name.length > 10 ? a.name.slice(0, 10) + '…' : a.name;
          const pct = totalCost > 0 ? (a.costCNY / totalCost) * 100 : 0;
          return (
            <span key={a.id} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
              <span
                className="rounded-full"
                style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: color }}
              />
              <span className="truncate" style={{ maxWidth: 100 }}>{displayName}</span>
              <span className="text-gray-400 dark:text-gray-500">{pct.toFixed(1)}%</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default AssetAllocationChart;
