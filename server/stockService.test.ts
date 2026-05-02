import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const {
  createClientMock,
  fetchDatabaseKLineMock,
  checkDatabaseConnectionMock,
  spawnMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  fetchDatabaseKLineMock: vi.fn(),
  checkDatabaseConnectionMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

vi.mock('node:child_process', () => ({
  default: {
    spawn: spawnMock,
  },
  spawn: spawnMock,
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

function createThenable<T>(payload: T) {
  return {
    then(resolve: (value: T) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(payload).then(resolve, reject);
    },
  };
}

const defaultStockRows = [
  {
    id: 'symbol-1',
    market_id: 1,
    code: '600519',
    name: '贵州茅台',
    currency: 'CNY',
    list_status: 'active',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
  {
    id: 'symbol-2',
    market_id: 2,
    code: '00700',
    name: '腾讯控股',
    currency: 'HKD',
    list_status: 'active',
    is_active: true,
    created_at: '2024-02-01T00:00:00Z',
    updated_at: '2024-02-02T00:00:00Z',
  },
];

function createMockStockAdminClient({
  stockRows = defaultStockRows,
}: {
  stockRows?: Array<Record<string, unknown>>;
} = {}) {
  const operations: Array<string> = [];
  const selectedBarSymbolIds: string[] = [];
  const deletedFilters: Array<[string, unknown]> = [];
  const updatedRows: Array<{ payload: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];

  return {
    operations,
    selectedBarSymbolIds,
    deletedFilters,
    updatedRows,
    client: {
      from(table: string) {
        if (table === 'stock_symbols') {
          return {
            select() {
              operations.push('select-symbols');
              return {
                eq(column: string, value: unknown) {
                  operations.push(`symbol-filter:${column}:${String(value)}`);
                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: {
                          id: 'symbol-1',
                          market_id: 1,
                          code: '600519',
                          name: '贵州茅台',
                          currency: 'CNY',
                        },
                        error: null,
                      });
                    },
                    single() {
                      return Promise.resolve({
                        data: {
                          id: 'symbol-1',
                          market_id: 1,
                          code: '600519',
                          name: '贵州茅台',
                          currency: 'CNY',
                        },
                        error: null,
                      });
                    },
                  };
                },
                order() {
                  return this;
                },
                then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
                  return Promise.resolve({
                    data: stockRows,
                    error: null,
                  }).then(resolve, reject);
                },
              };
            },
            update(payload: Record<string, unknown>) {
              operations.push('update-symbol');
              const filters: Array<[string, unknown]> = [];
              updatedRows.push({ payload, filters });
              return {
                eq(column: string, value: unknown) {
                  filters.push([column, value]);
                  return createThenable({ error: null });
                },
              };
            },
            delete() {
              operations.push('delete-symbol');
              return {
                eq(column: string, value: unknown) {
                  deletedFilters.push([column, value]);
                  return createThenable({ error: null });
                },
              };
            },
          };
        }

        if (table === 'stock_daily_bars') {
          return {
            select() {
              return {
                eq(_column: string, value: string) {
                  selectedBarSymbolIds.push(value);
                  return {
                    order() {
                      return this;
                    },
                    limit() {
                      const latestTradeDate = value === 'symbol-1' ? '2024-04-30' : '2024-05-01';
                      const count = value === 'symbol-1' ? 1280 : 910;
                      return Promise.resolve({
                        data: [{ trade_date: latestTradeDate }],
                        count,
                        error: null,
                      });
                    },
                  };
                },
              };
            },
            delete() {
              operations.push('delete-bars');
              return {
                eq(column: string, value: unknown) {
                  deletedFilters.push([column, value]);
                  return createThenable({ error: null });
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    },
  };
}

function mockSuccessfulImportProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  spawnMock.mockImplementation(() => {
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from('[done] mode=write symbols=1 bar_rows=2\n'));
      child.emit('close', 0);
    });
    return child;
  });
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

  it('lists database stocks with latest trade date and row count', async () => {
    const { client, selectedBarSymbolIds } = createMockStockAdminClient();
    createClientMock.mockReturnValue(client);

    const service = createStockHistoryService({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'service-role-key',
    });

    await expect(service.listDatabaseStocks()).resolves.toEqual({
      stocks: [
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
        {
          id: 'symbol-2',
          market: 'hk_stock',
          code: '00700',
          name: '腾讯控股',
          currency: 'HKD',
          listStatus: 'active',
          isActive: true,
          createdAt: '2024-02-01T00:00:00Z',
          updatedAt: '2024-02-02T00:00:00Z',
          latestTradeDate: '2024-05-01',
          rowCount: 910,
        },
      ],
    });
    expect(selectedBarSymbolIds).toEqual(['symbol-1', 'symbol-2']);
  });

  it('fills and persists stock names when rows only store codes', async () => {
    const { client, updatedRows } = createMockStockAdminClient({
      stockRows: [
        {
          id: 'symbol-1',
          market_id: 1,
          code: '600519',
          name: '600519',
          currency: 'CNY',
          list_status: 'active',
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
      ],
    });
    createClientMock.mockReturnValue(client);

    const service = createStockHistoryService({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'service-role-key',
      stockNameResolver: vi.fn().mockResolvedValue('贵州茅台'),
    });

    await expect(service.listDatabaseStocks()).resolves.toMatchObject({
      stocks: [
        {
          id: 'symbol-1',
          market: 'a_stock',
          code: '600519',
          name: '贵州茅台',
        },
      ],
    });
    expect(updatedRows).toEqual([
      {
        payload: { name: '贵州茅台' },
        filters: [['id', 'symbol-1']],
      },
    ]);
  });

  it('deletes the stock symbol so daily bars are removed by cascade', async () => {
    const { client, operations, deletedFilters } = createMockStockAdminClient();
    createClientMock.mockReturnValue(client);

    const service = createStockHistoryService({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'service-role-key',
    });

    await expect(service.deleteDatabaseStock('symbol-1')).resolves.toEqual({
      deleted: true,
      stock: {
        id: 'symbol-1',
        market: 'a_stock',
        code: '600519',
        name: '贵州茅台',
        currency: 'CNY',
      },
    });
    expect(operations.slice(-1)).toEqual(['delete-symbol']);
    expect(deletedFilters).toEqual([
      ['id', 'symbol-1'],
    ]);
  });

  it('runs the import script with normalized stock arguments', async () => {
    mockSuccessfulImportProcess();
    createClientMock.mockReturnValue({ from: vi.fn() });

    const service = createStockHistoryService({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'service-role-key',
    });

    await expect(
      service.importStockData({
        mode: 'incremental',
        symbols: [{ market: 'hk_stock', code: '700', name: '腾讯控股' }],
      })
    ).resolves.toMatchObject({
      ok: true,
      mode: 'incremental',
      symbols: [{ market: 'hk_stock', code: '00700', name: '腾讯控股' }],
      stdout: '[done] mode=write symbols=1 bar_rows=2\n',
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnMock.mock.calls[0];
    expect(command).toBe('python3');
    expect(args).toEqual(expect.arrayContaining([
      expect.stringContaining('database/import_akshare_history.py'),
      '--market',
      'hk_stock',
      '--code',
      '00700',
      '--name',
      '腾讯控股',
      '--job-type',
      'incremental',
      '--incremental-from-db',
    ]));
    expect(options).toMatchObject({
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  });

  it('resolves a missing stock name before running the import script', async () => {
    mockSuccessfulImportProcess();
    createClientMock.mockReturnValue({ from: vi.fn() });

    const service = createStockHistoryService({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'service-role-key',
      stockNameResolver: vi.fn().mockResolvedValue('腾讯控股'),
    });

    await expect(
      service.importStockData({
        mode: 'backfill',
        symbols: [{ market: 'hk_stock', code: '700' }],
      })
    ).resolves.toMatchObject({
      ok: true,
      mode: 'backfill',
      symbols: [{ market: 'hk_stock', code: '00700', name: '腾讯控股' }],
    });

    const [, args] = spawnMock.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining([
      '--name',
      '腾讯控股',
    ]));
  });
});
