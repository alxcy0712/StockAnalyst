import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { NavChart } from './NavChart';
import type { Asset } from '../types';

const mockAssetStore = {
  assets: [] as Asset[],
};

const mockThemeStore = {
  isDark: false,
};

const mockBenchmarkStore = {
  selectedBenchmark: 'none',
  setBenchmark: vi.fn((value: string) => {
    mockBenchmarkStore.selectedBenchmark = value;
  }),
};

const mockCalculatePortfolioSeries = vi.fn();
const mockGetBenchmarkNavHistory = vi.fn();

vi.mock('echarts', () => ({
  init: vi.fn(() => ({
    setOption: vi.fn(),
    dispose: vi.fn(),
    resize: vi.fn(),
  })),
  graphic: {
    LinearGradient: vi.fn(() => ({})),
  },
}));

vi.mock('../stores/assetStore', () => ({
  useAssetStore: vi.fn((selector?: (state: typeof mockAssetStore) => unknown) => {
    if (typeof selector === 'function') {
      return selector(mockAssetStore);
    }
    return mockAssetStore;
  }),
}));

vi.mock('../stores/themeStore', () => ({
  useThemeStore: vi.fn((selector?: (state: typeof mockThemeStore) => unknown) => {
    if (typeof selector === 'function') {
      return selector(mockThemeStore);
    }
    return mockThemeStore;
  }),
}));

vi.mock('../stores/benchmarkStore', () => ({
  useBenchmarkStore: vi.fn((selector?: (state: typeof mockBenchmarkStore) => unknown) => {
    if (typeof selector === 'function') {
      return selector(mockBenchmarkStore);
    }
    return mockBenchmarkStore;
  }),
}));

vi.mock('../utils/portfolioSeries', () => ({
  calculatePortfolioSeries: (...args: unknown[]) => mockCalculatePortfolioSeries(...args),
}));

vi.mock('../api', () => ({
  api: {
    benchmark: {
      getNavHistory: (...args: unknown[]) => mockGetBenchmarkNavHistory(...args),
      configs: {
        none: { name: '无基准' },
        csi300: { name: '沪深300' },
        shanghai: { name: '上证指数' },
      },
    },
  },
}));

vi.mock('../utils/dataCache', () => ({
  dataCache: {
    clearAll: vi.fn().mockResolvedValue(undefined),
  },
  initCache: vi.fn(),
}));

