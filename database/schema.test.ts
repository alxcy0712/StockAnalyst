import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaSql = readFileSync(resolve(process.cwd(), 'database/02_create_tables.sql'), 'utf8');

function extractCreateTableBlock(tableName: string) {
  const match = schemaSql.match(
    new RegExp(`create table if not exists public\\.${tableName} \\(([\\s\\S]*?)\\n\\);`)
  );
  if (!match) {
    throw new Error(`Missing create table block: ${tableName}`);
  }
  return match[1];
}

function expectColumnType(tableName: string, columnName: string, typeSql: string) {
  const tableBlock = extractCreateTableBlock(tableName);
  const columnLine = tableBlock
    .split('\n')
    .map((line) => line.trim().replace(/,$/, ''))
    .find((line) => line.startsWith(`${columnName} `));

  expect(columnLine).toBeDefined();
  expect(columnLine).toMatch(new RegExp(`^${columnName} ${typeSql}(\\s|$)`));
}

function expectColumnAbsent(tableName: string, columnName: string) {
  const tableBlock = extractCreateTableBlock(tableName);
  const columnLine = tableBlock
    .split('\n')
    .map((line) => line.trim().replace(/,$/, ''))
    .find((line) => line.startsWith(`${columnName} `));

  expect(columnLine).toBeUndefined();
}

describe('database schema fixed code tables', () => {
  it('defines dictionary tables for fixed codes', () => {
    expect(schemaSql).toContain('create table if not exists public.stock_markets');
    expect(schemaSql).toContain('create table if not exists public.stock_exchanges');
    expect(schemaSql).toContain('create table if not exists public.stock_providers');
    expect(schemaSql).toContain("(1, 'a_stock', 'A 股')");
    expect(schemaSql).toContain("(2, 'hk_stock', '港股')");
    expect(schemaSql).toContain("(1, 'SSE', '上海证券交易所')");
    expect(schemaSql).toContain("(2, 'SZSE', '深圳证券交易所')");
    expect(schemaSql).toContain("(3, 'HKEX', '香港交易所')");
    expect(schemaSql).toContain("(1, 'akshare', 'AKShare')");
  });

  it('uses smallint code columns in hot tables', () => {
    [
      ['stock_symbols', 'market_id', 'smallint'],
      ['stock_symbols', 'exchange_id', 'smallint'],
      ['stock_symbols', 'provider_id', 'smallint'],
      ['stock_ingestion_runs', 'provider_id', 'smallint'],
      ['stock_daily_bars', 'provider_id', 'smallint'],
    ].forEach(([tableName, columnName, typeSql]) => {
      expectColumnType(tableName, columnName, typeSql);
    });
  });

  it('removes legacy string columns from target hot tables', () => {
    [
      ['stock_symbols', 'market'],
      ['stock_symbols', 'exchange'],
      ['stock_symbols', 'source'],
      ['stock_symbols', 'metadata'],
      ['stock_ingestion_runs', 'provider'],
      ['stock_daily_bars', 'provider'],
    ].forEach(([tableName, columnName]) => {
      expectColumnAbsent(tableName, columnName);
    });
  });

  it('defines constraints and indexes on numeric columns', () => {
    expect(schemaSql).toMatch(/check \(market_id in \(1, 2\)\)/);
    expect(schemaSql).toMatch(/check \(exchange_id in \(1, 2, 3\)\)/);
    expect(schemaSql).toMatch(/check \(provider_id in \(1\)\)/);
    expect(schemaSql).toContain('unique (market_id, code)');
    expect(schemaSql).toContain('on public.stock_symbols (market_id, code)');
    expect(schemaSql).toContain('on public.stock_ingestion_runs (provider_id, status, started_at desc)');
  });
});
