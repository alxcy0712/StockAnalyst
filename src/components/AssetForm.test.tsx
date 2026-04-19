import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AssetForm } from './AssetForm';
import { useErrorStore } from '../stores/errorStore';

const mockAddAsset = vi.fn();
const mockGetFundQuote = vi.fn();
const mockGetFundNavOnDate = vi.fn();
const mockGetStockQuote = vi.fn();
const mockValidateCode = vi.fn();

vi.mock('../stores/assetStore', () => ({
  useAssetStore: vi.fn((selector?: (state: { addAsset: typeof mockAddAsset }) => unknown) => {
    const state = {
      addAsset: mockAddAsset,
    };

    if (typeof selector === 'function') {
      return selector(state);
    }

    return state;
  }),
}));

vi.mock('../api', () => ({
  api: {
    fund: {
      getQuote: (...args: unknown[]) => mockGetFundQuote(...args),
      getNavOnDate: (...args: unknown[]) => mockGetFundNavOnDate(...args),
    },
    stock: {
      getQuote: (...args: unknown[]) => mockGetStockQuote(...args),
      validateCode: (...args: unknown[]) => mockValidateCode(...args),
    },
  },
}));

vi.mock('../utils/priceFallback', () => ({
  getDualClosingPriceWithFallback: vi.fn(),
}));

vi.mock('../utils/dataCache', () => ({
  dataCache: {
    clearAll: vi.fn(),
  },
}));

vi.mock('react-datepicker', () => ({
  default: ({ selected, onChange, className }: {
    selected: Date | null;
    onChange: (value: Date | null) => void;
    className?: string;
  }) => (
    <input
      aria-label="购入日期"
      className={className}
      value={selected ? selected.toISOString().slice(0, 10) : ''}
      onChange={(event) => {
        onChange(event.target.value ? new Date(event.target.value) : null);
      }}
    />
  ),
}));

describe('AssetForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useErrorStore.getState().clearAll();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetFundQuote.mockResolvedValue(null);
    mockGetFundNavOnDate.mockResolvedValue(null);
    mockGetStockQuote.mockResolvedValue([]);
  });

  afterEach(() => {
    useErrorStore.getState().clearAll();
    vi.restoreAllMocks();
  });

  it('allows retrying stock validation after a transient transport failure', async () => {
    mockValidateCode
      .mockRejectedValueOnce(new Error('校验服务暂时不可用，请重新校验'))
      .mockResolvedValueOnce({
        valid: true,
        market: 'a_stock',
        code: '600519',
        name: '贵州茅台',
        currency: 'CNY',
      });

    render(<AssetForm />);

    fireEvent.click(screen.getByRole('button', { name: '添加资产' }));
    fireEvent.change(screen.getByPlaceholderText('如：600050'), {
      target: { value: '600519' },
    });

    await waitFor(() => {
      expect(mockValidateCode).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('校验服务暂时不可用，请重新校验')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新校验' }));

    await waitFor(() => {
      expect(mockValidateCode).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('校验服务暂时不可用，请重新校验')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '重新校验' })).not.toBeInTheDocument();
    });
  });
});
