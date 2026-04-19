import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '../types';
import { calculatePortfolioSeries, clearPortfolioSeriesCache } from './portfolioSeries';

vi.mock('../api/adapters/eastmoney', () => ({
  getFundNavAll: vi.fn(),
  getFundNavHistory: vi.fn(),
  getFundNavOnDate: vi.fn(),
  getBenchmarkNavHistory: vi.fn(),
  BENCHMARK_CONFIGS: {
    none: { code: 'none', name: '无基准', secid: '', description: '不显示基准对比' },
    csi300: { code: 'csi300', name: '沪深300', secid: '1.000300', description: 'A股市场代表性指数' },
    shanghai: { code: 'shanghai', name: '上证指数', secid: '1.000001', description: '上海证券交易所综合指数' },
  },
}));

vi.mock('../api/adapters/stockHistory', () => ({
  getAStockKLine: vi.fn(),
  getHKStockKLine: vi.fn(),
  validateStockCode: vi.fn(),
}));

vi.mock('../api/adapters/tiantian', () => ({
  getFundQuote: vi.fn(),
}));

vi.mock('../api/adapters/exchange', () => ({
  getHistoricalExchangeRate: vi.fn().mockReturnValue(1),
  convertToCNY: vi.fn((amount: number) => amount),
  getCurrentExchangeRate: vi.fn().mockReturnValue(1),
}));

vi.mock('./dataCache', () => ({
  dataCache: {
    getByKey: vi.fn().mockResolvedValue(null),
    setByKey: vi.fn().mockResolvedValue(undefined),
    clearAll: vi.fn().mockResolvedValue(undefined),
  },
  initCache: vi.fn(),
}));

import { getFundNavAll } from '../api/adapters/eastmoney';
import { getAStockKLine, getHKStockKLine } from '../api/adapters/stockHistory';
import { getFundQuote } from '../api/adapters/tiantian';

const fixedHKData = [
  { date: '20200121', open: 340, close: 341.317, low: 339, high: 342, volume: 1000000 },
  { date: '20200122', open: 341.5, close: 342.5, low: 340.5, high: 343.5, volume: 1100000 },
  { date: '20200123', open: 342.5, close: 343.5, low: 341.5, high: 344.5, volume: 1200000 },
];

const fixedAStockData = [
  { date: '20200121', open: 843, close: 844.07, low: 842, high: 845, volume: 2000000 },
  { date: '20200122', open: 844.5, close: 845.5, low: 843.5, high: 846.5, volume: 2100000 },
  { date: '20200123', open: 845.5, close: 846.5, low: 844.5, high: 847.5, volume: 2200000 },
];

const fixedBondFundData = [
  { date: '2020-01-21', unitNav: 1.028, accumulatedNav: 1.028, changePercent: 0 },
  { date: '2020-01-22', unitNav: 1.029, accumulatedNav: 1.029, changePercent: 0.001 },
  { date: '2020-01-23', unitNav: 1.03, accumulatedNav: 1.03, changePercent: 0.001 },
];

const fixedSP500Data = [
  { date: '2020-01-21', unitNav: 2.1323, accumulatedNav: 2.1323, changePercent: 0 },
  { date: '2020-01-22', unitNav: 2.14, accumulatedNav: 2.14, changePercent: 0.0036 },
  { date: '2020-01-23', unitNav: 2.15, accumulatedNav: 2.15, changePercent: 0.0047 },
];

