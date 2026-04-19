import { describe, expect, it } from 'vitest';

import { fetchDatabaseKLine } from './database.js';

function createMockSupabaseClient({
  symbolData,
  pageBatches,
}: {
  symbolData: { id: string; code: string; market: string; name: string };
  pageBatches: Array<Array<Record<string, unknown>>>;
}) {
  const requestedRanges: Array<[number, number]> = [];
  let pageIndex = 0;

  return {
    requestedRanges,
    client: {
      from(table: string) {
        if (table === 'stock_symbols') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            single() {
              return Promise.resolve({ data: symbolData, error: null });
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
            order() {
              return this;
            },
            gte() {
              return this;
            },
            lte() {
              return this;
            },
            range(from: number, to: number) {
              requestedRanges.push([from, to]);
              const data = pageBatches[pageIndex] ?? [];
              pageIndex += 1;
              return Promise.resolve({ data, error: null });
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    },
  };
}

describe('fetchDatabaseKLine', () => {
  it('paginates daily bars beyond the default 1000-row limit', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      trade_date: `2020-01-${String((index % 31) + 1).padStart(2, '0')}`,
      qfq_open: 100 + index,
      qfq_high: 101 + index,
      qfq_low: 99 + index,
      qfq_close: 100.5 + index,
      volume: 1000 + index,
    }));
    const secondPage = [
      {
        trade_date: '2024-06-05',
        qfq_open: 1538,
        qfq_high: 1542,
        qfq_low: 1530,
        qfq_close: 1540,
        volume: 2000,
      },
      {
        trade_date: '2024-06-06',
        qfq_open: 1540,
        qfq_high: 1545,
        qfq_low: 1536,
        qfq_close: 1543,
        volume: 2100,
      },
    ];

    const { client, requestedRanges } = createMockSupabaseClient({
      symbolData: {
        id: 'symbol-1',
        code: '600519',
        market: 'a_stock',
        name: '贵州茅台',
      },
      pageBatches: [firstPage, secondPage],
    });

    const result = await fetchDatabaseKLine({
      market: 'a_stock',
      code: '600519',
      period: 'day',
      startDate: '20200101',
      endDate: '20240606',
      fqt: 1,
      supabaseClient: client,
    });

    expect(result).toHaveLength(1002);
    expect(result.at(-1)).toEqual({
      date: '20240606',
      open: 1540,
      high: 1545,
      low: 1536,
      close: 1543,
      volume: 2100,
    });
    expect(requestedRanges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});
