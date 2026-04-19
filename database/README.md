# Database Scripts

本目录用于管理股票历史数据的数据库结构、导入脚本和执行说明。当前方案面向 `Supabase Postgres`，数据抓取来源是 `AKShare`。新版结构采用“单张宽表日线”的设计，每个证券每个交易日只保存一行，同时包含不复权、前复权、后复权三套价格。

## 目录结构

- `01_create_database.sql`
  用于本地 PostgreSQL 手工建库，默认创建 `stock_analyst` 数据库。Supabase 项目已经自带数据库，这个文件主要服务本地实验环境。
- `02_create_tables.sql`
  用于 Supabase 的建表与升级。脚本包含主数据表、宽表日线、导入审计表、触发器和中文注释。
- `import_akshare_history.py`
  历史数据导入脚本。支持批量 CSV 导入、单个标的导入、时间区间过滤、任务类型标记和 dry-run。
- `symbols.example.csv`
  批量导入示例文件，采用最简 `market,code` 两列格式。
- `requirements.txt`
  Python 依赖声明。

## 为什么改成宽表

旧方案把不复权和复权信息拆成多张事实表，逻辑清楚，空间利用率偏低。  
新版方案将一个证券在一个交易日的三套价格放进同一行：

- `raw_*`：不复权价格
- `qfq_*`：前复权价格
- `hfq_*`：后复权价格

这套设计更适合当前项目，原因有三点：

- 行数直接下降到原先多表模型的约三分之一
- 查询单个证券的完整价格序列更直接
- 增量导入只需要对 `(symbol_id, trade_date)` 做一次 upsert

## 当前表结构总览

当前新流程只写三张表：

- `public.stock_symbols`
- `public.stock_daily_bars`
- `public.stock_ingestion_runs`

以下旧表如果存在，会被保留为兼容层，不再参与新导入流程：

- `public.stock_daily_bars_legacy`
- `public.stock_daily_bars_raw`
- `public.stock_adjustment_factors`

## 各个表的职责和用法

### 1. `public.stock_symbols`

这张表是证券主数据表。每只股票在系统里只保留一个统一身份。

这张表解决的问题：

- 这只股票是谁
- 它属于哪个市场和交易所
- 它的系统统一代码是什么
- 它当前是否还活跃

核心字段：

- `id`
  系统内部主键，所有事实表都通过它关联
- `market`
  市场类型，当前支持 `a_stock`、`hk_stock`
- `code`
  市场内证券代码，例如 `600519`、`00700`
- `exchange`
  交易所代码，例如 `SSE`、`SZSE`、`HKEX`
- `canonical_symbol`
  系统统一证券标识，例如 `SH:600519`、`HK:00700`
- `name`
  证券名称
- `currency`
  币种，例如 `CNY`、`HKD`
- `list_status`
  上市状态，例如 `active`
- `metadata`
  扩展 JSON 字段

使用方式：

- 所有查询先通过 `stock_symbols` 找到 `symbol_id`
- 所有行情事实数据都通过 `symbol_id` 关联到这张表

- 导入脚本按 `market + code` 在运行时生成 AKShare 请求代码，数据库里不再单独保存 Provider 映射
- CSV 导入时会先做格式校验，无效行会跳过，只保留合格证券

### 2. `public.stock_daily_bars`

这张表是新版核心事实表，也是你最常用的一张表。  
它是一张宽表，每个 `symbol_id + trade_date` 只保留一行，同时存三套日线价格：

- 不复权：`raw_open/raw_high/raw_low/raw_close`
- 前复权：`qfq_open/qfq_high/qfq_low/qfq_close`
- 后复权：`hfq_open/hfq_high/hfq_low/hfq_close`

同时它还保留：

- `volume`
- `amount`
- `provider`
- `source_updated_at`
- `ingestion_run_id`
- `imported_at`
- `updated_at`

这张表解决的问题：

- 给前端返回任意口径的日线价格
- 给组合净值和收益率计算提供统一底座
- 给增量导入提供唯一键

使用方式：

- 前端查日线，直接按 `symbol_id + trade_date` 读取
- 估值场景优先用 `qfq_close`
- 对账或还原真实历史成交口径时，用 `raw_close`
- 需要后复权时，使用 `hfq_close`
- `source_updated_at` 预留给后续更细的源端时间戳管理，当前导入脚本保持为空

典型查询：

- 单只股票近 5 年前复权收盘价序列
- 单只股票全部不复权 OHLCV
- 多只股票最近一个交易日的后复权收盘价

### 3. `public.stock_ingestion_runs`

这张表是导入任务审计表。每跑一次回填、增量、修复任务，都会产生一条记录。

这张表解决的问题：