describe('Portfolio Data Consistency E2E Test', () => {
  const asset1Tencent: Asset = {
    id: 'asset-tencent',
    type: 'hk_stock',
    code: '00700',
    name: '腾讯控股',
    purchaseDate: '2020-01-21',
    purchasePrice: 341.317,
    quantity: 500,
    currency: 'HKD',
  };

  const asset2Moutai: Asset = {
    id: 'asset-moutai',
    type: 'a_stock',
    code: '600519',
    name: '贵州茅台',
    purchaseDate: '2020-01-21',
    purchasePrice: 844.07,
    quantity: 500,
    currency: 'CNY',
  };

  const asset3BondFund: Asset = {
    id: 'asset-bond',
    type: 'fund',
    code: '001235',
    name: '中银国有企业债A',
    purchaseDate: '2020-01-21',
    purchasePrice: 1.028,
    quantity: 300000,
    currency: 'CNY',
  };

  const asset4SP500: Asset = {
    id: 'asset-sp500',
    type: 'fund',
    code: '513500',
    name: '标普500ETF博时',
    purchaseDate: '2020-01-21',
    purchasePrice: 2.1323,
    quantity: 500000,
    currency: 'CNY',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearPortfolioSeriesCache();

    vi.mocked(getHKStockKLine).mockResolvedValue(fixedHKData.map(d => ({...d})));
    vi.mocked(getAStockKLine).mockResolvedValue(fixedAStockData.map(d => ({...d})));

    vi.mocked(getFundNavAll).mockImplementation((fundCode: string) => {
      if (fundCode === '001235') {
        return Promise.resolve(fixedBondFundData.map(d => ({...d})));
      }
      if (fundCode === '513500') {
        return Promise.resolve(fixedSP500Data.map(d => ({...d})));
      }
      return Promise.resolve([]);
    });
  });

  it('should maintain data consistency across add/refresh/delete/re-add operations', async () => {
    const assetsStep1 = [asset1Tencent, asset2Moutai, asset3BondFund];

    vi.mocked(getFundQuote).mockImplementation((code: string) => {
      if (code === '001235') {
        return Promise.resolve({
          fundcode: '001235',
          name: '中银国有企业债A',
          dwjz: '1.028',
          jzrq: '2020-01-21',
        });
      }
      if (code === '513500') {
        return Promise.resolve({
          fundcode: '513500',
          name: '标普500ETF博时',
          dwjz: '2.1323',
          jzrq: '2020-01-21',
        });
      }
      return Promise.resolve(null);
    });

    const result1 = await calculatePortfolioSeries(assetsStep1, false);

    const v1 = result1.performance[result1.performance.length - 1]?.nav;
    const data1 = {
      scale: result1.scale,
      performance: result1.performance,
      lastScalePoint: result1.scale[result1.scale.length - 1],
      lastPerformancePoint: result1.performance[result1.performance.length - 1],
    };

    expect(v1).toBeDefined();
    expect(data1.scale.length).toBeGreaterThan(0);
    expect(data1.performance.length).toBeGreaterThan(0);

    clearPortfolioSeriesCache();

    const result2 = await calculatePortfolioSeries(assetsStep1, true);
    const v2 = result2.performance[result2.performance.length - 1]?.nav;
    const data2 = {
      scale: result2.scale,
      performance: result2.performance,
      lastScalePoint: result2.scale[result2.scale.length - 1],
      lastPerformancePoint: result2.performance[result2.performance.length - 1],
    };

    expect(v2).toBeCloseTo(v1 as number, 5);
    expect(data2.scale.length).toBe(data1.scale.length);
    expect(data2.performance.length).toBe(data1.performance.length);

    for (let i = 0; i < data1.scale.length; i++) {
      expect(data2.scale[i].date).toBe(data1.scale[i].date);
      expect(data2.scale[i].totalValueCNY).toBeCloseTo(data1.scale[i].totalValueCNY, 6);
      expect(data2.scale[i].totalCostCNY).toBeCloseTo(data1.scale[i].totalCostCNY, 6);
      expect(data2.scale[i].floatingPnLCNY).toBeCloseTo(data1.scale[i].floatingPnLCNY, 6);
      expect(data2.scale[i].floatingReturnRate).toBeCloseTo(data1.scale[i].floatingReturnRate, 6);
    }

    for (let i = 0; i < data1.performance.length; i++) {
      expect(data2.performance[i].date).toBe(data1.performance[i].date);
      expect(data2.performance[i].nav).toBeCloseTo(data1.performance[i].nav, 6);
      expect(data2.performance[i].returnRate).toBeCloseTo(data1.performance[i].returnRate, 6);
      expect(data2.performance[i].portfolioValueCNY).toBeCloseTo(data1.performance[i].portfolioValueCNY, 6);
    }

    const assetsStep3 = [...assetsStep1, asset4SP500];

    clearPortfolioSeriesCache();
    const result3 = await calculatePortfolioSeries(assetsStep3, true);
    const v3 = result3.performance[result3.performance.length - 1]?.nav;
    const data3 = {
      scale: result3.scale,
      performance: result3.performance,
      lastScalePoint: result3.scale[result3.scale.length - 1],
      lastPerformancePoint: result3.performance[result3.performance.length - 1],
    };

    expect(v3).toBeDefined();
    expect(data3.lastScalePoint.totalCostCNY).toBeGreaterThan(data1.lastScalePoint.totalCostCNY);

    const assetsStep4 = assetsStep1;

    clearPortfolioSeriesCache();
    const result4 = await calculatePortfolioSeries(assetsStep4, true);
    const v4 = result4.performance[result4.performance.length - 1]?.nav;
    const data4 = {
      scale: result4.scale,
      performance: result4.performance,
      lastScalePoint: result4.scale[result4.scale.length - 1],
      lastPerformancePoint: result4.performance[result4.performance.length - 1],
    };

    expect(v4).toBeCloseTo(v1 as number, 5);
    expect(data4.scale.length).toBe(data1.scale.length);
    expect(data4.performance.length).toBe(data1.performance.length);

    for (let i = 0; i < data1.scale.length; i++) {
      expect(data4.scale[i].date).toBe(data1.scale[i].date);
      expect(data4.scale[i].totalValueCNY).toBeCloseTo(data1.scale[i].totalValueCNY, 6);
      expect(data4.scale[i].totalCostCNY).toBeCloseTo(data1.scale[i].totalCostCNY, 6);
      expect(data4.scale[i].floatingPnLCNY).toBeCloseTo(data1.scale[i].floatingPnLCNY, 6);
      expect(data4.scale[i].floatingReturnRate).toBeCloseTo(data1.scale[i].floatingReturnRate, 6);
    }

    for (let i = 0; i < data1.performance.length; i++) {
      expect(data4.performance[i].date).toBe(data1.performance[i].date);
      expect(data4.performance[i].nav).toBeCloseTo(data1.performance[i].nav, 6);
      expect(data4.performance[i].returnRate).toBeCloseTo(data1.performance[i].returnRate, 6);
      expect(data4.performance[i].portfolioValueCNY).toBeCloseTo(data1.performance[i].portfolioValueCNY, 6);
    }

    const assetsStep5 = [...assetsStep1, asset4SP500];

    clearPortfolioSeriesCache();
    const result5 = await calculatePortfolioSeries(assetsStep5, true);
    const v5 = result5.performance[result5.performance.length - 1]?.nav;
    const data5 = {
      scale: result5.scale,
      performance: result5.performance,
      lastScalePoint: result5.scale[result5.scale.length - 1],
      lastPerformancePoint: result5.performance[result5.performance.length - 1],
    };

    expect(v5).toBeCloseTo(v3 as number, 5);
    expect(data5.scale.length).toBe(data3.scale.length);
    expect(data5.performance.length).toBe(data3.performance.length);

    for (let i = 0; i < data3.scale.length; i++) {
      expect(data5.scale[i].date).toBe(data3.scale[i].date);
      expect(data5.scale[i].totalValueCNY).toBeCloseTo(data3.scale[i].totalValueCNY, 6);
      expect(data5.scale[i].totalCostCNY).toBeCloseTo(data3.scale[i].totalCostCNY, 6);
      expect(data5.scale[i].floatingPnLCNY).toBeCloseTo(data3.scale[i].floatingPnLCNY, 6);
      expect(data5.scale[i].floatingReturnRate).toBeCloseTo(data3.scale[i].floatingReturnRate, 6);
    }

    for (let i = 0; i < data3.performance.length; i++) {
      expect(data5.performance[i].date).toBe(data3.performance[i].date);
      expect(data5.performance[i].nav).toBeCloseTo(data3.performance[i].nav, 6);
      expect(data5.performance[i].returnRate).toBeCloseTo(data3.performance[i].returnRate, 6);
      expect(data5.performance[i].portfolioValueCNY).toBeCloseTo(data3.performance[i].portfolioValueCNY, 6);
    }
  });

  it('keeps the latest fund value stable when repeated refreshes alternate between quote success and timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-23T12:00:00Z'));

    try {
      const singleFundAsset: Asset = {
        id: 'asset-fund-refresh',
        type: 'fund',
        code: '001235',
        name: '中银国有企业债A',
        purchaseDate: '2020-01-21',
        purchasePrice: 1,
        quantity: 100,
        currency: 'CNY',
      };

      vi.mocked(getFundNavAll).mockResolvedValue([
        { date: '2020-01-21', unitNav: 1, accumulatedNav: 1, changePercent: 0 },
        { date: '2020-01-22', unitNav: 1.02, accumulatedNav: 1.02, changePercent: 0.02 },
      ]);

      vi.mocked(getFundQuote)
        .mockResolvedValueOnce({
          fundcode: '001235',
          name: '中银国有企业债A',
          dwjz: '1.02',
          jzrq: '2020-01-22',
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          fundcode: '001235',
          name: '中银国有企业债A',
          dwjz: '1.02',
          jzrq: '2020-01-22',
        });

      clearPortfolioSeriesCache();
      const firstResult = await calculatePortfolioSeries([singleFundAsset], true);

      clearPortfolioSeriesCache();
      const secondResult = await calculatePortfolioSeries([singleFundAsset], true);

      clearPortfolioSeriesCache();
      const thirdResult = await calculatePortfolioSeries([singleFundAsset], true);

      expect(firstResult.scale[firstResult.scale.length - 1]?.totalValueCNY).toBeCloseTo(102, 6);
      expect(secondResult.scale[secondResult.scale.length - 1]?.totalValueCNY).toBeCloseTo(102, 6);
      expect(thirdResult.scale[thirdResult.scale.length - 1]?.totalValueCNY).toBeCloseTo(102, 6);
      expect(firstResult.performance[firstResult.performance.length - 1]?.nav).toBeCloseTo(102, 6);
      expect(secondResult.performance[secondResult.performance.length - 1]?.nav).toBeCloseTo(102, 6);
      expect(thirdResult.performance[thirdResult.performance.length - 1]?.nav).toBeCloseTo(102, 6);
    } finally {
      vi.useRealTimers();
    }
  });
});
