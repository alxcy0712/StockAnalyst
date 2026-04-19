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

create table if not exists public.stock_symbols (
  id uuid primary key default gen_random_uuid(),
  market text not null,
  code text not null,
  exchange text,
  canonical_symbol text,
  name text,
  currency text not null,
  isin text,
  list_status text not null default 'active',
  listed_at date,
  delisted_at date,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  source text not null default 'akshare',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (market, code)
);

alter table public.stock_symbols
  add column if not exists exchange text,
  add column if not exists canonical_symbol text,
  add column if not exists isin text,
  add column if not exists list_status text default 'active',
  add column if not exists listed_at date,
  add column if not exists delisted_at date,
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.stock_symbols
  drop column if exists provider_symbol;

update public.stock_symbols
set
  list_status = coalesce(list_status, 'active'),
  metadata = coalesce(metadata, '{}'::jsonb),
  updated_at = timezone('utc', now())
where list_status is null or metadata is null;

alter table public.stock_symbols
  alter column list_status set default 'active',
  alter column list_status set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

comment on table public.stock_symbols is '证券主数据表，保存证券在系统内的统一身份、基础属性和生命周期状态。';
comment on column public.stock_symbols.id is '证券主键，UUID。';
comment on column public.stock_symbols.market is '市场类型，当前支持 a_stock 和 hk_stock。';
comment on column public.stock_symbols.code is '市场内原始证券代码，例如 600519 或 00700。';
comment on column public.stock_symbols.exchange is '交易所代码，例如 SSE、SZSE、HKEX。';
comment on column public.stock_symbols.canonical_symbol is '系统统一证券标识，例如 SH:600519、HK:00700。';
comment on column public.stock_symbols.name is '证券名称。';
comment on column public.stock_symbols.currency is '交易币种，例如 CNY、HKD。';
comment on column public.stock_symbols.isin is '国际证券识别码，当前可为空，后续可补齐。';
comment on column public.stock_symbols.list_status is '上市状态，active 表示正常交易，delisted 表示退市，suspended 表示停牌，pending 表示待上市。';
comment on column public.stock_symbols.listed_at is '上市日期。';
comment on column public.stock_symbols.delisted_at is '退市日期。';
comment on column public.stock_symbols.metadata is '扩展元数据，JSONB 格式，预留给行业、板块、额外标签等信息。';
comment on column public.stock_symbols.is_active is '业务启用标记，true 表示当前仍参与导入和查询。';
comment on column public.stock_symbols.source is '主数据来源，当前默认 akshare。';
comment on column public.stock_symbols.created_at is '记录创建时间，UTC。';
comment on column public.stock_symbols.updated_at is '记录更新时间，UTC。';

do $stock_symbols_market_check$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_symbols_market_check_v2'
  ) then
    alter table public.stock_symbols
      add constraint stock_symbols_market_check_v2
      check (market in ('a_stock', 'hk_stock'));
  end if;
end;
$stock_symbols_market_check$;

do $stock_symbols_list_status_check$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_symbols_list_status_check'
  ) then
    alter table public.stock_symbols
      add constraint stock_symbols_list_status_check
      check (list_status in ('active', 'delisted', 'suspended', 'pending'));
  end if;
end;
$stock_symbols_list_status_check$;

create unique index if not exists stock_symbols_canonical_symbol_uidx
  on public.stock_symbols (canonical_symbol)
  where canonical_symbol is not null;

create index if not exists stock_symbols_market_idx
  on public.stock_symbols (market, code);

drop table if exists public.stock_symbol_provider_mappings;

create table if not exists public.stock_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  job_type text not null,
  status text not null,
  symbol_count integer not null default 0,
  row_count integer not null default 0,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  error_message text,
  request_params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.stock_ingestion_runs is '导入任务审计表，记录一次回填、增量同步或修复任务的执行状态和结果。';
