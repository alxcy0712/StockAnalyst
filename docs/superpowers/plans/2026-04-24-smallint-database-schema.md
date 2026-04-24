# Smallint Database Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the market data schema around fixed `smallint` codes for markets, exchanges, and providers, then align the import script and backend queries with the numeric schema.

**Architecture:** The database stores compact numeric IDs in hot tables and keeps dictionary tables for readable code meanings. Application boundaries continue to accept semantic market strings and translate them at the database edge. The project uses a clean rebuild strategy for the database, so migration code for existing rows stays outside scope.

**Tech Stack:** Supabase Postgres SQL, Python import script, Node/Express backend, Supabase JS client, Vitest.

---

## File Structure

- Modify `database/02_create_tables.sql`
  - Define dictionary tables.
  - Define `stock_symbols`, `stock_daily_bars`, and `stock_ingestion_runs` with `smallint` ID columns.
  - Define check constraints, indexes, and comments for fixed encodings.
- Modify `database/schema.test.ts`
  - Assert dictionary tables exist.
  - Assert hot tables use numeric ID columns and expected indexes.
  - Assert legacy string columns are removed from the target schema.
- Create `database/import_akshare_history.static.test.ts`
  - Assert the import script owns fixed mapping constants and writes numeric payload fields.
- Modify `database/import_akshare_history.py`
  - Add mapping constants.
  - Write `market_id`, `exchange_id`, and `provider_id`.
  - Use `market_id,code` as symbol upsert conflict key.
  - Populate `name` with a stable fallback.
- Modify `server/providers/common.js`
  - Add shared market ID mapping helpers.
- Modify `server/providers/database.js`
  - Query symbols by `market_id` and `code`.
- Modify `server/stockService.js`
  - Validate symbols by `market_id` and `code`.
- Modify `server/providers/database.test.ts`
  - Assert K-line queries translate market strings to IDs.
- Modify `server/stockService.test.ts`
  - Assert validation queries translate market strings to IDs.
- Modify `database/README.md`
  - Document the fixed IDs and clean rebuild flow.

---

## Task 1: Schema Tests

**Files:**
- Modify: `database/schema.test.ts`

- [ ] **Step 1: Replace schema tests with numeric schema assertions**

Use this complete file content:

```ts
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
```

- [ ] **Step 2: Run schema test to verify it fails**

Run:

```bash
npm test -- database/schema.test.ts
```

Expected: FAIL because the current SQL still defines string columns such as `market varchar(16)` and lacks dictionary tables.

- [ ] **Step 3: Commit test-only change**

```bash
git add database/schema.test.ts
git commit -m "test: lock numeric market data schema"
```

---

## Task 2: SQL Target Schema

**Files:**
- Modify: `database/02_create_tables.sql`

- [ ] **Step 1: Rewrite dictionary and hot-table SQL**

Replace the top-level table definitions for the three active tables and add dictionary tables with this structure:

```sql
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $set_updated_at$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$set_updated_at$;

comment on schema public is 'StockAnalyst 项目的应用数据 schema，当前承载股票主数据、宽表日线行情和导入审计。';
comment on function public.set_updated_at() is '统一维护 updated_at 字段的触发器函数，行更新时自动写入 UTC 时间。';

create table if not exists public.stock_markets (
  id smallint primary key,
  code varchar(16) not null unique,
  name varchar(32) not null,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.stock_markets (id, code, name)
values
  (1, 'a_stock', 'A 股'),
  (2, 'hk_stock', '港股')
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name;

create table if not exists public.stock_exchanges (
  id smallint primary key,
  code varchar(16) not null unique,
  name varchar(32) not null,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.stock_exchanges (id, code, name)
values
  (1, 'SSE', '上海证券交易所'),
  (2, 'SZSE', '深圳证券交易所'),
  (3, 'HKEX', '香港交易所')
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name;

create table if not exists public.stock_providers (
  id smallint primary key,
  code varchar(32) not null unique,
  name varchar(64) not null,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.stock_providers (id, code, name)
values
  (1, 'akshare', 'AKShare')
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name;

comment on table public.stock_markets is '市场字典表，固定编码：1=a_stock，2=hk_stock。';
comment on table public.stock_exchanges is '交易所字典表，固定编码：1=SSE，2=SZSE，3=HKEX。';
comment on table public.stock_providers is '数据源字典表，固定编码：1=akshare。';

create table if not exists public.stock_symbols (
  id uuid primary key default gen_random_uuid(),
  market_id smallint not null check (market_id in (1, 2)),
  code varchar(16) not null,
  exchange_id smallint not null check (exchange_id in (1, 2, 3)),
  canonical_symbol varchar(32),
  name varchar(128) not null,
  currency varchar(3) not null,
  isin varchar(12),
  list_status varchar(16) not null default 'active',
  listed_at date,
  delisted_at date,
  is_active boolean not null default true,
  provider_id smallint not null default 1 check (provider_id in (1)),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (market_id, code)
);
```

