import { describe, expect, it } from 'vitest';

import type { Asset } from '../types';
import { buildPortfolioPerformanceSeries, buildPortfolioScaleSeries } from './portfolioSeries';

describe('buildPortfolioScaleSeries', () => {
  it('uses point-date FX for historical valuation', () => {
    const assets: Asset[] = [
      {
        id: 'hk-1',
        type: 'hk_stock',
        code: '00001',
        name: 'HK Asset',
        purchaseDate: '2024-01-10',
        purchasePrice: 100,
        quantity: 1,
        currency: 'HKD',
      },
    ];

    const histories = {
      'hk-1': new Map<string, number>([
        ['2024-01-10', 100],
        ['2024-09-10', 100],
      ]),
    };

    const series = buildPortfolioScaleSeries(assets, histories, {
      startDate: '2024-01-10',
      endDate: '2024-09-10',
    });

    const januaryPoint = series.find((point) => point.date === '2024-01-10');
    const septemberPoint = series.find((point) => point.date === '2024-09-10');

    expect(januaryPoint).toMatchObject({
      totalCostCNY: 92,
      totalValueCNY: 92,
      floatingPnLCNY: 0,
      floatingReturnRate: 0,
    });

    expect(septemberPoint).toMatchObject({
      totalCostCNY: 92,
      totalValueCNY: 90,
      floatingPnLCNY: -2,
      floatingReturnRate: -2 / 92,
    });
  });

  it('scale mode preserves contribution-driven step changes', () => {
    const assets: Asset[] = [
      {
        id: 'cny-1',
        type: 'fund',
        code: '000001',
        name: 'First Asset',
        purchaseDate: '2024-01-10',
        purchasePrice: 100,
        quantity: 1,
        currency: 'CNY',
      },
      {
        id: 'cny-2',
        type: 'fund',
        code: '000002',
        name: 'Second Asset',
        purchaseDate: '2024-01-12',
        purchasePrice: 200,
        quantity: 1,
        currency: 'CNY',
      },
    ];

    const histories = {
      'cny-1': new Map<string, number>([
        ['2024-01-10', 100],
        ['2024-01-11', 110],
        ['2024-01-12', 120],
      ]),
      'cny-2': new Map<string, number>([
        ['2024-01-12', 200],
        ['2024-01-13', 210],
      ]),
    };

    const series = buildPortfolioScaleSeries(assets, histories, {
      startDate: '2024-01-10',
      endDate: '2024-01-13',
    });

    expect(series).toEqual([
      {
        date: '2024-01-10',
        totalValueCNY: 100,
        totalCostCNY: 100,
        floatingPnLCNY: 0,
        floatingReturnRate: 0,
      },
      {
        date: '2024-01-11',
        totalValueCNY: 110,
        totalCostCNY: 100,
        floatingPnLCNY: 10,
        floatingReturnRate: 0.1,
      },
      {
        date: '2024-01-12',
        totalValueCNY: 320,
        totalCostCNY: 300,
        floatingPnLCNY: 20,
        floatingReturnRate: 20 / 300,
      },
      {
        date: '2024-01-13',
        totalValueCNY: 330,
        totalCostCNY: 300,
        floatingPnLCNY: 30,
        floatingReturnRate: 0.1,
      },
    ]);
  });

  it('scale mode matches legacy CNY-only behavior for same-day assets', () => {
    const assets: Asset[] = [
      {
        id: 'same-day-1',
        type: 'fund',
        code: '100001',
        name: 'Same Day One',
        purchaseDate: '2024-01-10',
        purchasePrice: 100,
        quantity: 1,
        currency: 'CNY',
      },
      {
        id: 'same-day-2',
        type: 'fund',
        code: '100002',
        name: 'Same Day Two',
        purchaseDate: '2024-01-10',
        purchasePrice: 50,
        quantity: 4,
        currency: 'CNY',
      },
    ];

    const histories = {
      'same-day-1': new Map<string, number>([
        ['2024-01-10', 100],
        ['2024-01-11', 105],
      ]),
      'same-day-2': new Map<string, number>([
        ['2024-01-10', 50],
        ['2024-01-11', 52],
      ]),
    };

    const series = buildPortfolioScaleSeries(assets, histories, {
      startDate: '2024-01-10',
      endDate: '2024-01-11',
    });

    expect(series).toEqual([
      {
        date: '2024-01-10',
        totalValueCNY: 300,
        totalCostCNY: 300,
        floatingPnLCNY: 0,
        floatingReturnRate: 0,
      },
      {
        date: '2024-01-11',
        totalValueCNY: 313,
        totalCostCNY: 300,
        floatingPnLCNY: 13,
        floatingReturnRate: 13 / 300,
      },
    ]);
  });
});

