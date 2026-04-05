# 项目外部接口文档

本文档汇总了 StockAnalyst 项目中使用的所有外部数据源接口，包括东方财富、天天基金、腾讯财经和汇率API。

---

## 📋 目录

1. [东方财富 (Eastmoney)](#1-东方财富-eastmoney)
2. [天天基金 (Tiantian Fund)](#2-天天基金-tiantian-fund)
3. [腾讯财经 (Tencent Finance)](#3-腾讯财经-tencent-finance)
4. [汇率API (Exchange Rate)](#4-汇率api-exchange-rate)
5. [后端代理服务](#5-后端代理服务)

---

## 1. 东方财富 (Eastmoney)

**基础URL**: `https://push2his.eastmoney.com/api/qt/stock/kline/get`

**说明**: 东方财富是国内主流的金融数据提供商，本项目主要使用其历史K线数据接口。

### 1.1 A股历史K线数据

| 属性 | 说明 |
|-----|------|
| **接口地址** | `https://push2his.eastmoney.com/api/qt/stock/kline/get` |
| **请求方式** | GET |
| **数据来源** | 东方财富 |
| **调用方式** | 前端直接调用（无CORS限制） |
| **代码文件** | `src/api/adapters/eastmoney.ts` → `getAStockKLineEastmoney()` |

#### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|-------|------|-----|------|
| secid | string | 是 | 股票标识，格式为 `市场代码.股票代码`。上海市场=1，深圳市场=0。例如：`1.600050` |
| fields1 | string | 否 | 字段组1，默认值：`f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13` |
| fields2 | string | 否 | 字段组2，默认值：`f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` |
| klt | string | 是 | K线周期：`101`=日K, `102`=周K, `103`=月K |
| fqt | string | 是 | 复权类型：`0`=不复权, `1`=前复权, `2`=后复权 |
| beg | string | 是 | 开始日期，格式：`YYYYMMDD` |
| end | string | 是 | 结束日期，格式：`YYYYMMDD` |
| ut | string | 否 | 用户Token，固定值：`fa5fd1943c7b386f172d6893dbfba10b` |
| _ | number | 否 | 时间戳，用于防止缓存 |

#### 返回数据格式

```json
{
  "data": {
    "klines": [
      "2024-01-02,4.56,4.62,4.55,4.65,1234567",  // 日期,开盘价,收盘价,最低价,最高价,成交量
      "2024-01-03,4.62,4.58,4.57,4.63,987654"
    ]
  }
}
```

#### K线数据字段说明

| 字段索引 | 字段名 | 说明 |
|---------|-------|------|
| 0 | date | 交易日期 (YYYY-MM-DD) |
| 1 | open | 开盘价 |
| 2 | close | 收盘价 |
| 3 | low | 最低价 |
| 4 | high | 最高价 |
| 5 | volume | 成交量（股） |

#### TypeScript 函数签名

```typescript
export async function getAStockKLineEastmoney(
  code: string,              // 股票代码，如：600050
  period: 'day' | 'week' | 'month' = 'day',  // K线周期
  startDate?: string,        // 开始日期 YYYYMMDD
  endDate?: string           // 结束日期 YYYYMMDD
): Promise<KLineData[]>
```

---

### 1.2 港股历史K线数据

| 属性 | 说明 |
|-----|------|
| **接口地址** | `https://push2his.eastmoney.com/api/qt/stock/kline/get` |
| **请求方式** | GET |
| **数据来源** | 东方财富 |
| **调用方式** | 前端直接调用 |
| **代码文件** | `src/api/adapters/eastmoney.ts` → `getHKStockKLineEastmoney()` |

#### 请求参数

与A股K线接口相同，主要区别在于 `secid` 参数：
- 港股市场代码为 `116`，例如：`116.00700`（腾讯控股）

#### TypeScript 函数签名

```typescript
export async function getHKStockKLineEastmoney(
  code: string,              // 港股代码，如：00700
  period: 'day' | 'week' | 'month' = 'day',
  startDate?: string,
  endDate?: string
): Promise<KLineData[]>
```

---

### 1.3 基准指数K线数据

| 属性 | 说明 |
|-----|------|
| **接口地址** | `https://push2his.eastmoney.com/api/qt/stock/kline/get` |
| **请求方式** | GET |
| **数据来源** | 东方财富 |
| **调用方式** | 前端直接调用 |
| **代码文件** | `src/api/adapters/eastmoney.ts` → `getBenchmarkKLine()` |

#### 支持的基准指数

| 指数代码 | 指数名称 | secid |
|---------|---------|-------|
| csi300 | 沪深300 | `1.000300` |
| shanghai | 上证指数 | `1.000001` |
| none | 无基准 | - |

#### TypeScript 函数签名

```typescript
export async function getBenchmarkKLine(
  benchmark: BenchmarkIndex,    // 'csi300' | 'shanghai' | 'none'
  startDate: string,             // YYYYMMDD
  endDate: string,               // YYYYMMDD
  period: 'day' | 'week' | 'month' = 'day'
): Promise<KLineData[]>
```

---

### 1.4 基金历史净值数据

| 属性 | 说明 |
|-----|------|
| **接口地址** | `https://fundf10.eastmoney.com/F10DataApi.aspx` |
| **请求方式** | GET |
| **数据来源** | 东方财富 - 基金F10数据 |
| **调用方式** | 后端代理（解决CORS）→ `http://localhost:3001/api/fundnav/history` |
| **代码文件** | `src/api/adapters/eastmoney.ts` → `getFundNavHistory()` |

#### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|-------|------|-----|------|
| type | string | 是 | 数据类型，固定值：`lsjz`（历史净值） |
| code | string | 是 | 基金代码，如：`007466` |
| sdate | string | 否 | 开始日期，格式：`YYYY-MM-DD` |
| edate | string | 否 | 结束日期，格式：`YYYY-MM-DD` |
| per | number | 否 | 每页记录数，默认：`500` |
| page | number | 否 | 页码，默认：`1` |

#### 返回数据格式

返回HTML格式的表格数据，需要前端解析：

```html
<table>
  <tbody>
    <tr>
      <td>2024-01-02</td>     <!-- 日期 -->
      <td>1.2345</td>          <!-- 单位净值 -->
      <td>1.3456</td>          <!-- 累计净值 -->
      <td>0.12%</td>           <!-- 日增长率 -->
    </tr>
  </tbody>
</table>
```

#### TypeScript 函数签名

```typescript
export async function getFundNavHistory(
  fundCode: string,           // 基金代码
  startDate?: string,         // YYYYMMDD 或 YYYY-MM-DD
  endDate?: string            // YYYYMMDD 或 YYYY-MM-DD
): Promise<{
  date: string;               // YYYY-MM-DD
  unitNav: number;            // 单位净值
  accumulatedNav: number;     // 累计净值
  changePercent: number;      // 日增长率（小数形式，如0.0012 = 0.12%）
}[]>
```

---

### 1.5 获取基金全部历史净值

| 属性 | 说明 |
|-----|------|
| **接口地址** | `https://fundf10.eastmoney.com/F10DataApi.aspx` |
| **请求方式** | GET |
| **调用方式** | 后端代理 → `http://localhost:3001/api/fundnav/all` |
| **代码文件** | `src/api/adapters/eastmoney.ts` → `getFundNavAll()` |

#### 特点
- 使用滑动窗口分页请求，自动获取全部历史数据
- 最大页数限制：200页
- 解析 `var apidata={records:xxx, pages:xxx, content:"..."}` 格式

#### TypeScript 函数签名

```typescript
export async function getFundNavAll(
  fundCode: string,
  startDate?: string          // YYYYMMDD 或 YYYY-MM-DD
): Promise<{
  date: string;
  unitNav: number;
  accumulatedNav: number;
  changePercent: number;
}[]>
```

---

### 1.6 获取指定日期基金净值

| 属性 | 说明 |
|-----|------|
| **接口说明** | 获取基金在指定日期的单位净值和累计净值 |
| **代码文件** | `src/api/adapters/eastmoney.ts` → `getFundNavOnDate()` |

#### TypeScript 函数签名

```typescript
export async function getFundNavOnDate(
  fundCode: string,
  date: string                 // YYYYMMDD 或 YYYY-MM-DD
): Promise<{
  unitNav: number;
  accumulatedNav: number;
} | null>
```

#### 特殊处理
- 如果指定日期是周末/节假日（无净值数据），返回最近一个交易日的净值
- 使用 `getFundNavHistory()` 内部实现

---

## 2. 天天基金 (Tiantian Fund)

**基础URL**: `https://fundgz.1234567.com.cn/js`

**说明**: 天天基金网是东方财富旗下的基金交易平台，提供基金实时估算净值数据。

### 2.1 基金实时行情（含估算净值）

| 属性 | 说明 |
|-----|------|
| **接口地址** | `https://fundgz.1234567.com.cn/js/{fundCode}.js` |
| **请求方式** | GET (JSONP) |
| **数据来源** | 天天基金网 |
| **调用方式** | 前端JSONP调用（绕过CORS） |
| **代码文件** | `src/api/adapters/tiantian.ts` → `getFundQuote()` |

#### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|-------|------|-----|------|
| fundCode | string | 是 | 基金代码，URL路径参数，如：`007466` |
| rt | number | 否 | 时间戳，用于防止缓存 |

#### 完整URL示例

```
https://fundgz.1234567.com.cn/js/007466.js?rt=1704067200000
```

#### JSONP回调函数

天天基金使用固定的全局回调函数名：`jsonpgz`

```javascript
jsonpgz({
  "fundcode": "007466",
  "name": "基金名称",
  "jzrq": "2024-01-01",      // 净值日期
  "dwjz": "1.2345",          // 单位净值
  "gsz": "1.2456",           // 估算净值
  "gszzl": "0.89",           // 估算增长率（%）
  "gztime": "2024-01-01 15:00:00"  // 估算时间
});
```

#### 返回数据字段

| 字段名 | 说明 |
|-------|------|
| fundcode | 基金代码 |
| name | 基金名称 |
| jzrq | 净值日期（YYYYMMDD） |
| dwjz | 单位净值（最新确认净值） |
| gsz | 估算净值（盘中实时估算） |
| gszzl | 估算涨跌幅（%） |
| gztime | 估算时间 |

#### TypeScript 函数签名

```typescript
export async function getFundQuote(
  fundCode: string
): Promise<FundData | null>
```

#### 队列控制机制

由于天天基金使用固定的全局回调函数名 `jsonpgz`，为避免并发请求互相覆盖，实现了串行队列机制：

```typescript
let fundQuoteQueue: Promise<void> = Promise.resolve();

function enqueueFundQuote<T>(task: () => Promise<T>): Promise<T> {
  const queuedTask = fundQuoteQueue.catch(() => undefined).then(task);
  fundQuoteQueue = queuedTask.then(() => undefined, () => undefined);
  return queuedTask;
}
```

#### 超时处理
- 请求超时时间：10秒
- 超时后返回 `null`

---

## 3. 腾讯财经 (Tencent Finance)

**基础URL**: `https://qt.gtimg.cn/q=`

**说明**: 腾讯财经提供股票实时行情数据，本项目主要用作备用数据源。

### 3.1 股票实时行情

| 属性 | 说明 |
|-----|------|
| **接口地址** | `https://qt.gtimg.cn/q={codes}` |
| **请求方式** | GET (JSONP/变量注入) |
| **数据来源** | 腾讯财经 |
| **调用方式** | 前端JSONP调用（指定charset=gbk） |
| **代码文件** | `src/api/adapters/tencent.ts` → `getStockQuote()` |

#### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|-------|------|-----|------|
| codes | string | 是 | 股票代码，多个用逗号分隔。上海前缀 `sh`，深圳前缀 `sz`，港股前缀 `hk`。如：`sh600050,sz000001` |

#### 完整URL示例

```
https://qt.gtimg.cn/q=sh600050,sz000001,hk00700
```

#### 返回数据格式

腾讯财经返回的不是标准JSON，而是JavaScript变量赋值：

```javascript
var v_sh600050="1~中国联通~600050~4.62~4.65~4.61~1234567~...";  // 约45个字段
var v_sz000001="1~平安银行~000001~10.50~10.45~...";
```

#### 字段解析（以 ~ 分隔）

| 索引 | 字段名 | 说明 |
|-----|-------|------|
| 0 | - | 固定值1 |
| 1 | name | 股票名称 |
| 2 | code | 股票代码 |
| 3 | price | 当前价格 |
| 4 | prevClose | 昨日收盘价 |
| 5 | open | 今日开盘价 |
| ... | ... | ... |
| 32 | changePercent | 涨跌幅（%） |
| 36 | volume | 成交量 |
| ... | ... | ... |
| 44 | - | 扩展字段 |

#### TypeScript 函数签名

```typescript
export async function getStockQuote(
  codes: string[]  // 股票代码数组，如：['sh600050', 'hk00700']
): Promise<StockQuote[]>

interface StockQuote {
  code: string;          // 股票代码
  name: string;          // 股票名称
  price: number;         // 当前价格
  prevClose: number;     // 昨日收盘价
  change: number;        // 涨跌额
  changePercent: number; // 涨跌幅（%）
  volume: number;        // 成交量
}
```

#### 特殊处理

1. **GBK编码**: 腾讯财经返回GBK编码，需要设置 `script.charset = 'gbk'`
2. **全局变量**: 数据通过 `v_股票代码` 格式的全局变量传递
3. **轮询检查**: 使用 `setTimeout` 轮询检查全局变量是否设置
4. **清理变量**: 获取数据后删除全局变量，避免内存泄漏

---

## 4. 汇率API (Exchange Rate)

**基础URL**: `https://open.er-api.com/v6/latest/CNY`

**说明**: 提供实时汇率数据，用于港股、美元资产的汇率换算。

### 4.1 获取当前实时汇率

| 属性 | 说明 |
|-----|------|
| **接口地址** | `https://open.er-api.com/v6/latest/CNY` |
| **请求方式** | GET |
| **数据来源** | open.er-api.com（免费汇率API） |
| **调用方式** | 前端直接调用 |
| **代码文件** | `src/api/adapters/exchange.ts` → `getCurrentExchangeRate()` |

#### 返回数据格式

```json
{
  "result": "success",
  "provider": "https://www.exchangerate-api.com",
  "documentation": "https://www.exchangerate-api.com/docs/free",
  "terms_of_use": "https://www.exchangerate-api.com/terms",
  "time_last_update_unix": 1704067200,
  "time_last_update_utc": "Mon, 01 Jan 2024 00:00:00 +0000",
  "time_next_update_unix": 1704153600,
  "time_next_update_utc": "Tue, 02 Jan 2024 00:00:00 +0000",
  "time_eol_unix": 0,
  "base_code": "CNY",
  "rates": {
    "USD": 0.1412,
    "HKD": 1.1023,
    "EUR": 0.1289,
    "JPY": 20.15,
    ...
  }
}
```

#### 汇率计算

API返回的是 `1 CNY = ? 外币`，需要取倒数转换为 `1 外币 = ? CNY`：

```typescript
currentRates = {
  CNY_HKD: 1 / data.rates.HKD,  // 1港币 = ?人民币
  CNY_USD: 1 / data.rates.USD,  // 1美元 = ?人民币
};
```

#### TypeScript 函数签名

```typescript
export async function getCurrentExchangeRate(): Promise<{
  CNY_HKD: number;  // 港币兑人民币汇率
  CNY_USD: number;  // 美元兑人民币汇率
}>
```

#### 缓存机制

- 缓存时长：1小时（`60 * 60 * 1000` ms）
- 缓存命中时直接返回缓存数据，不发起网络请求

#### 降级处理

API调用失败时，使用内置的历史汇率表中最新月份的数据：

```typescript
const HISTORICAL_RATES: Record<string, { CNY_HKD: number; CNY_USD: number }> = {
  '2024-01': { CNY_HKD: 0.92, CNY_USD: 7.15 },
  '2024-02': { CNY_HKD: 0.92, CNY_USD: 7.18 },
  // ...
  '2025-01': { CNY_HKD: 0.93, CNY_USD: 7.35 },
};
```

---

### 4.2 获取历史汇率

| 属性 | 说明 |
|-----|------|
| **数据来源** | 内置历史汇率表（月平均汇率） |
| **代码文件** | `src/api/adapters/exchange.ts` → `getHistoricalExchangeRate()` |

#### TypeScript 函数签名

```typescript
export function getHistoricalExchangeRate(
  date: string  // YYYYMMDD 或 YYYY-MM-DD
): {
  CNY_HKD: number;
  CNY_USD: number;
}
```

#### 特殊处理

如果指定月份无数据，向前查找最近的有效月份：

```typescript
let key = monthKey;  // 如：'2024-03'
while (!HISTORICAL_RATES[key] && key >= '2024-01') {
  // 向前一个月查找
  if (month === 1) {
    key = `${year - 1}-12`;
  } else {
    key = `${year}-${String(month - 1).padStart(2, '0')}`;
  }
}
```

---

### 4.3 金额换算为人民币

| 属性 | 说明 |
|-----|------|
| **代码文件** | `src/api/adapters/exchange.ts` → `convertToCNY()` |

#### TypeScript 函数签名

```typescript
export function convertToCNY(
  amount: number,                                    // 金额
  currency: 'CNY' | 'HKD' | 'USD',                   // 货币类型
  rate: { CNY_HKD: number; CNY_USD: number }         // 汇率
): number
```

#### 换算公式

| 货币 | 公式 |
|-----|------|
| CNY | `amount * 1` |
| HKD | `amount * rate.CNY_HKD` |
| USD | `amount * rate.CNY_USD` |

---

## 5. 后端代理服务

**服务地址**: `http://localhost:3001`

**说明**: 用于解决东方财富基金净值API的CORS限制问题。

### 5.1 服务配置

```javascript
const app = express();
const PORT = 3001;

// CORS配置
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // ...
});
```

### 5.2 代理接口列表

#### 5.2.1 获取基金历史净值

| 属性 | 说明 |
|-----|------|
| **本地地址** | `GET http://localhost:3001/api/fundnav/history` |
| **代理目标** | `https://fundf10.eastmoney.com/F10DataApi.aspx` |
| **源代码** | `server/index.js` |

##### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|-------|------|-----|------|
| code | string | 是 | 基金代码 |
| startDate | string | 否 | 开始日期 `YYYY-MM-DD` |
| endDate | string | 否 | 结束日期 `YYYY-MM-DD` |
| per | string | 否 | 每页条数，默认500 |
| page | string | 否 | 页码，默认1 |

##### 返回格式

原始HTML文本（Content-Type: text/plain; charset=utf-8）

---

#### 5.2.2 获取基金全部历史净值

| 属性 | 说明 |
|-----|------|
| **本地地址** | `GET http://localhost:3001/api/fundnav/all` |
| **代理目标** | `https://fundf10.eastmoney.com/F10DataApi.aspx` |
| **源代码** | `server/index.js` |

##### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|-------|------|-----|------|
| code | string | 是 | 基金代码 |
| startDate | string | 否 | 开始日期 `YYYY-MM-DD` |
| per | string | 否 | 每页条数，默认20 |

##### 返回格式

JSON数组：

```json
[
  {
    "date": "2024-01-02",
    "unitNav": 1.2345,
    "accumulatedNav": 1.3456,
    "changePercent": 0.0012
  },
  ...
]
```

##### 分页逻辑

- 自动分页获取全部历史数据
- 使用滑动窗口算法
- 最大页数限制：200页
- 解析 `var apidata={records:xxx, pages:xxx, ...}` 格式

---

## 6. API统一导出

所有API通过 `src/api/index.ts` 统一导出：

```typescript
import { api } from './api';

// 使用示例
const fundData = await api.fund.getQuote('007466');
const stockKLine = await api.stock.getAStockKLineEastmoney('600050', 'day');
const exchangeRate = await api.exchange.getCurrentRate();
```

### 6.1 导出结构

```typescript
export const api = {
  fund: {
    getQuote: getFundQuote,              // 天天基金 - 实时行情
    getNavHistory: getFundNavHistory,    // 东方财富 - 历史净值
    getNavOnDate: getFundNavOnDate,      // 东方财富 - 指定日期净值
    getNavAll: getFundNavAll,            // 东方财富 - 全部历史
  },
  stock: {
    getQuote: getStockQuote,             // 腾讯财经 - 实时行情
    getAStockKLineEastmoney,             // 东方财富 - A股K线
    getHKStockKLineEastmoney,            // 东方财富 - 港股K线
  },
  exchange: {
    getCurrentRate: getCurrentExchangeRate,      // 实时汇率
    getHistoricalRate: getHistoricalExchangeRate, // 历史汇率
    convertToCNY,                                // 金额换算
  },
  benchmark: {
    getNavHistory: getBenchmarkNavHistory,  // 基准指数净值历史
    configs: BENCHMARK_CONFIGS,             // 基准配置
  },
};
```

---

## 7. 数据源汇总表

| 功能 | 主要数据源 | 备用数据源 | 调用方式 | CORS处理 |
|-----|----------|----------|---------|---------|
| A股K线 | 东方财富 | - | 前端直接 | 无限制 |
| 港股K线 | 东方财富 | - | 前端直接 | 无限制 |
| 基金实时净值 | 天天基金 | - | JSONP | 无需处理 |
| 基金历史净值 | 东方财富 | - | 后端代理 | 代理解决 |
| 股票实时行情 | - | 腾讯财经 | JSONP | 无需处理 |
| 实时汇率 | open.er-api | - | 前端直接 | 无限制 |
| 历史汇率 | 内置表 | - | 本地计算 | - |
| 基准指数K线 | 东方财富 | - | 前端直接 | 无限制 |

---

## 8. 错误处理与降级策略

### 8.1 错误处理模式

所有API接口统一使用 `try-catch` 包裹，错误时返回空数组或null：

```typescript
try {
  const response = await fetch(url);
  const data = await response.json();
  // 处理数据...
  return processedData;
} catch (error) {
  console.error('API error:', error);
  return []; // 或 null
}
```

### 8.2 降级策略

| 场景 | 降级方案 |
|-----|---------|
| 基金实时行情失败 | 使用历史净值数据 |
| 汇率API失败 | 使用内置历史汇率最新值 |
| 后端代理未启动 | 基金历史数据获取失败，提示用户 |
| 股票行情失败 | 使用K线数据中的最新收盘价 |

---

## 9. 启动依赖

### 必需启动的服务

```bash
# 1. 启动后端代理（必须）
cd server
node index.js
# 服务运行在 http://localhost:3001

# 2. 启动前端开发服务器
npm run dev
# 服务运行在 http://localhost:5173
```

### 环境要求

- Node.js 18+
- 后端代理端口：3001（可修改 `server/index.js` 中的 `PORT` 变量）
- 前端开发端口：5173（Vite默认）

---

**文档版本**: 1.0  
**最后更新**: 2026-04  
**维护者**: StockAnalyst Team