Continue `stock_ingestion_runs` and `stock_daily_bars` with these key columns:

```sql
create table if not exists public.stock_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  provider_id smallint not null default 1 check (provider_id in (1)),
  job_type varchar(16) not null,
  status varchar(16) not null,
  symbol_count integer not null default 0,
  row_count integer not null default 0,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  error_message text,
  request_params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.stock_daily_bars (
  symbol_id uuid not null references public.stock_symbols(id) on delete cascade,
  trade_date date not null,
  raw_open numeric(18, 6) not null,
  raw_high numeric(18, 6) not null,
  raw_low numeric(18, 6) not null,
  raw_close numeric(18, 6) not null,
  qfq_open numeric(18, 6),
  qfq_high numeric(18, 6),
  qfq_low numeric(18, 6),
  qfq_close numeric(18, 6),
  hfq_open numeric(18, 6),
  hfq_high numeric(18, 6),
  hfq_low numeric(18, 6),
  hfq_close numeric(18, 6),
  volume bigint,
  amount numeric(24, 4),
  provider_id smallint not null default 1 check (provider_id in (1)),
  source_updated_at timestamptz,
  ingestion_run_id uuid references public.stock_ingestion_runs(id) on delete set null,
  imported_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (symbol_id, trade_date)
);
```

Keep existing comments, price constraints, triggers, and legacy table comments. Update changed column comments to mention numeric encodings. Update indexes:

```sql
create unique index if not exists stock_symbols_canonical_symbol_uidx
  on public.stock_symbols (canonical_symbol)
  where canonical_symbol is not null;

create index if not exists stock_symbols_market_idx
  on public.stock_symbols (market_id, code);

create index if not exists stock_ingestion_runs_provider_status_idx
  on public.stock_ingestion_runs (provider_id, status, started_at desc);
```

- [ ] **Step 2: Run schema test to verify it passes**

Run:

