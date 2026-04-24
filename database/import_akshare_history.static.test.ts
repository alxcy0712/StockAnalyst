import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const script = readFileSync(resolve(process.cwd(), 'database/import_akshare_history.py'), 'utf8');

describe('import_akshare_history numeric schema integration', () => {
  it('defines fixed numeric mappings for markets, exchanges, and providers', () => {
    expect(script).toContain('MARKET_IDS = {"a_stock": 1, "hk_stock": 2}');
    expect(script).toContain('EXCHANGE_IDS = {"SSE": 1, "SZSE": 2, "HKEX": 3}');
    expect(script).toContain('PROVIDER_IDS = {"akshare": 1}');
  });

  it('writes numeric schema fields to Supabase payloads', () => {
    expect(script).toContain('"market_id": market_id_for_symbol(symbol)');
    expect(script).toContain('"exchange_id": exchange_id_for_symbol(symbol)');
    expect(script).toContain('"provider_id": PROVIDER_IDS[API_PROVIDER]');
    expect(script).toContain('on_conflict="market_id,code"');
  });

  it('supports open-day skipping and database incremental import options', () => {
    expect(script).toContain('--incremental-from-db');
    expect(script).toContain('--include-open-day');
    expect(script).toContain('--market-close-buffer-minutes');
    expect(script).toContain('fetch_incremental_start_date');
    expect(script).toContain('"order": "trade_date.desc"');
    expect(script).toContain('"limit": "2"');
    expect(script).toContain('filter_open_day_frame');
  });

  it('keeps legacy string fields out of import payloads', () => {
    expect(script).not.toContain('"metadata":');
    expect(script).not.toContain('"market": symbol.market');
    expect(script).not.toContain('"exchange": exchange_for_symbol');
    expect(script).not.toContain('"source": API_PROVIDER');
    expect(script).not.toContain('"provider": API_PROVIDER');
  });
});