describe('buildPortfolioPerformanceSeries', () => {
  const assets: Asset[] = [
    {
      id: 'asset-1',
      type: 'a_stock',
      code: '000001',
      name: 'Asset 1',
      purchaseDate: '2024-01-01',
      purchasePrice: 100,
      quantity: 1,
      currency: 'CNY',
    },
    {
      id: 'asset-2',
      type: 'a_stock',
      code: '000002',
      name: 'Asset 2',
      purchaseDate: '2024-01-02',
      purchasePrice: 100,
      quantity: 1,
      currency: 'CNY',
    },
  ];

  it('performance mode neutralizes contribution-day jumps', () => {
    const scalePoints = [
      {
        date: '2024-01-01',
        totalValueCNY: 100,
        totalCostCNY: 100,
        floatingPnLCNY: 0,
        floatingReturnRate: 0,
      },
      {
        date: '2024-01-02',
        totalValueCNY: 220,
        totalCostCNY: 200,
        floatingPnLCNY: 20,
        floatingReturnRate: 0.1,
      },
    ];

    const series = buildPortfolioPerformanceSeries(assets, scalePoints);
    const contributionDay = series.find((point) => point.date === '2024-01-02');

    expect(contributionDay).toMatchObject({
      portfolioValueCNY: 200,
      contributionCNY: 100,
      unitsOutstanding: 200,
      nav: 100,
      returnRate: 0,
    });
  });

  it('performance mode starts at 100 on first investable day', () => {
    const scalePoints = [
      {
        date: '2024-01-01',
        totalValueCNY: 120,
        totalCostCNY: 100,
        floatingPnLCNY: 20,
        floatingReturnRate: 0.2,
      },
    ];

    const firstDayOnlyAssets = [assets[0]];
    const series = buildPortfolioPerformanceSeries(firstDayOnlyAssets, scalePoints);

    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({
      date: '2024-01-01',
      portfolioValueCNY: 100,
      contributionCNY: 100,
      unitsOutstanding: 100,
      nav: 100,
      returnRate: 0,
    });
  });

  it('performance mode uses market pricing only after purchase day', () => {
    const scalePoints = [
      {
        date: '2024-01-01',
        totalValueCNY: 100,
        totalCostCNY: 100,
        floatingPnLCNY: 0,
        floatingReturnRate: 0,
      },
      {
        date: '2024-01-02',
        totalValueCNY: 220,
        totalCostCNY: 200,
        floatingPnLCNY: 20,
        floatingReturnRate: 0.1,
      },
      {
        date: '2024-01-03',
        totalValueCNY: 240,
        totalCostCNY: 200,
        floatingPnLCNY: 40,
        floatingReturnRate: 0.2,
      },
    ];

    const series = buildPortfolioPerformanceSeries(assets, scalePoints);
    const postPurchaseDay = series.find((point) => point.date === '2024-01-03');

    expect(postPurchaseDay).toBeDefined();
    expect(postPurchaseDay?.portfolioValueCNY).toBe(240);
    expect(postPurchaseDay?.contributionCNY).toBe(0);
    expect(postPurchaseDay?.unitsOutstanding).toBe(200);
    expect(postPurchaseDay?.nav).toBeCloseTo(120, 10);
    expect(postPurchaseDay?.returnRate).toBeCloseTo(0.2, 10);
  });
});
