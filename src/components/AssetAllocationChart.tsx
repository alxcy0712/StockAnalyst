import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useAssetStore } from '../stores/assetStore';
import { useThemeStore } from '../stores/themeStore';
import { getHistoricalExchangeRate, convertToCNY } from '../api/adapters/exchange';

// Colorful palette - light mode
const CHART_COLORS = [
  '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6',
  '#ef4444', '#06b6d4', '#f97316', '#84cc16',
  '#ec4899', '#6366f1'
];

// Colorful palette - dark mode (slightly brighter for dark backgrounds)
const CHART_COLORS_DARK = [
  '#60a5fa', '#fbbf24', '#34d399', '#a78bfa',
  '#f87171', '#22d3ee', '#fb923c', '#a3e635',
  '#f472b6', '#818cf8'
];

export function AssetAllocationChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const assets = useAssetStore((state) => state.assets);
  const { isDark } = useThemeStore();

  // Get the appropriate color palette based on theme
  const chartColors = isDark ? CHART_COLORS_DARK : CHART_COLORS;

  useEffect(() => {
    if (assets.length === 0) {
      chartInstance.current?.dispose();
      chartInstance.current = null;
      return;
    }
    if (!chartRef.current) return;
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
        backgroundColor: isDark ? 'rgba(44, 44, 46, 0.72)' : 'rgba(255, 255, 255, 0.72)',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: isDark ? '#f5f5f7' : '#1d1d1f',
          fontSize: 13,
          fontWeight: 400,
        },
        extraCssText: `
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          box-shadow: 0 4px 24px ${isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.08)'};
          border-radius: 10px;
        `,
        formatter: (params: any) => {
          const name = params.name || '';
          const value = Number(params.value) || 0;
          const percent = params.percent || 0;
          return `<div style="font-weight:510;margin-bottom:2px">${name}</div><div style="color:${isDark ? '#a1a1a6' : '#6e6e73'};font-size:12px">¥${value.toLocaleString('zh-CN')} · ${percent.toFixed(1)}%</div>`;
        }
      },
      legend: { show: false },
      series: [
        {
          type: 'pie',
          radius: ['48%', '75%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 4,
            borderColor: isDark ? '#1c1c1e' : '#ffffff',
            borderWidth: 1.5,
          },
          label: { show: false },
          labelLine: { show: false },
          data: data.map((d, index) => ({
            ...d,
            value: d.value,
            itemStyle: {
              color: chartColors[index % chartColors.length],
            }
          })),
          emphasis: {
            scale: true,
            scaleSize: 6,
            itemStyle: {
              shadowBlur: 20,
              shadowOffsetX: 0,
              shadowColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
            }
          },
          animationType: 'scale',
          animationEasing: 'cubicOut',
          animationDelay: function () {
            return Math.random() * 200;
          },
        },
      ],
      color: chartColors,
    };

    chartInstance.current.setOption(option, true);

    const onResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [assets, isDark, chartColors]);

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
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mt-3">
        {assetsWithCNYCost.map((a, idx) => {
          const color = chartColors[idx % chartColors.length];
          const displayName = a.name.length > 10 ? a.name.slice(0, 10) + '…' : a.name;
          const pct = totalCost > 0 ? (a.costCNY / totalCost) * 100 : 0;
          return (
            <span
              key={a.id}
              className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
            >
              <span
                className="rounded-full flex-shrink-0"
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  backgroundColor: color,
                }}
              />
              <span className="truncate max-w-[80px]" title={a.name}>{displayName}</span>
              <span className="text-gray-400 dark:text-gray-500 font-medium">{pct.toFixed(1)}%</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default AssetAllocationChart;