```bash
npm test -- database/schema.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit schema implementation**

```bash
git add database/02_create_tables.sql database/schema.test.ts
git commit -m "feat: use numeric market data schema"
```

---

## Task 3: Import Script Static Tests

**Files:**
- Create: `database/import_akshare_history.static.test.ts`

- [ ] **Step 1: Add import script static tests**

Use this complete file content:

```ts
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

  it('keeps legacy string fields out of import payloads', () => {
    expect(script).not.toContain('"metadata":');
    expect(script).not.toContain('"market": symbol.market');
    expect(script).not.toContain('"exchange": exchange_for_symbol');
    expect(script).not.toContain('"source": API_PROVIDER');
    expect(script).not.toContain('"provider": API_PROVIDER');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- database/import_akshare_history.static.test.ts
```

Expected: FAIL because the script still writes `market`, `exchange`, `source`, `provider`, and `metadata`.

- [ ] **Step 3: Commit test-only change**

```bash
git add database/import_akshare_history.static.test.ts
git commit -m "test: lock import numeric schema payloads"
```

---

## Task 4: Import Script Implementation

**Files:**
- Modify: `database/import_akshare_history.py`

- [ ] **Step 1: Add mapping constants and helpers**

Near `API_PROVIDER`, add:

```python
API_PROVIDER = "akshare"
MARKET_IDS = {"a_stock": 1, "hk_stock": 2}
EXCHANGE_IDS = {"SSE": 1, "SZSE": 2, "HKEX": 3}
PROVIDER_IDS = {"akshare": 1}
```

Add helpers after `exchange_for_symbol`:

```python
def market_id_for_symbol(symbol: SymbolInput) -> int:
    return MARKET_IDS[symbol.market]


def exchange_id_for_symbol(symbol: SymbolInput) -> int:
    return EXCHANGE_IDS[exchange_for_symbol(symbol.market, symbol.code)]
```

- [ ] **Step 2: Update symbol payload**

Replace `build_symbol_row` with:

```python
def build_symbol_row(symbol: SymbolInput) -> dict:
    return {
        "market_id": market_id_for_symbol(symbol),
        "code": symbol.code,
        "exchange_id": exchange_id_for_symbol(symbol),
        "canonical_symbol": build_canonical_symbol(symbol.market, symbol.code),
        "name": symbol.name or symbol.code,
        "currency": currency_for_market(symbol.market),
        "list_status": "active",
        "is_active": True,
        "provider_id": PROVIDER_IDS[API_PROVIDER],
    }
```

- [ ] **Step 3: Update daily bar payload**

In `build_daily_bar_rows`, replace:

```python
"provider": API_PROVIDER,
```

with:

```python
"provider_id": PROVIDER_IDS[API_PROVIDER],
```

- [ ] **Step 4: Update ingestion run payload**

In `create_ingestion_run`, replace:

```python
"provider": API_PROVIDER,
```

with:

```python
"provider_id": PROVIDER_IDS[API_PROVIDER],
```

- [ ] **Step 5: Update stock symbol upsert conflict key**

In the `upsert_rows` call for `stock_symbols`, replace:

```python
on_conflict="market,code",
```

with:

```python
on_conflict="market_id,code",
```

- [ ] **Step 6: Run import static test**

Run:

```bash
npm test -- database/import_akshare_history.static.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit import implementation**

```bash
git add database/import_akshare_history.py database/import_akshare_history.static.test.ts
git commit -m "feat: write numeric schema import payloads"
```

---

## Task 5: Backend Tests

**Files:**
- Modify: `server/providers/database.test.ts`
- Modify: `server/stockService.test.ts`

- [ ] **Step 1: Update database provider mock to record filters**

In `server/providers/database.test.ts`, update the mock helper shape:

```ts
function createMockSupabaseClient({
  symbolData,
  pageBatches,
}: {
  symbolData: { id: string; code: string; market_id: number; name: string };
  pageBatches: Array<Array<Record<string, unknown>>>;
}) {
  const requestedRanges: Array<[number, number]> = [];
  const symbolFilters: Array<[string, unknown]> = [];
  let pageIndex = 0;
```

Inside the `stock_symbols` branch, use:

```ts
eq(column: string, value: unknown) {
  symbolFilters.push([column, value]);
  return this;
}
```

Return `symbolFilters` from the helper:

```ts
return {
  requestedRanges,
  symbolFilters,
  client: {
```

In the test, destructure and assert:

```ts
const { client, requestedRanges, symbolFilters } = createMockSupabaseClient({
  symbolData: {
    id: 'symbol-1',
    code: '600519',
    market_id: 1,
    name: '贵州茅台',
  },
  pageBatches: [firstPage, secondPage],
});

expect(symbolFilters).toEqual([
  ['market_id', 1],
  ['code', '600519'],
]);
```

- [ ] **Step 2: Update stock service test mock to record filters**

In `server/stockService.test.ts`, record `stock_symbols` filters in the mock. Add an array next to existing mock state:

```ts
const symbolFilters: Array<[string, unknown]> = [];
```

In the `stock_symbols` query mock, update `eq`:

```ts
eq(column: string, value: unknown) {
  symbolFilters.push([column, value]);
  return this;
}
```

Expose it from the helper return object:

```ts
return { client, symbolFilters };
```

Add an assertion in the validation test for an A-share symbol:

```ts
expect(symbolFilters).toEqual([
  ['market_id', 1],
  ['code', '600519'],
]);
```

- [ ] **Step 3: Run focused backend tests to verify failure**

Run:

```bash
npm test -- server/providers/database.test.ts server/stockService.test.ts
```

Expected: FAIL because backend code still queries `.eq('market', market)`.

- [ ] **Step 4: Commit test-only change**

```bash
git add server/providers/database.test.ts server/stockService.test.ts
git commit -m "test: expect backend numeric market queries"
```

---

## Task 6: Backend Implementation

**Files:**
- Modify: `server/providers/common.js`
- Modify: `server/providers/database.js`
- Modify: `server/stockService.js`

- [ ] **Step 1: Add market ID helpers**

In `server/providers/common.js`, add after `STOCK_MARKETS`:

```js
export const STOCK_MARKET_IDS = {
  a_stock: 1,
  hk_stock: 2,
};

export function marketToId(market) {
  return STOCK_MARKET_IDS[market];
}
```

- [ ] **Step 2: Update database provider query**

In `server/providers/database.js`, import `marketToId`:

```js
import {
  createProviderError,
  ensureMarketSupported,
  fetchSingleRowOrNull,
  isSingleRowNotFoundError,
  ensureSupportedPeriod,
  normalizeCompactDate,
  marketToId,
} from './common.js';
```

After request validation, add:

```js
const marketId = marketToId(market);
```

Update the symbol query:

```js
const symbolQuery = supabaseClient
  .from('stock_symbols')
  .select('id, code, market_id, name')
  .eq('market_id', marketId)
  .eq('code', code);
```

- [ ] **Step 3: Update stock service validation query**

In `server/stockService.js`, import `marketToId`:

```js
import {
  STOCK_MARKETS,
  STOCK_PERIODS,
  createProviderError,
  fetchSingleRowOrNull,
  isSingleRowNotFoundError,
  marketToId,
} from './providers/common.js';
```

Inside `validateSymbol`, add:

```js
const marketId = marketToId(market);
```

Update the symbol query:

```js
const symbolQuery = supabaseClient
  .from('stock_symbols')
  .select('id, name, currency')
  .eq('market_id', marketId)
  .eq('code', code);
```

- [ ] **Step 4: Run focused backend tests**

Run:

```bash
npm test -- server/providers/database.test.ts server/stockService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit backend implementation**

```bash
git add server/providers/common.js server/providers/database.js server/stockService.js server/providers/database.test.ts server/stockService.test.ts
git commit -m "feat: query stocks by numeric market id"
```

---

## Task 7: Documentation

**Files:**
- Modify: `database/README.md`

- [ ] **Step 1: Update database README**

Add this section near the current table overview:

```md
## 固定数字编码

热表使用 `smallint` 保存市场、交易所和数据源编码，字典表保存可读含义。

### `stock_markets`

| id | code | name |
| --- | --- | --- |
| 1 | `a_stock` | A 股 |
| 2 | `hk_stock` | 港股 |

### `stock_exchanges`

| id | code | name |
| --- | --- | --- |
| 1 | `SSE` | 上海证券交易所 |
| 2 | `SZSE` | 深圳证券交易所 |
| 3 | `HKEX` | 香港交易所 |

### `stock_providers`

| id | code | name |
| --- | --- | --- |
| 1 | `akshare` | AKShare |

`stock_symbols` 使用 `market_id`、`exchange_id`、`provider_id`。`stock_daily_bars` 和 `stock_ingestion_runs` 使用 `provider_id`。后端接口仍接收 `a_stock` 和 `hk_stock`，服务端在查询数据库前转换为数字编码。
```

Update all field references:

- `market` becomes `market_id`
- `exchange` becomes `exchange_id`
- `source` or `provider` in hot tables becomes `provider_id`
- Remove statements that describe `metadata`
- Explain that the database can be cleared and rebuilt with `database/02_create_tables.sql`

- [ ] **Step 2: Commit documentation**

```bash
git add database/README.md
git commit -m "docs: document numeric market data schema"
```

---

## Task 8: Final Verification

**Files:**
- No source edits.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm test
```

Expected: all Vitest suites pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Run focused lint for changed files**

Run:

```bash
npx eslint database/schema.test.ts database/import_akshare_history.static.test.ts server/providers/database.test.ts server/stockService.test.ts server/providers/common.js server/providers/database.js server/stockService.js
```

Expected: exit code 0.

- [ ] **Step 4: Run full lint and record status**

Run:

```bash
npm run lint
```

Expected: current repository may still report the existing `_asset` unused error in `src/utils/stockPriceMode.ts`. Treat any new lint error in changed files as blocking.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` exits 0. `git status --short` shows only expected files if final commits were skipped during execution, or a clean tree if every task commit was made.