describe('NavChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssetStore.assets = [];
    mockBenchmarkStore.selectedBenchmark = 'none';
    mockCalculatePortfolioSeries.mockResolvedValue({
      scale: [],
      performance: [],
    });
    mockGetBenchmarkNavHistory.mockResolvedValue([]);
  });

  it('renders empty state when no assets exist', () => {
    render(<NavChart />);
    expect(screen.getByText('添加资产后将在此显示净值走势')).toBeInTheDocument();
  });

  it('renders scale metrics without return-risk cards', async () => {
    mockAssetStore.assets = [
      {
        id: 'asset-1',
        type: 'fund',
        code: '000001',
        name: 'Asset One',
        purchaseDate: '2024-01-01',
        purchasePrice: 100,
        quantity: 1,
        currency: 'CNY',
      },
      {
        id: 'asset-2',
        type: 'fund',
        code: '000002',
        name: 'Asset Two',
        purchaseDate: '2024-01-03',
        purchasePrice: 200,
        quantity: 1,
        currency: 'CNY',
      },
    ];

    mockCalculatePortfolioSeries.mockResolvedValue({
      scale: [
        {
          date: '2024-01-01',
          totalValueCNY: 100,
          totalCostCNY: 100,
          floatingPnLCNY: 0,
          floatingReturnRate: 0,
        },
        {
          date: '2024-01-04',
          totalValueCNY: 330,
          totalCostCNY: 300,
          floatingPnLCNY: 30,
          floatingReturnRate: 0.1,
        },
      ],
      performance: [
        {
          date: '2024-01-01',
          portfolioValueCNY: 100,
          contributionCNY: 100,
          unitsOutstanding: 100,
          nav: 100,
          returnRate: 0,
        },
      ],
    });

    render(<NavChart />);

    await screen.findAllByText('最新总资产');

    expect(screen.getByRole('heading', { name: '总资产规模' })).toBeInTheDocument();
    expect(screen.getAllByText('总投入成本')[0]).toBeInTheDocument();
    expect(screen.getAllByText('浮动收益')[0]).toBeInTheDocument();
    expect(screen.getAllByText('浮动收益率')[0]).toBeInTheDocument();
    expect(screen.getAllByText('持仓天数')[0]).toBeInTheDocument();
    expect(screen.getAllByText('资产数量')[0]).toBeInTheDocument();

    expect(screen.queryByText('最大回撤')).not.toBeInTheDocument();
    expect(screen.queryByText('夏普比率')).not.toBeInTheDocument();
    expect(screen.queryByText('卡玛比率')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('基准选择')).not.toBeInTheDocument();
    expect(screen.getByText('基准对比仅在收益净值模式下可用')).toBeInTheDocument();
  });

  it('renders performance metrics and benchmark cards only in performance mode', async () => {
    mockAssetStore.assets = [
      {
        id: 'asset-1',
        type: 'fund',
        code: '000001',
        name: 'Asset One',
        purchaseDate: '2024-01-01',
        purchasePrice: 100,
        quantity: 1,
        currency: 'CNY',
      },
    ];
    mockBenchmarkStore.selectedBenchmark = 'csi300';

    mockCalculatePortfolioSeries.mockResolvedValue({
      scale: [
        {
          date: '2024-01-01',
          totalValueCNY: 100,
          totalCostCNY: 100,
          floatingPnLCNY: 0,
          floatingReturnRate: 0,
        },
      ],
      performance: [
        {
          date: '2024-01-01',
          portfolioValueCNY: 100,
          contributionCNY: 100,
          unitsOutstanding: 100,
          nav: 100,
          returnRate: 0,
        },
        {
          date: '2024-01-02',
          portfolioValueCNY: 105,
          contributionCNY: 0,
          unitsOutstanding: 100,
          nav: 105,
          returnRate: 0.05,
        },
        {
          date: '2024-01-03',
          portfolioValueCNY: 103,
          contributionCNY: 0,
          unitsOutstanding: 100,
          nav: 103,
          returnRate: 0.03,
        },
      ],
    });
    mockGetBenchmarkNavHistory.mockResolvedValue([
      { date: '2024-01-01', nav: 100, returnRate: 0 },
      { date: '2024-01-02', nav: 102, returnRate: 0.02 },
      { date: '2024-01-03', nav: 101, returnRate: 0.01 },
    ]);

    render(<NavChart />);

    await screen.findAllByText('最新总资产');
    fireEvent.click(screen.getByRole('button', { name: '收益净值' }));

    await screen.findAllByText('当前净值');

    expect(screen.getByLabelText('基准选择')).toBeInTheDocument();
    expect(screen.getAllByText('累计收益')[0]).toBeInTheDocument();
    expect(screen.getAllByText('最大回撤')[0]).toBeInTheDocument();
    expect(screen.getAllByText('年化收益率')[0]).toBeInTheDocument();
    expect(screen.getAllByText('最大连涨/连跌')[0]).toBeInTheDocument();
    expect(screen.getAllByText('波动率')[0]).toBeInTheDocument();
    expect(screen.getAllByText('夏普比率')[0]).toBeInTheDocument();
    expect(screen.getAllByText('卡玛比率')[0]).toBeInTheDocument();

    expect(screen.getAllByText('基准收益')[0]).toBeInTheDocument();
    expect(screen.getAllByText('超额收益 (Alpha)')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Beta收益')[0]).toBeInTheDocument();

    expect(screen.queryAllByText('总投入成本')).toHaveLength(0);
    expect(mockGetBenchmarkNavHistory).toHaveBeenCalledWith('csi300', '20240101', '20240103');
  });
});