- 这次导入跑了多少只股票
- 一共处理了多少行
- 什么时候开始、什么时候结束
- 失败时具体报了什么错
- 当时传入了哪些参数

核心字段：

- `provider`
  本次导入使用的数据源
- `job_type`
  `backfill`、`incremental`、`repair`
- `status`
  `running`、`succeeded`、`failed`、`partial`
- `symbol_count`
  计划处理的股票数
- `row_count`
  实际处理的日线行数
- `request_params`
  参数快照
- `error_message`
  错误信息

使用方式：

- 运维排查时，先查这张表
- 增量同步时，用它确认上一次任务是否成功
- 后续做自动任务调度时，这张表是最重要的观察入口

## 执行顺序

### 1. 创建 Supabase 项目

在 Supabase 后台创建项目，例如 `StockAnalyst`。

### 2. 执行建表 SQL

打开 Supabase 的 `SQL Editor`，执行：

- `database/02_create_tables.sql`

这个脚本会做四件事：

- 创建新版表结构
- 自动补齐旧版主数据表缺失列
- 清理旧版 Provider 映射字段和映射表
- 如果发现旧版 `stock_daily_bars` 是窄表结构，就自动重命名为 `stock_daily_bars_legacy`

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

- `SUPABASE_URL` 是项目 URL
- `SUPABASE_SERVICE_ROLE_KEY` 可以填写 `service_role` 或 `sb_secret_...`
- 这类 key 属于高权限服务端密钥，建议只保留在本机环境变量中

### 5. 准备股票清单

格式参考 [symbols.example.csv](/Users/liuxiaochen/Desktop/有意思/ai/StockAnalyst/database/symbols.example.csv:1)：

```csv
market,code
A股,600519
港股,00700
```

字段说明：

- `market`：支持 `a_stock`、`hk_stock`、`A股`、`港股`
- `code`：A 股用 `600519` 这类六码，港股用 `00700` 这类五码
- `name`：第三列可选，脚本支持 `market,code,name` 三列格式

校验规则：

- A 股代码必须是 `6` 位数字
- 港股代码必须是 `1` 到 `5` 位数字，写入前会自动补齐成 `5` 位
- 无效行会在控制台输出 `[skip] ...`，导入继续执行
- 港股 `raw` 如果出现和上一交易日 `OHLCV` 完全重复的连续行，脚本会自动剔除

### 6. 先执行 dry-run

```bash
python3 database/import_akshare_history.py \
  --symbols-file database/symbols.example.csv \
  --adjust-modes raw,qfq,hfq \
  --dry-run
```

dry-run 只抓数和统计，不写入数据库。

### 7. 正式写入数据库

```bash
python3 database/import_akshare_history.py \
  --symbols-file database/symbols.example.csv \
  --adjust-modes raw,qfq,hfq
```

单个标的导入示例：

```bash
python3 database/import_akshare_history.py \
  --market hk_stock \
  --code 00700 \
  --name 腾讯控股 \
  --adjust-modes raw,qfq,hfq
```

## 导入脚本现在怎么工作

新版导入脚本的流程如下：

1. 读取并校验股票清单，剔除不合格行
2. 创建一条 `stock_ingestion_runs` 任务记录
3. 对每只股票抓取 `raw` 日线
4. 港股 `raw` 自动剔除与上一条 `OHLCV` 完全重复的连续行
5. 对需要的模式抓取 `qfq/hfq` 日线
6. 将同一天的 `raw/qfq/hfq` 价格合并成同一行
7. upsert 到 `stock_daily_bars`
8. 更新 `stock_ingestion_runs` 的状态和处理行数

这里有一个关键点：

- `raw` 总是会写入宽表
- `qfq/hfq` 是可选列
- 宽表的唯一键永远是 `(symbol_id, trade_date)`

这意味着：

- 重复导入同一时间段不会产生重复行
- 增量同步可以直接重跑最近几天的数据
- 同一天已有记录时，会走 merge-upsert 覆盖更新

## 常用参数

- `--symbols-file`
  批量导入的 CSV 文件路径，支持最简两列格式
- `--market`
  单个导入时指定市场
- `--code`
  单个导入时指定代码
- `--name`
  单个导入时指定名称
- `--adjust-modes`
  支持 `raw,qfq,hfq`，默认 `raw,qfq`
- `--job-type`
  支持 `backfill`、`incremental`、`repair`
- `--start-date`
  起始日期，格式 `YYYY-MM-DD`
- `--end-date`
  截止日期，格式 `YYYY-MM-DD`
- `--batch-size`
  单次批量 upsert 的行数，默认 `500`
- `--pause-seconds`
  每个 symbol 完成后的暂停秒数，默认 `0.2`
- `--dry-run`
  只抓数和统计，不写库

## 推荐查询方式

