import { describe, expect, it } from 'vitest';
import type { Asset } from '../types';
import { buildPortfolioScaleSeries, buildPortfolioPerformanceSeries } from './portfolioSeries';

describe('buildPortfolioScaleSeries edge cases', () => {
  it('should calculate correctly for single asset on purchase day', () => {
    const assets: Asset[] = [
      {
        id: 'test-1',
        type: 'fund',
        code: '000001',
        name: 'Test Fund',
        purchaseDate: '2024-01-15',
        purchasePrice: 100,
        quantity: 10,
        currency: 'CNY',
      },
    ];

    const histories = {
      'test-1': new Map<string, number>([
        ['2024-01-15', 100],
        ['2024-01-16', 101],
        ['2024-01-17', 102],
      ]),
    };

    const result = buildPortfolioScaleSeries(assets, histories, {
      startDate: '2024-01-15',
      endDate: '2024-01-17',
    });

    expect(result).toHaveLength(3);
    
    // First day: purchase day
    expect(result[0]).toEqual({
      date: '2024-01-15',
      totalValueCNY: 1000,  // 100 * 10
      totalCostCNY: 1000,   // 100 * 10
      floatingPnLCNY: 0,
      floatingReturnRate: 0,
    });

    // Second day: price increased
    expect(result[1]).toEqual({
      date: '2024-01-16',
      totalValueCNY: 1010,  // 101 * 10
      totalCostCNY: 1000,
      floatingPnLCNY: 10,
      floatingReturnRate: 0.01,
    });

    // Third day
    expect(result[2]).toEqual({
      date: '2024-01-17',
      totalValueCNY: 1020,  // 102 * 10
      totalCostCNY: 1000,
      floatingPnLCNY: 20,
      floatingReturnRate: 0.02,
    });
  });

  it('should handle multiple assets with different purchase dates', () => {
    const assets: Asset[] = [
      {
        id: 'asset-1',
        type: 'fund',
        code: '000001',
        name: 'First Asset',
        purchaseDate: '2024-01-10',
        purchasePrice: 100,
        quantity: 1,
        currency: 'CNY',
      },
      {
        id: 'asset-2',
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
      'asset-1': new Map<string, number>([
        ['2024-01-10', 100],
        ['2024-01-11', 110],
        ['2024-01-12', 120],
      ]),
      'asset-2': new Map<string, number>([
        ['2024-01-12', 200],
        ['2024-01-13', 210],
      ]),
    };

    const result = buildPortfolioScaleSeries(assets, histories, {
      startDate: '2024-01-10',
      endDate: '2024-01-13',
    });

    expect(result).toEqual([
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
        totalValueCNY: 320,  // 120 + 200
        totalCostCNY: 300,   // 100 + 200
        floatingPnLCNY: 20,
        floatingReturnRate: 20 / 300,
      },
      {
        date: '2024-01-13',
        totalValueCNY: 330,  // 120 (stays same, no data) + 210
        totalCostCNY: 300,
        floatingPnLCNY: 30,
        floatingReturnRate: 0.1,
      },
    ]);
  });

  it('should handle assets added on same day correctly', () => {
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

    const result = buildPortfolioScaleSeries(assets, histories, {
      startDate: '2024-01-10',
      endDate: '2024-01-11',
    });

    // Total cost: 100*1 + 50*4 = 300
    // Day 1 value: 100 + 200 = 300
    // Day 2 value: 105 + 208 = 313
    expect(result).toEqual([
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

describe('buildPortfolioPerformanceSeries edge cases', () => {
  it('should calculate performance series correctly', () => {
    const assets: Asset[] = [
      {
        id: 'perf-test',
        type: 'fund',
        code: '000001',
        name: 'Perf Test',
        purchaseDate: '2024-01-01',
        purchasePrice: 100,
        quantity: 1,
        currency: 'CNY',
      },
    ];

    const scalePoints = [
      { date: '2024-01-01', totalValueCNY: 100, totalCostCNY: 100, floatingPnLCNY: 0, floatingReturnRate: 0 },
      { date: '2024-01-02', totalValueCNY: 110, totalCostCNY: 100, floatingPnLCNY: 10, floatingReturnRate: 0.1 },
      { date: '2024-01-03', totalValueCNY: 105, totalCostCNY: 100, floatingPnLCNY: 5, floatingReturnRate: 0.05 },
    ];

    const result = buildPortfolioPerformanceSeries(assets, scalePoints);

    expect(result).toHaveLength(3);
    
    // First day: NAV starts at 100
    expect(result[0].nav).toBe(100);
    expect(result[0].returnRate).toBe(0);
    
    expect(result[1].nav).toBeCloseTo(110, 10);
    expect(result[1].returnRate).toBeCloseTo(0.1, 10);
    expect(result[2].nav).toBeCloseTo(105, 10);
    expect(result[2].returnRate).toBeCloseTo(0.05, 10);
  });

  it('should handle multiple contributions correctly', () => {
    const assets: Asset[] = [
      {
        id: 'multi-1',
        type: 'fund',
        code: '000001',
        name: 'Multi 1',
        purchaseDate: '2024-01-01',
        purchasePrice: 100,
        quantity: 1,
        currency: 'CNY',
      },
      {
        id: 'multi-2',
        type: 'fund',
        code: '000002',
        name: 'Multi 2',
        purchaseDate: '2024-01-02',
        purchasePrice: 100,
        quantity: 1,
        currency: 'CNY',
      },
    ];

    const scalePoints = [
      { date: '2024-01-01', totalValueCNY: 100, totalCostCNY: 100, floatingPnLCNY: 0, floatingReturnRate: 0 },
      // Day 2: Second asset added, first asset gained 10%
      { date: '2024-01-02', totalValueCNY: 220, totalCostCNY: 200, floatingPnLCNY: 20, floatingReturnRate: 0.1 },
      { date: '2024-01-03', totalValueCNY: 230, totalCostCNY: 200, floatingPnLCNY: 30, floatingReturnRate: 0.15 },
    ];

    const result = buildPortfolioPerformanceSeries(assets, scalePoints);

    expect(result).toHaveLength(3);
    
    // Day 1: Initial investment
    expect(result[0].nav).toBe(100);
    expect(result[0].unitsOutstanding).toBe(100);
    
    // Day 2: New contribution should be normalized to keep NAV continuous
    expect(result[1].nav).toBe(100);  // NAV stays at 100 on contribution day
    expect(result[1].contributionCNY).toBe(100);
    
    // Day 3: Calculate based on market value
    expect(result[2].nav).toBeCloseTo(115, 10);  // 230 / 200 units = 1.15 -> NAV 115
  });
});
