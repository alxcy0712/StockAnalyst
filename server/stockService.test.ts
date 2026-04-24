import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createClientMock,
  fetchDatabaseKLineMock,
  checkDatabaseConnectionMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  fetchDatabaseKLineMock: vi.fn(),
  checkDatabaseConnectionMock: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

vi.mock('./providers/database.js', () => ({
  fetchDatabaseKLine: fetchDatabaseKLineMock,
  checkDatabaseConnection: checkDatabaseConnectionMock,
}));

import { createStockHistoryService } from './stockService.js';

function createMockSupabaseClient({
  symbolResponse,
  barsResponse,
}: {
  symbolResponse: { data: { id: string; name: string; currency: string } | null; error: { message: string; code?: string } | null };
  barsResponse?: { data: Array<{ trade_date: string }>; error: { message: string; code?: string } | null };
}) {
  const symbolFilters: Array<[string, unknown]> = [];
  return {
    symbolFilters,
    client: {
      from(table: string) {
        if (table === 'stock_symbols') {
          return {
            select() {
              return this;
            },
            eq(column: string, value: unknown) {
              symbolFilters.push([column, value]);
              return this;
            },
            maybeSingle() {
              return Promise.resolve(symbolResponse);
            },
            single() {
              return Promise.resolve(symbolResponse);
            },
          };
        }

        if (table === 'stock_daily_bars') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            limit() {
              return Promise.resolve(
                barsResponse ?? {
                  data: [{ trade_date: '2024-01-02' }],
                  error: null,
                }
              );
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    },
  };
}

describe('createStockHistoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not configured when validating symbols without database credentials', async () => {
    const service = createStockHistoryService({
      supabaseUrl: '',
      supabaseKey: '',
    });

    await expect(service.validateSymbol('a_stock', '600519')).resolves.toEqual({
      exists: false,
      error: '数据库未配置',
    });
  });

  it('returns symbol metadata when validation succeeds', async () => {
    const { client: supabaseClient, symbolFilters } = createMockSupabaseClient({
      symbolResponse: {
        data: { id: 'symbol-1', name: '贵州茅台', currency: 'CNY' },
        error: null,
      },
      barsResponse: {
        data: [{ trade_date: '2024-01-02' }],
        error: null,
      },
    });
    createClientMock.mockReturnValue(supabaseClient);

    const service = createStockHistoryService({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'service-role-key',
    });

    await expect(service.validateSymbol('a_stock', '600519')).resolves.toEqual({
      exists: true,
      symbol: { id: 'symbol-1', name: '贵州茅台', currency: 'CNY' },
    });
    expect(symbolFilters).toEqual([
      ['market_id', 1],
      ['code', '600519'],
    ]);
  });

  it('returns provider error text when symbol is missing', async () => {
    const { client: supabaseClient } = createMockSupabaseClient({
      symbolResponse: {
        data: null,
        error: { message: 'Cannot coerce the result to a single JSON object', code: 'PGRST116' },
      },
    });
    createClientMock.mockReturnValue(supabaseClient);

    const service = createStockHistoryService({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'service-role-key',
    });

    await expect(service.validateSymbol('hk_stock', '00700')).resolves.toEqual({
      exists: false,
      error: '数据库中暂无 港股 00700 的历史数据',
    });
  });

  it('returns missing history when symbol metadata exists without daily bars', async () => {
    const { client: supabaseClient } = createMockSupabaseClient({
      symbolResponse: {
        data: { id: 'symbol-1', name: '腾讯控股', currency: 'HKD' },
        error: null,
      },
      barsResponse: {
        data: [],
        error: null,
      },
    });
    createClientMock.mockReturnValue(supabaseClient);

    const service = createStockHistoryService({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'service-role-key',
    });

    await expect(service.validateSymbol('hk_stock', '00700')).resolves.toEqual({
      exists: false,
      error: '数据库中暂无 港股 00700 的历史数据',
    });
  });

  it('throws a service error when database credentials are missing for kline queries', async () => {
    const service = createStockHistoryService({
      supabaseUrl: '',
      supabaseKey: '',
    });

    await expect(
      service.getKLineEnvelope({
        market: 'a_stock',
        code: '600519',
        period: 'day',
      })
    ).rejects.toMatchObject({
      code: 'database_not_configured',
      statusCode: 503,
      message: '数据库未配置，请设置SUPABASE_URL和SUPABASE_SERVICE_ROLE_KEY环境变量',
    });
  });

  it('delegates kline fetching to the database provider', async () => {
    const supabaseClient = { from: vi.fn() };
    const rows = [{ date: '20240102', open: 10, close: 11, high: 12, low: 9, volume: 1000 }];
    createClientMock.mockReturnValue(supabaseClient);
    fetchDatabaseKLineMock.mockResolvedValue(rows);

    const service = createStockHistoryService({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'service-role-key',
    });

    await expect(
      service.getKLineEnvelope({
        market: 'a_stock',
        code: '600519',
        period: 'day',
        startDate: '20240101',
        endDate: '20240131',
        fqt: 1,
      })
    ).resolves.toEqual({
      data: rows,
      providerUsed: 'database',
      attemptedProviders: ['database'],
      degraded: false,
      message: null,
    });

    expect(fetchDatabaseKLineMock).toHaveBeenCalledWith({
      market: 'a_stock',
      code: '600519',
      period: 'day',
      startDate: '20240101',
      endDate: '20240131',
      fqt: 1,
      supabaseClient,
    });
  });

  it('rejects unsupported markets before touching the database provider', async () => {
    const supabaseClient = { from: vi.fn() };
    createClientMock.mockReturnValue(supabaseClient);

    const service = createStockHistoryService({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'service-role-key',
    });

    await expect(
      service.getKLineEnvelope({
        market: 'us_stock',
        code: 'AAPL',
        period: 'day',
      })
    ).rejects.toMatchObject({
      code: 'validation_error',
      statusCode: 400,
      message: '不支持的市场: us_stock',
    });

    expect(fetchDatabaseKLineMock).not.toHaveBeenCalled();
  });
});
