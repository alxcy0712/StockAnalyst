# Database Scripts

本目录管理股票历史数据的数据库结构、导入脚本和执行说明。当前方案面向 `Supabase Postgres`，数据抓取来源是 `AKShare`。新版结构采用单张宽表日线：每个证券每个交易日一行，同时包含不复权、前复权、后复权三套价格。

## 目录结构

- `01_create_database.sql`
  用于本地 PostgreSQL 手工建库，默认创建 `stock_analyst` 数据库。Supabase 项目已经自带数据库，这个文件主要服务本地实验环境。
- `02_create_tables.sql`
  用于 Supabase 的清库重建。脚本包含字典表、证券主数据表、宽表日线、导入审计表、触发器和中文注释。
- `import_akshare_history.py`
  历史数据导入脚本。支持批量 CSV 导入、单个标的导入、时间区间过滤、任务类型标记和 dry-run。
- `symbols.example.csv`
  批量导入示例文件，采用最简 `market,code` 两列格式。
- `requirements.txt`
  Python 依赖声明。

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

## 当前表结构总览

当前流程使用六张表：

- `public.stock_markets`
- `public.stock_exchanges`
- `public.stock_providers`
- `public.stock_symbols`
- `public.stock_daily_bars`
- `public.stock_ingestion_runs`

旧表如果存在，会被保留为兼容层：

- `public.stock_daily_bars_legacy`
- `public.stock_daily_bars_raw`
- `public.stock_adjustment_factors`

## 各表职责

### 1. `public.stock_symbols`

证券主数据表。每只股票在系统里保留一个统一身份。

核心字段：

- `id`
  系统内部主键，所有事实表都通过它关联。
- `market_id`
  市场数字编码，`1=a_stock`，`2=hk_stock`。
- `code`
  市场内证券代码，例如 `600519`、`00700`。
- `exchange_id`
  交易所数字编码，`1=SSE`，`2=SZSE`，`3=HKEX`。
- `canonical_symbol`
  系统统一证券标识，例如 `SH:600519`、`HK:00700`。
- `name`
  证券名称，由导入脚本补全。
- `currency`
  币种，例如 `CNY`、`HKD`。
- `list_status`
  上市状态，例如 `active`。
- `provider_id`
  主数据来源编码，当前固定为 `1=akshare`。

使用方式：

- 所有行情查询先通过 `(market_id, code)` 找到 `symbol_id`。
- 所有行情事实数据通过 `symbol_id` 关联到这张表。
- 导入脚本按 `market + code` 生成 AKShare 请求代码，写库时转换为数字编码。
- CSV 导入支持 `market,code,name`，缺失名称时用代码兜底。

### 2. `public.stock_daily_bars`

核心事实表。每个 `symbol_id + trade_date` 保存一行，同时存三套日线价格：

- 不复权：`raw_open/raw_high/raw_low/raw_close`
- 前复权：`qfq_open/qfq_high/qfq_low/qfq_close`
- 后复权：`hfq_open/hfq_high/hfq_low/hfq_close`

其他字段：

- `volume`
- `amount`
- `provider_id`
- `source_updated_at`
- `ingestion_run_id`
- `imported_at`
- `updated_at`

使用方式：

- 前端查日线，直接按 `symbol_id + trade_date` 读取。
- 估值场景优先用 `qfq_close`。
- 对账或还原真实历史成交口径时，用 `raw_close`。
- 需要后复权时，使用 `hfq_close`。
- `provider_id=1` 表示本行来自 AKShare。

### 3. `public.stock_ingestion_runs`

导入任务审计表。每跑一次回填、增量、修复任务，都会产生一条记录。

核心字段：

- `provider_id`
  本次导入使用的数据源编码，当前固定为 `1=akshare`。
- `job_type`
  `backfill`、`incremental`、`repair`。
- `status`
  `running`、`succeeded`、`failed`、`partial`。
- `symbol_count`
  计划处理的股票数。
- `row_count`
  实际处理的日线行数。
- `request_params`
  参数快照。
- `error_message`
  错误信息。

## 执行顺序

### 1. 清空现有数据库对象

你可以在 Supabase SQL Editor 中清空当前项目的业务表，再执行最新版建表脚本。当前脚本按清库重建设计。

### 2. 执行建表 SQL

打开 Supabase 的 `SQL Editor`，执行：

- `database/02_create_tables.sql`

这个脚本会创建：

- 三张固定编码字典表
- `stock_symbols`
- `stock_daily_bars`
- `stock_ingestion_runs`
- 约束、索引、触发器和中文注释

### 3. 安装 Python 依赖

```bash
pip install -r database/requirements.txt
```

### 4. 配置环境变量

```bash
export SUPABASE_URL='https://your-project.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='your-service-role-key'
```

说明：