comment on column public.stock_ingestion_runs.id is '导入任务主键，UUID。';
comment on column public.stock_ingestion_runs.provider is '本次导入使用的数据源名称。';
comment on column public.stock_ingestion_runs.job_type is '任务类型，backfill 表示历史回填，incremental 表示增量更新，repair 表示修复任务。';
comment on column public.stock_ingestion_runs.status is '任务状态，running/succeeded/failed/partial。';
comment on column public.stock_ingestion_runs.symbol_count is '本次任务计划处理的证券数量。';
comment on column public.stock_ingestion_runs.row_count is '本次任务成功写入或处理的日线行数。';
comment on column public.stock_ingestion_runs.started_at is '任务开始时间，UTC。';
comment on column public.stock_ingestion_runs.finished_at is '任务结束时间，UTC。';
comment on column public.stock_ingestion_runs.error_message is '任务失败时的错误信息。';
comment on column public.stock_ingestion_runs.request_params is '本次任务的执行参数快照，JSONB 格式。';
comment on column public.stock_ingestion_runs.created_at is '记录创建时间，UTC。';
comment on column public.stock_ingestion_runs.updated_at is '记录更新时间，UTC。';

do $stock_ingestion_runs_job_type_check$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_ingestion_runs_job_type_check'
  ) then
    alter table public.stock_ingestion_runs
      add constraint stock_ingestion_runs_job_type_check
      check (job_type in ('backfill', 'incremental', 'repair'));
  end if;
end;
$stock_ingestion_runs_job_type_check$;

do $stock_ingestion_runs_status_check$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_ingestion_runs_status_check'
  ) then
    alter table public.stock_ingestion_runs
      add constraint stock_ingestion_runs_status_check
      check (status in ('running', 'succeeded', 'failed', 'partial'));
  end if;
end;
$stock_ingestion_runs_status_check$;

create index if not exists stock_ingestion_runs_provider_status_idx
  on public.stock_ingestion_runs (provider, status, started_at desc);

do $stock_daily_bars_legacy_rename$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'stock_daily_bars'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_daily_bars'
      and column_name = 'adjust_mode'
  )
  and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'stock_daily_bars_legacy'
  ) then
    alter table public.stock_daily_bars rename to stock_daily_bars_legacy;
  end if;
end;
$stock_daily_bars_legacy_rename$;

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
  provider text not null,
  source_updated_at timestamptz,
  ingestion_run_id uuid references public.stock_ingestion_runs(id) on delete set null,
  imported_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (symbol_id, trade_date)
);

comment on table public.stock_daily_bars is '股票宽表日线表，每个证券每个交易日一行，同时保存不复权、前复权和后复权三套 OHLC 价格。';
comment on column public.stock_daily_bars.symbol_id is '关联的证券主键，指向 stock_symbols.id。';
comment on column public.stock_daily_bars.trade_date is '交易日期。';
comment on column public.stock_daily_bars.raw_open is '不复权开盘价。';
comment on column public.stock_daily_bars.raw_high is '不复权最高价。';
comment on column public.stock_daily_bars.raw_low is '不复权最低价。';
comment on column public.stock_daily_bars.raw_close is '不复权收盘价。';
comment on column public.stock_daily_bars.qfq_open is '前复权开盘价。';
comment on column public.stock_daily_bars.qfq_high is '前复权最高价。';
comment on column public.stock_daily_bars.qfq_low is '前复权最低价。';
comment on column public.stock_daily_bars.qfq_close is '前复权收盘价。';
comment on column public.stock_daily_bars.hfq_open is '后复权开盘价。';
comment on column public.stock_daily_bars.hfq_high is '后复权最高价。';
comment on column public.stock_daily_bars.hfq_low is '后复权最低价。';
comment on column public.stock_daily_bars.hfq_close is '后复权收盘价。';
comment on column public.stock_daily_bars.volume is '成交量，股票场景下按股数或 Provider 原始单位保存。';
comment on column public.stock_daily_bars.amount is '成交额，沿用 Provider 原始货币单位。';
comment on column public.stock_daily_bars.provider is '写入该行数据时使用的外部数据源名称。';
comment on column public.stock_daily_bars.source_updated_at is '外部数据源标识的更新时间，当前脚本可为空。';
comment on column public.stock_daily_bars.ingestion_run_id is '写入该行数据的导入任务主键。';
comment on column public.stock_daily_bars.imported_at is '该行首次写入时间，UTC。';
comment on column public.stock_daily_bars.updated_at is '该行最近更新时间，UTC。';