### 查询一只股票的不复权日线

```sql
select
  s.market,
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
where s.market = 'a_stock'
  and s.code = '600519'
order by b.trade_date;
```

### 查询一只股票的前复权收盘价

```sql
select
  s.market,
  s.code,
  b.trade_date,
  b.qfq_close
from public.stock_daily_bars b
join public.stock_symbols s on s.id = b.symbol_id
where s.market = 'hk_stock'
  and s.code = '00700'
order by b.trade_date;
```

### 查询最近一个交易日的后复权收盘价

```sql
select
  s.market,
  s.code,
  s.name,
  b.trade_date,
  b.hfq_close
from public.stock_daily_bars b
join public.stock_symbols s on s.id = b.symbol_id
where b.trade_date = (
  select max(trade_date) from public.stock_daily_bars
)
order by s.market, s.code;
```

## 验证 SQL

### 查看证券主数据

```sql
select
  market,
  code,
  canonical_symbol,
  exchange,
  name,
  list_status
from public.stock_symbols
order by market, code;
```

### 查看宽表日线行数

```sql
select
  s.market,
  s.code,
  count(*) as bars_rows,
  min(b.trade_date) as first_trade_date,
  max(b.trade_date) as last_trade_date
from public.stock_daily_bars b
join public.stock_symbols s on s.id = b.symbol_id
group by s.market, s.code
order by s.market, s.code;
```

### 查看宽表复权覆盖情况

```sql
select
  s.market,
  s.code,
  count(*) filter (where b.qfq_close is not null) as qfq_rows,
  count(*) filter (where b.hfq_close is not null) as hfq_rows
from public.stock_daily_bars b
join public.stock_symbols s on s.id = b.symbol_id
group by s.market, s.code
order by s.market, s.code;
```

### 查看导入任务状态

```sql
select
  provider,
  job_type,
  status,
  symbol_count,
  row_count,
  started_at,
  finished_at,
  error_message
from public.stock_ingestion_runs
order by started_at desc
limit 20;
```

## 迁移说明

如果你之前已经执行过旧版脚本，当前升级路径如下：

- 重新执行最新版 `02_create_tables.sql`
- 旧版 `stock_symbol_provider_mappings` 会被删除
- 旧版 `stock_daily_bars` 如果是窄表，会被自动改名为 `stock_daily_bars_legacy`
- 旧版 `stock_daily_bars_raw` 和 `stock_adjustment_factors` 会保留
- 新导入流程只写：
  - `stock_symbols`
  - `stock_daily_bars`
  - `stock_ingestion_runs`

如果旧表里已经有数据，你有两种处理方式：

- 直接重新导入历史数据到新版宽表
- 额外写一段一次性 SQL，把旧表数据合并迁移到 `stock_daily_bars`

当前目录先采用第一种，路径最稳，逻辑最清楚。

## 运维建议

### 1. 导入节奏

- 首次导入：使用 `--job-type backfill`
- 日常更新：使用 `--job-type incremental`
- 缺口修复：使用 `--job-type repair`

### 2. 增量同步建议

推荐逻辑：

1. 先查每只股票在 `stock_daily_bars` 里的最大 `trade_date`
2. 将新的抓取起点设为 `last_trade_date` 往前回看 `5` 到 `10` 个交易日
3. 对这个时间段重新抓取并 upsert

这样做的好处：

- 不会产生重复行
- 可以覆盖最近几天供应商修订的数据
- 可以修复漏抓的交易日

### 3. 批次控制

- 资产池级别：`--batch-size 500` 足够
- 大规模历史回填：保持 `500` 或更低，稳定性更高

### 4. 观测指标

重点观察：

- `stock_ingestion_runs.status`
- `stock_ingestion_runs.row_count`
- `stock_ingestion_runs.error_message`

### 5. 数据质量检查

建议定期检查：

- `raw_*` 价格是否符合高低点边界
- `qfq_*` 和 `hfq_*` 是否有缺失

## 后续扩展建议

- 将 `public` schema 迁移到专用 `market_data` schema
- 增加 `corporate_actions` 表，保存分红、送转、拆股事件
- 增加按年分区，承载更大规模的历史库
- 增加增量同步脚本，自动读取每只股票的 `last_trade_date`
- 大批量导入时引入 `COPY -> staging -> merge` 流程

## 当前建议

先重新执行最新版 [02_create_tables.sql](/Users/liuxiaochen/Desktop/有意思/ai/StockAnalyst/database/02_create_tables.sql:1)，再用新版 [import_akshare_history.py](/Users/liuxiaochen/Desktop/有意思/ai/StockAnalyst/database/import_akshare_history.py:1) 正式写入 `stock_daily_bars`。这套结构已经是你当前场景里最合适的日线宽表方案。
