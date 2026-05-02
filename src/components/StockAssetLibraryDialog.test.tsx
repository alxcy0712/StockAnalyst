import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { StockAssetLibraryDialog } from './StockAssetLibraryDialog';
import { useErrorStore } from '../stores/errorStore';

const mockListDatabaseStocks = vi.fn();
const mockImportDatabaseStock = vi.fn();
const mockDeleteDatabaseStock = vi.fn();
const mockRefreshDatabaseStocks = vi.fn();
const mockGetStockQuote = vi.fn();

vi.mock('../api', () => ({
  api: {
    stock: {
      listDatabaseStocks: (...args: unknown[]) => mockListDatabaseStocks(...args),
      importDatabaseStock: (...args: unknown[]) => mockImportDatabaseStock(...args),
      deleteDatabaseStock: (...args: unknown[]) => mockDeleteDatabaseStock(...args),
      refreshDatabaseStocks: (...args: unknown[]) => mockRefreshDatabaseStocks(...args),
      getQuote: (...args: unknown[]) => mockGetStockQuote(...args),
    },
  },
}));

const databaseStocks = [
  {
    id: 'symbol-1',
    market: 'a_stock',
    code: '600519',
    name: '贵州茅台',
    currency: 'CNY',
    listStatus: 'active',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    latestTradeDate: '2024-04-30',
    rowCount: 1280,
  },
];

describe('StockAssetLibraryDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListDatabaseStocks.mockResolvedValue({ stocks: databaseStocks });
    mockImportDatabaseStock.mockResolvedValue({ ok: true });
    mockDeleteDatabaseStock.mockResolvedValue({ deleted: true });
    mockRefreshDatabaseStocks.mockResolvedValue({ ok: true });
    mockGetStockQuote.mockResolvedValue([]);
    useErrorStore.getState().clearAll();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    useErrorStore.getState().clearAll();
  });

  it('loads database stocks when opened', async () => {
    render(<StockAssetLibraryDialog />);

    fireEvent.click(screen.getByRole('button', { name: '资产库' }));

    expect(await screen.findByText('贵州茅台')).toBeInTheDocument();
    expect(screen.getByText('600519')).toBeInTheDocument();
    expect(screen.getAllByText('2024-04-30').length).toBeGreaterThan(0);
    expect(mockListDatabaseStocks).toHaveBeenCalledTimes(1);
  });

  it('imports a stock and refreshes the list', async () => {
    mockGetStockQuote.mockResolvedValue([{ name: '中国联通' }]);
    render(<StockAssetLibraryDialog />);

    fireEvent.click(screen.getByRole('button', { name: '资产库' }));
    await screen.findByText('贵州茅台');

    fireEvent.change(screen.getByLabelText('股票代码'), {
      target: { value: '600050' },
    });

    await waitFor(() => {
      expect(mockGetStockQuote).toHaveBeenCalledWith(['sh600050']);
      expect(screen.getByLabelText('股票名称')).toHaveValue('中国联通');
    });
    expect(screen.getByLabelText('股票名称')).toHaveAttribute('readonly');

    fireEvent.click(screen.getByRole('button', { name: '添加并拉取' }));

    await waitFor(() => {
      expect(mockImportDatabaseStock).toHaveBeenCalledWith({
        market: 'a_stock',
        code: '600050',
        name: '中国联通',
        mode: 'backfill',
      });
      expect(mockListDatabaseStocks).toHaveBeenCalledTimes(2);
    });
  });

  it('confirms row refresh and shows the success message in the auto-dismiss top toast', async () => {
    render(<StockAssetLibraryDialog />);

    fireEvent.click(screen.getByRole('button', { name: '资产库' }));
    await screen.findByText('贵州茅台');
    fireEvent.click(screen.getByRole('button', { name: '更新 贵州茅台' }));

    expect(screen.getByText('确认更新数据')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '确认更新' }));
    });

    await waitFor(() => {
      expect(mockRefreshDatabaseStocks).toHaveBeenCalledWith(['symbol-1']);
    });
    expect(useErrorStore.getState().errors[0]).toMatchObject({
      message: '已更新 贵州茅台',
      duration: 4000,
    });
  });

  it('hard deletes a stock and refreshes the list', async () => {
    render(<StockAssetLibraryDialog />);

    fireEvent.click(screen.getByRole('button', { name: '资产库' }));
    await screen.findByText('贵州茅台');
    fireEvent.click(screen.getByRole('button', { name: '删除 贵州茅台' }));

    await waitFor(() => {
      expect(mockDeleteDatabaseStock).toHaveBeenCalledWith('symbol-1');
      expect(mockListDatabaseStocks).toHaveBeenCalledTimes(2);
    });
  });
});