do $stock_daily_bars_raw_price_bounds_check$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_daily_bars_raw_price_bounds_check_v2'
  ) then
    alter table public.stock_daily_bars
      add constraint stock_daily_bars_raw_price_bounds_check_v2
      check (
        raw_low >= 0
        and raw_high >= raw_low
        and raw_open >= raw_low
        and raw_open <= raw_high
        and raw_close >= raw_low
        and raw_close <= raw_high
      );
  end if;
end;
$stock_daily_bars_raw_price_bounds_check$;

do $stock_daily_bars_qfq_price_bounds_check$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_daily_bars_qfq_price_bounds_check_v2'
  ) then
    alter table public.stock_daily_bars
      add constraint stock_daily_bars_qfq_price_bounds_check_v2
      check (
        (
          qfq_open is null
          and qfq_high is null
          and qfq_low is null
          and qfq_close is null
        )
        or (
          qfq_open is not null
          and qfq_high is not null
          and qfq_low is not null
          and qfq_close is not null
          and qfq_low >= 0
          and qfq_high >= qfq_low
          and qfq_open >= qfq_low
          and qfq_open <= qfq_high
          and qfq_close >= qfq_low
          and qfq_close <= qfq_high
        )
      );
  end if;
end;
$stock_daily_bars_qfq_price_bounds_check$;

do $stock_daily_bars_hfq_price_bounds_check$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_daily_bars_hfq_price_bounds_check_v2'
  ) then
    alter table public.stock_daily_bars
      add constraint stock_daily_bars_hfq_price_bounds_check_v2
      check (
        (
          hfq_open is null
          and hfq_high is null
          and hfq_low is null
          and hfq_close is null
        )
        or (
          hfq_open is not null
          and hfq_high is not null
          and hfq_low is not null
          and hfq_close is not null
          and hfq_low >= 0
          and hfq_high >= hfq_low
          and hfq_open >= hfq_low
          and hfq_open <= hfq_high
          and hfq_close >= hfq_low
          and hfq_close <= hfq_high
        )
      );
  end if;
end;
$stock_daily_bars_hfq_price_bounds_check$;

do $stock_daily_bars_volume_amount_check$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_daily_bars_volume_amount_check_v2'
  ) then
    alter table public.stock_daily_bars
      add constraint stock_daily_bars_volume_amount_check_v2
      check (
        (volume is null or volume >= 0)
        and (amount is null or amount >= 0)
      );
  end if;
end;
$stock_daily_bars_volume_amount_check$;

create index if not exists stock_daily_bars_lookup_idx
  on public.stock_daily_bars (symbol_id, trade_date desc);

create index if not exists stock_daily_bars_ingestion_idx
  on public.stock_daily_bars (ingestion_run_id);

do $legacy_table_comments$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'stock_daily_bars_legacy'
  ) then
    execute 'comment on table public.stock_daily_bars_legacy is ''旧版窄表日线事实表，保留为兼容层，新导入流程已停止写入。''';
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'stock_daily_bars_raw'
  ) then
    execute 'comment on table public.stock_daily_bars_raw is ''旧版原始日线表，保留为兼容层，新导入流程已停止写入。''';
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'stock_adjustment_factors'
  ) then
    execute 'comment on table public.stock_adjustment_factors is ''旧版复权因子表，保留为兼容层，新导入流程已停止写入。''';
  end if;
end;
$legacy_table_comments$;

drop trigger if exists stock_symbols_set_updated_at on public.stock_symbols;
create trigger stock_symbols_set_updated_at
before update on public.stock_symbols
for each row
execute function public.set_updated_at();

drop trigger if exists stock_ingestion_runs_set_updated_at on public.stock_ingestion_runs;
create trigger stock_ingestion_runs_set_updated_at
before update on public.stock_ingestion_runs
for each row
execute function public.set_updated_at();

drop trigger if exists stock_daily_bars_set_updated_at on public.stock_daily_bars;
create trigger stock_daily_bars_set_updated_at
before update on public.stock_daily_bars
for each row
execute function public.set_updated_at();