- `SUPABASE_URL` 是项目 URL。
- `SUPABASE_SERVICE_ROLE_KEY` 可以填写 `service_role` 或 `sb_secret_...`。
- 这类 key 属于高权限服务端密钥，建议只保留在本机环境变量中。

### 5. 准备股票清单

格式参考 [symbols.example.csv](/Users/liuxiaochen/Desktop/有意思/ai/StockAnalyst/database/symbols.example.csv:1)：

```csv
market,code
A股,600519
港股,00700
```

字段说明：

- `market`：支持 `a_stock`、`hk_stock`、`A股`、`港股`。
- `code`：A 股用 `600519` 这类六码，港股用 `00700` 这类五码。
- `name`：第三列可选，脚本支持 `market,code,name` 三列格式。

校验规则：

- A 股代码必须是 `6` 位数字。
- 港股代码必须是 `1` 到 `5` 位数字，写入前会自动补齐成 `5` 位。
- 无效行会在控制台输出 `[skip] ...`，导入继续执行。
- 港股 `raw` 如果出现和上一交易日 `OHLCV` 完全重复的连续行，脚本会自动剔除。

### 6. 先执行 dry-run

```bash
python3 database/import_akshare_history.py \
  --symbols-file database/symbols.example.csv \
  --adjust-modes raw,qfq,hfq \
  --dry-run
```

dry-run 只抓数和统计，跳过数据库写入。

### 7. 正式写入数据库

```bash
python3 database/import_akshare_history.py \
  --symbols-file database/symbols.example.csv \
  --adjust-modes raw,qfq,hfq
```

增量写入示例：

```bash
python3 database/import_akshare_history.py \
  --symbols-file database/symbols.example.csv \
  --adjust-modes raw,qfq,hfq \
  --job-type incremental \
  --incremental-from-db
```

单个标的导入示例：

```bash
python3 database/import_akshare_history.py \
  --market hk_stock \
  --code 00700 \
  --name 腾讯控股 \
  --adjust-modes raw,qfq,hfq
```

## 导入脚本流程

1. 读取并校验股票清单，剔除不合格行。
2. 创建一条 `stock_ingestion_runs` 任务记录，写入 `provider_id=1`。
3. 如果启用 `--incremental-from-db`，查询该标的最近两个 `trade_date`，从倒数第二个交易日开始抓取。
4. 对每只股票抓取 `raw` 日线。
5. 默认跳过当天未收盘数据，收盘缓冲时间后允许写入当天。
6. 港股 `raw` 自动剔除与上一条 `OHLCV` 完全重复的连续行。
7. 对需要的模式抓取 `qfq/hfq` 日线。
8. 将同一天的 `raw/qfq/hfq` 价格合并成同一行。
9. upsert 到 `stock_daily_bars`。
10. 更新 `stock_ingestion_runs` 的状态和处理行数。

关键点：

- `raw` 总是会写入宽表。
- `qfq/hfq` 是可选列。
- 宽表的唯一键是 `(symbol_id, trade_date)`。
- 证券主数据的 upsert 键是 `(market_id, code)`。
- A 股默认在 `15:30` 前跳过当天行，港股默认在 `16:30` 前跳过当天行。
- 需要盘中写入时，可以显式传 `--include-open-day`。

## 常用参数

- `--symbols-file`
  批量导入的 CSV 文件路径，支持最简两列格式。
- `--market`
  单个导入时指定市场。
- `--code`
  单个导入时指定代码。
- `--name`
  单个导入时指定名称。
- `--adjust-modes`
  支持 `raw,qfq,hfq`，默认 `raw,qfq`。
- `--job-type`
  支持 `backfill`、`incremental`、`repair`。
- `--start-date`
  起始日期，格式 `YYYY-MM-DD`。
- `--end-date`
  截止日期，格式 `YYYY-MM-DD`。
- `--batch-size`
  单次批量 upsert 的行数，默认 `500`。
- `--pause-seconds`
  每个 symbol 完成后的暂停秒数，默认 `0.2`。
- `--incremental-from-db`
  根据数据库中该标的最近两个交易日计算增量起点，从倒数第二个交易日开始抓取。
- `--include-open-day`
  允许写入当天未收盘行情。默认会跳过当天未收盘行。
- `--market-close-buffer-minutes`
  收盘后等待多少分钟才允许写入当天数据，默认 `30`。
- `--dry-run`
  只抓数和统计，跳过数据库写入。

## 推荐查询方式

### 查询一只股票的不复权日线

```sql
select
  m.code as market,
  s.code,
  b.trade_date,
  b.raw_open,
  b.raw_high,
  b.raw_low,
  b.raw_close,
  b.volume,
  b.amount
from public.stock_daily_bars b
join public.stock_symbols s on s.id = b.symbol_id
join public.stock_markets m on m.id = s.market_id
where s.market_id = 1
  and s.code = '600519'
order by b.trade_date;
```

