# Smallint Database Schema Design

## Goal

Optimize the market data schema by replacing indexed short text fields with compact fixed `smallint` codes. The database will be cleared and rebuilt from scratch, so the table script can define the target structure directly.

## Encoding

`stock_markets`

| id | code | name |
| --- | --- | --- |
| 1 | a_stock | A 股 |
| 2 | hk_stock | 港股 |

`stock_exchanges`

| id | code | name |
| --- | --- | --- |
| 1 | SSE | 上海证券交易所 |
| 2 | SZSE | 深圳证券交易所 |
| 3 | HKEX | 香港交易所 |

`stock_providers`

| id | code | name |
| --- | --- | --- |
| 1 | akshare | AKShare |

The code tables document meanings and support lookup queries. Hot data tables store the numeric IDs.

## Schema

`stock_symbols`

- `market` becomes `market_id smallint`
- `exchange` becomes `exchange_id smallint`
- `source` becomes `provider_id smallint`
- `metadata` is removed
- `name varchar(128)` remains and must be populated by the import script
- Unique constraint becomes `(market_id, code)`
- Lookup index becomes `(market_id, code)`
- Constraints use fixed code ranges:
  - `market_id in (1, 2)`
  - `exchange_id in (1, 2, 3)`
  - `provider_id in (1)`

`stock_daily_bars`

- `provider` becomes `provider_id smallint`
- `provider_id` uses `check (provider_id in (1))`
- Daily bar lookup stays centered on `(symbol_id, trade_date)`

`stock_ingestion_runs`

- `provider` becomes `provider_id smallint`
- Provider/status lookup index becomes `(provider_id, status, started_at desc)`
- `job_type`, `status`, and `error_message` keep their current types because this table has low write volume and serves audit queries.

The design uses `check` constraints for validation on hot tables. Dictionary tables carry the readable meaning of each code, and batch upserts keep a simple write path.

## Import Script Changes

`database/import_akshare_history.py` will own the fixed mapping constants:

```python
MARKET_IDS = {"a_stock": 1, "hk_stock": 2}
EXCHANGE_IDS = {"SSE": 1, "SZSE": 2, "HKEX": 3}
PROVIDER_IDS = {"akshare": 1}
```

The script will:

- write `market_id`, `exchange_id`, and `provider_id`
- upsert `stock_symbols` with `on_conflict="market_id,code"`
- create ingestion runs with `provider_id`
- create daily bars with `provider_id`
- populate `name` using CSV input first, then provider-derived names when available, then code as the final fallback
- write payloads without `metadata`

## Backend Changes

The public API keeps the current request shape:

- `market=a_stock`
- `market=hk_stock`

The backend maps request market strings to numeric IDs before querying Supabase. Database queries use `market_id` and `code`. Response payloads keep semantic strings where the UI expects them.

`providerUsed: "database"` remains the backend data path label. AKShare is represented by `provider_id=1` inside market data tables.

## Documentation

`database/README.md` will document the fixed ID assignments, table responsibilities, and import behavior. SQL comments will describe each numeric code and point readers to the dictionary tables.

## Tests

Schema tests will assert:

- dictionary tables exist
- business tables use `smallint` code columns
- legacy text columns are removed from target schema
- check constraints define the allowed ID ranges
- expected indexes use numeric columns

Backend tests will cover:

- `a_stock` and `hk_stock` request mapping to `market_id`
- symbol validation through `(market_id, code)`
- K-line fetching after numeric schema changes

Import tests or static schema tests will cover:

- row payloads use `*_id` fields
- symbol upsert conflict key uses `market_id,code`
- `metadata` stays absent from payloads
