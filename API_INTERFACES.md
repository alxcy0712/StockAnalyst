# 项目接口文档

本文档描述 StockAnalyst 当前运行时使用的接口、数据源和后端契约。股票历史链路当前是“前端 -> 本地 Node 服务 -> Supabase 数据库”，基金历史链路是“前端 -> 本地 Node 服务 -> 东方财富”，基金实时与股票实时行情继续由前端直接请求外部站点。

前端后端基址配置集中定义在 [src/config/application.ts](/Users/liuxiaochen/Desktop/有意思/ai/StockAnalyst/src/config/application.ts:1)。

## 目录

1. [本地后端服务](#1-本地后端服务)
2. [Supabase 数据契约](#2-supabase-数据契约)
3. [股票历史导入链路](#3-股票历史导入链路)
4. [东方财富](#4-东方财富)
5. [天天基金](#5-天天基金)
6. [腾讯财经](#6-腾讯财经)
7. [汇率接口](#7-汇率接口)
8. [API 统一导出](#8-api-统一导出)
9. [数据源汇总与降级](#9-数据源汇总与降级)
10. [启动依赖](#10-启动依赖)

## 1. 本地后端服务

**服务地址**: `http://localhost:3001`

**入口文件**: `server/index.js`

### 1.1 服务职责

- 提供基金历史净值代理接口
- 提供股票代码校验接口
- 提供股票历史 K 线接口
- 统一处理本地开发环境下的跨域访问

### 1.2 CORS 配置

```javascript
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});
```

### 1.3 `GET /api/stock/validate`

校验股票代码是否已经导入 Supabase 历史库，并返回名称和币种。

| 属性 | 说明 |
|-----|------|
| 本地地址 | `GET http://localhost:3001/api/stock/validate` |
| 服务实现 | `server/index.js` |
| 业务逻辑 | `server/stockService.js` |

#### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|-------|------|-----|------|
| market | string | 是 | `a_stock` 或 `hk_stock` |
| code | string | 是 | A 股 6 位代码或港股 5 位代码 |

#### 成功响应

```json
{
  "valid": true,
  "market": "a_stock",
  "code": "600519",
  "name": "贵州茅台",
  "currency": "CNY"
}
```

#### 失败响应

数据库中没有该证券历史数据时返回 `404`：

```json
{
  "valid": false,
  "market": "hk_stock",
  "code": "00700",
  "message": "数据库中暂无 港股 00700 的历史数据"
}
```

参数错误时返回 `400`：

```json
{
  "valid": false,
  "message": "market and code are required"
}
```

### 1.4 `GET /api/stock/kline`

从 Supabase 读取股票历史日线，并按请求周期返回日、周、月序列。

| 属性 | 说明 |
|-----|------|
| 本地地址 | `GET http://localhost:3001/api/stock/kline` |
| 服务实现 | `server/index.js` |
| 服务层 | `server/stockService.js` |
| Provider | `server/providers/database.js` |

#### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|-------|------|-----|------|
| market | string | 是 | `a_stock` 或 `hk_stock` |
| code | string | 是 | 股票代码 |
| period | string | 否 | `day`、`week`、`month`，默认 `day` |
| startDate | string | 否 | 起始日期，前端当前传 `YYYYMMDD` |
| endDate | string | 否 | 结束日期，前端当前传 `YYYYMMDD` |
| fqt | number | 否 | 复权模式，`0=raw`、`1=qfq`、`2=hfq`，默认 `1` |

#### 成功响应

```json
{
  "data": [
    {
      "date": "20240102",
      "open": 1668.0,
      "high": 1688.0,
      "low": 1661.0,
      "close": 1685.0,
      "volume": 32145
    }
  ],
  "providerUsed": "database",
  "attemptedProviders": ["database"],
  "degraded": false,
  "message": null
}
```

#### 错误响应

数据库未配置时返回 `503`：

```json
{
  "message": "数据库未配置，请设置SUPABASE_URL和SUPABASE_SERVICE_ROLE_KEY环境变量",
  "code": "database_not_configured"
}
```

证券不存在时返回 `404`：

```json
{
  "message": "未找到证券: a_stock:600519",
  "code": "symbol_not_found"
}
```

#### 服务行为

- `fqt=0` 读取 `raw_open/raw_high/raw_low/raw_close`
- `fqt=1` 读取 `qfq_open/qfq_high/qfq_low/qfq_close`
- `fqt=2` 读取 `hfq_open/hfq_high/hfq_low/hfq_close`
- 查询按 `trade_date` 升序返回
- 单次分页读取 `1000` 行，超出后继续翻页
- `week` 和 `month` 周期由服务端基于日线聚合生成

### 1.5 `GET /api/fundnav/history`

代理东方财富基金历史净值接口，返回原始 HTML 文本。

| 属性 | 说明 |
|-----|------|
| 本地地址 | `GET http://localhost:3001/api/fundnav/history` |
| 代理目标 | `https://fundf10.eastmoney.com/F10DataApi.aspx` |
| 服务实现 | `server/index.js` |

#### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|-------|------|-----|------|
| code | string | 是 | 基金代码 |
| startDate | string | 否 | `YYYY-MM-DD` |
| endDate | string | 否 | `YYYY-MM-DD` |
| per | string | 否 | 每页条数，默认 `500` |
| page | string | 否 | 页码，默认 `1` |

#### 返回格式

`Content-Type: text/plain; charset=utf-8`

返回体是东方财富原始 HTML 表格文本，前端在 `src/api/adapters/eastmoney.ts` 中解析。

### 1.6 `GET /api/fundnav/all`

代理东方财富基金历史净值接口并自动翻页，返回结构化 JSON 数组。

| 属性 | 说明 |
|-----|------|
| 本地地址 | `GET http://localhost:3001/api/fundnav/all` |
| 代理目标 | `https://fundf10.eastmoney.com/F10DataApi.aspx` |
| 服务实现 | `server/index.js` |

#### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|-------|------|-----|------|
| code | string | 是 | 基金代码 |
| startDate | string | 否 | `YYYY-MM-DD` |
| per | string | 否 | 每页条数，默认 `20`，前端当前传 `500` |

#### 成功响应

```json
[
  {
    "date": "2024-01-02",
    "unitNav": 1.2345,
    "accumulatedNav": 1.3456,
    "changePercent": 0.0012
  }
]
```

#### 服务行为

- 自动分页拉取全部历史数据
- 最大页数限制为 `200`
- 从 `var apidata=...` 响应中提取 `<tbody>` 表格内容

## 2. Supabase 数据契约

股票历史运行时主要依赖两张表，导入审计使用第三张表。

### 2.1 `stock_symbols`

股票主数据表。`/api/stock/validate` 和 `/api/stock/kline` 都先查询这张表定位证券。

| 字段 | 说明 |
|-----|------|
| id | 证券主键 |
| market | `a_stock` / `hk_stock` |
| code | 证券代码 |
| name | 证券名称 |
| currency | 币种 |

### 2.2 `stock_daily_bars`

股票历史宽表。每个 `symbol_id + trade_date` 保留一行，同时存三套价格。

| 字段组 | 说明 |
|-------|------|
| `raw_*` | 不复权价格 |
| `qfq_*` | 前复权价格 |
| `hfq_*` | 后复权价格 |
| `volume` | 成交量 |
| `trade_date` | 交易日期 |

### 2.3 `stock_ingestion_runs`

导入任务审计表。导入脚本会写入任务状态、处理行数和错误信息。

## 3. 股票历史导入链路

运行时查询依赖事先导入的股票历史数据。导入入口文件是 `database/import_akshare_history.py`。

### 3.1 数据来源

- A 股历史数据：AKShare
- 港股历史数据：AKShare
- 存储目标：Supabase Postgres

### 3.2 关键命令

```bash
pip install -r database/requirements.txt
python3 database/import_akshare_history.py \
  --symbols-file database/symbols.example.csv \
  --adjust-modes raw,qfq,hfq
```

### 3.3 导入结果

- 证券主数据写入 `stock_symbols`
- 日线价格写入 `stock_daily_bars`
- 审计记录写入 `stock_ingestion_runs`

完整说明见 [database/README.md](./database/README.md)。

## 4. 东方财富

东方财富当前承担两类职责：基金历史净值源站和基准指数日线源站。

### 4.1 基金历史净值源站

| 属性 | 说明 |
|-----|------|
| 接口地址 | `https://fundf10.eastmoney.com/F10DataApi.aspx` |
| 请求方式 | GET |
| 项目调用方式 | 本地后端代理 |
| 前端代码 | `src/api/adapters/eastmoney.ts` |

#### 前端函数签名

```typescript
export async function getFundNavHistory(
  fundCode: string,
  startDate?: string,
  endDate?: string
): Promise<{
  date: string;
  unitNav: number;
  accumulatedNav: number;
  changePercent: number;
}[]>

export async function getFundNavAll(
  fundCode: string,
  startDate?: string
): Promise<{
  date: string;
  unitNav: number;
  accumulatedNav: number;
  changePercent: number;
}[]>

export async function getFundNavOnDate(
  fundCode: string,
  date: string
): Promise<{
  unitNav: number;
  accumulatedNav: number;
} | null>
```

#### 前端行为

- `getFundNavHistory()` 会把 `YYYYMMDD` 转成 `YYYY-MM-DD`
- `getFundNavOnDate()` 在休市日回退到最近一个有净值的交易日
- `getFundNavAll()` 直接消费后端已经结构化好的 JSON

### 4.2 基准指数日线

| 属性 | 说明 |
|-----|------|
| 接口地址 | `https://push2his.eastmoney.com/api/qt/stock/kline/get` |
| 请求方式 | GET |
| 项目调用方式 | 前端直接调用 |
| 前端代码 | `src/api/adapters/eastmoney.ts` |

#### 支持的基准

| 代码 | 名称 | secid |
|-----|------|-------|
| `csi300` | 沪深300 | `1.000300` |
| `shanghai` | 上证指数 | `1.000001` |
| `none` | 无基准 | 空 |

#### 前端函数签名

```typescript
export async function getBenchmarkKLine(
  benchmark: BenchmarkIndex,
  startDate: string,
  endDate: string,
  period?: 'day' | 'week' | 'month'
): Promise<KLineData[]>

export async function getBenchmarkNavHistory(
  benchmark: BenchmarkIndex,
  startDate: string,
  endDate: string
): Promise<BenchmarkNavPoint[]>
```

## 5. 天天基金

**基础地址**: `https://fundgz.1234567.com.cn/js`

基金实时净值和估算净值由天天基金提供。

| 属性 | 说明 |
|-----|------|
| 请求方式 | GET(JSONP) |
| 项目调用方式 | 前端 JSONP |
| 前端代码 | `src/api/adapters/tiantian.ts` |

### 5.1 `getFundQuote()`

```typescript
export async function getFundQuote(
  fundCode: string
): Promise<FundData | null>
```

### 5.2 返回字段

| 字段 | 说明 |
|-----|------|
| fundcode | 基金代码 |
| name | 基金名称 |
| jzrq | 最新确认净值日期 |
| dwjz | 最新确认单位净值 |
| gsz | 盘中估算净值 |
| gszzl | 估算涨跌幅 |
| gztime | 估算时间 |

### 5.3 特殊处理

- 使用固定全局回调 `jsonpgz`
- 通过串行队列避免并发回调覆盖
- 请求超时后返回 `null`

## 6. 腾讯财经

**基础地址**: `https://qt.gtimg.cn/q=`

腾讯财经当前承担股票名称识别和实时行情补充。

| 属性 | 说明 |
|-----|------|
| 请求方式 | GET(JSONP/变量注入) |
| 项目调用方式 | 前端 JSONP |
| 前端代码 | `src/api/adapters/tencent.ts` |

### 6.1 `getStockQuote()`

```typescript
export async function getStockQuote(
  codes: string[]
): Promise<StockQuote[]>
```

### 6.2 请求示例

```text
https://qt.gtimg.cn/q=sh600050,sz000001,hk00700
```

### 6.3 返回字段

返回结果经前端解析后统一映射为：

```typescript
interface StockQuote {
  code: string;
  name: string;
  price: number;
  prevClose: number;
  change: number;
  changePercent: number;
  volume?: number;
}
```

### 6.4 特殊处理

- `script.charset = 'gbk'`
- 通过全局变量 `v_{code}` 读取结果
- 轮询等待变量注入完成后再解析

## 7. 汇率接口

### 7.1 实时汇率

| 属性 | 说明 |
|-----|------|
| 接口地址 | `https://open.er-api.com/v6/latest/CNY` |
| 请求方式 | GET |
| 项目调用方式 | 前端直接调用 |
| 前端代码 | `src/api/adapters/exchange.ts` |

```typescript
export async function getCurrentExchangeRate(): Promise<{
  CNY_HKD: number;
  CNY_USD: number;
}>
```

服务返回的是 `1 CNY = ? 外币`，前端会取倒数转换成 `1 HKD/USD = ? CNY`。

### 7.2 历史汇率

```typescript
export function getHistoricalExchangeRate(
  date: string
): {
  CNY_HKD: number;
  CNY_USD: number;
}
```

历史汇率来自内置月度汇率表。

### 7.3 人民币换算

```typescript
export function convertToCNY(
  amount: number,
  currency: 'CNY' | 'HKD' | 'USD',
  rate: { CNY_HKD: number; CNY_USD: number }
): number
```

## 8. API 统一导出

所有前端 API 通过 `src/api/index.ts` 统一导出：

```typescript
export const api = {
  fund: {
    getQuote: getFundQuote,
    getNavHistory: getFundNavHistory,
    getNavOnDate: getFundNavOnDate,
    getNavAll: getFundNavAll,
  },
  stock: {
    getQuote: getStockQuote,
    validateCode: validateStockCode,
    getAStockKLine,
    getHKStockKLine,
  },
  exchange: {
    getCurrentRate: getCurrentExchangeRate,
    getHistoricalRate: getHistoricalExchangeRate,
    convertToCNY,
  },
  benchmark: {
    getNavHistory: getBenchmarkNavHistory,
    configs: BENCHMARK_CONFIGS,
  },
};
```

### 8.1 股票前端函数签名

`src/api/adapters/stockHistory.ts` 对后端 envelope 做了解包，前端业务层直接拿 `KLineData[]`：

```typescript
export async function validateStockCode(
  market: StockMarket,
  code: string
): Promise<StockValidationResult>

export async function getAStockKLine(
  code: string,
  period?: 'day' | 'week' | 'month',
  startDate?: string,
  endDate?: string,
  fqt?: 0 | 1 | 2
): Promise<KLineData[]>

export async function getHKStockKLine(
  code: string,
  period?: 'day' | 'week' | 'month',
  startDate?: string,
  endDate?: string,
  fqt?: 0 | 1 | 2
): Promise<KLineData[]>
```

## 9. 数据源汇总与降级

| 功能 | 主要数据源 | 调用方式 | 失败后的表现 |
|-----|----------|---------|-------------|
| 股票代码校验 | Supabase | 本地后端 | 表单提示数据库中暂无该资产历史数据 |
| 股票历史日线 | Supabase | 本地后端 | 组合计算回退到买入价常量序列 |
| 股票实时行情 | 腾讯财经 | 前端 JSONP | 名称识别失败，用户可手动输入名称 |
| 基金实时净值 | 天天基金 | 前端 JSONP | 组合展示回退到最近正式净值 |
| 基金历史净值 | 东方财富 | 本地后端代理 | 指定基金历史曲线为空 |
| 基准指数 | 东方财富 | 前端直接请求 | 基准曲线为空 |
| 实时汇率 | open.er-api | 前端直接请求 | 回退到内置历史汇率表 |

## 10. 启动依赖

### 10.1 必需服务

```bash
# 终端 1
export SUPABASE_URL='https://your-project.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='your-service-role-key'
npm run server

# 终端 2
npm run dev
```

### 10.2 环境要求

- Node.js 18+
- Python 3.10+（运行导入脚本）
- Supabase 项目和已初始化的股票历史表
- 本地后端端口：`3001`
- 前端开发端口：`5173`

### 10.3 当前部署约束

- 前端统一通过 [src/config/application.ts](/Users/liuxiaochen/Desktop/有意思/ai/StockAnalyst/src/config/application.ts:1) 读取后端基址
- 后端监听端口当前定义在 [server/index.js](/Users/liuxiaochen/Desktop/有意思/ai/StockAnalyst/server/index.js:5)

发布到生产环境前，建议先统一前端配置和后端监听端口。