### 查询一只股票的前复权收盘价

```sql
select
  m.code as market,
  s.code,
  b.trade_date,
  b.qfq_close
from public.stock_daily_bars b
join public.stock_symbols s on s.id = b.symbol_id
join public.stock_markets m on m.id = s.market_id
where s.market_id = 2
  and s.code = '00700'
order by b.trade_date;
```

### 查询最近一个交易日的后复权收盘价

```sql
select
  m.code as market,
  s.code,
  s.name,
  b.trade_date,
  b.hfq_close
from public.stock_daily_bars b
join public.stock_symbols s on s.id = b.symbol_id
join public.stock_markets m on m.id = s.market_id
where b.trade_date = (
  select max(trade_date) from public.stock_daily_bars
)
order by s.market_id, s.code;
```

## 验证 SQL

### 查看证券主数据

```sql
select
  m.code as market,
  s.code,
  s.canonical_symbol,
  e.code as exchange,
  s.name,
  s.list_status
from public.stock_symbols s
join public.stock_markets m on m.id = s.market_id
join public.stock_exchanges e on e.id = s.exchange_id
order by s.market_id, s.code;
```

### 查看宽表日线行数

```sql
select
  m.code as market,
  s.code,
  count(*) as bars_rows,
  min(b.trade_date) as first_trade_date,
  max(b.trade_date) as last_trade_date
from public.stock_daily_bars b
join public.stock_symbols s on s.id = b.symbol_id
join public.stock_markets m on m.id = s.market_id
group by m.code, s.market_id, s.code
order by s.market_id, s.code;
```

### 查看宽表复权覆盖情况

```sql
select
  m.code as market,
  s.code,
  count(*) filter (where b.qfq_close is not null) as qfq_rows,
  count(*) filter (where b.hfq_close is not null) as hfq_rows
from public.stock_daily_bars b
join public.stock_symbols s on s.id = b.symbol_id
join public.stock_markets m on m.id = s.market_id
group by m.code, s.market_id, s.code
order by s.market_id, s.code;
```

### 查看导入任务状态

```sql
select
  p.code as provider,
  r.job_type,
  r.status,
  r.symbol_count,
  r.row_count,
  r.started_at,
  r.finished_at,
  r.error_message
from public.stock_ingestion_runs r
join public.stock_providers p on p.id = r.provider_id
order by r.started_at desc
limit 20;
```

## 运维建议

### 1. 导入节奏

- 首次导入：使用 `--job-type backfill`。
- 日常更新：使用 `--job-type incremental`。
- 缺口修复：使用 `--job-type repair`。

### 2. 增量同步建议

推荐命令：

```bash
python3 database/import_akshare_history.py \
  --symbols-file database/symbols.example.csv \
  --adjust-modes raw,qfq,hfq \
  --job-type incremental \
  --incremental-from-db
```

脚本逻辑：

1. 先查每只股票在 `stock_daily_bars` 里的最近两个 `trade_date`。
2. 有两条历史记录时，从倒数第二个交易日开始抓取。
3. 只有一条历史记录时，从这条记录开始抓取。
4. 没有历史记录时，走完整历史导入。
5. 对这个时间段重新抓取并 upsert。

效果：

- 避免重复行。
- 覆盖最近一个完整交易日和最新交易日的数据修订。
- 自动避开周末和节假日判断，因为起点来自数据库已有交易日。

### 3. 批次控制

- 资产池级别：`--batch-size 500` 足够。
- 大规模历史回填：保持 `500` 或更低，稳定性更高。

### 4. 观测指标

重点观察：

- `stock_ingestion_runs.status`
- `stock_ingestion_runs.row_count`
- `stock_ingestion_runs.error_message`

### 5. 数据质量检查

建议定期检查：

- `raw_*` 价格是否符合高低点边界。
- `qfq_*` 和 `hfq_*` 是否有缺失。

## 后续扩展建议

- 将 `public` schema 迁移到专用 `market_data` schema。
- 增加 `corporate_actions` 表，保存分红、送转、拆股事件。
- 增加按年分区，承载更大规模的历史库。
- 增加增量同步脚本，自动读取每只股票的 `last_trade_date`。
- 大批量导入时引入 `COPY -> staging -> merge` 流程。

## 当前建议

先清空当前数据库对象，再执行最新版 [02_create_tables.sql](/Users/liuxiaochen/Desktop/有意思/ai/StockAnalyst/database/02_create_tables.sql:1)，最后用新版 [import_akshare_history.py](/Users/liuxiaochen/Desktop/有意思/ai/StockAnalyst/database/import_akshare_history.py:1) 正式写入 `stock_daily_bars`。这套结构适合当前日线宽表和批量导入场景。
