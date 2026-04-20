# 金融资产模拟回测

一个以前端为主、Node 数据服务为辅的金融资产回测工具。A 股和港股历史数据通过本地后端从 Supabase 数据库读取，基金历史净值通过后端代理抓取东方财富，资产持仓和前端缓存继续保存在浏览器本地。

后端访问地址集中定义在 [src/config/application.ts](/Users/liuxiaochen/Desktop/有意思/ai/StockAnalyst/src/config/application.ts:1)。

## 文档导航

| 文档 | 说明 |
|-----|------|
| [README.md](./README.md) | 项目介绍、启动方式、使用说明 |
| [API_INTERFACES.md](./API_INTERFACES.md) | 运行时接口、外部数据源、后端接口契约 |
| [database/README.md](./database/README.md) | Supabase 表结构、AKShare 导入脚本、批量导入说明 |

## 当前能力

- 支持 A 股、港股、基金的组合回测和净值走势展示
- 股票历史数据基于数据库宽表，支持不复权、前复权、后复权三套价格
- 股票录入时先识别名称，再校验该证券是否已经导入数据库
- 基金实时净值来自天天基金，基金历史净值来自东方财富代理接口
- 支持沪深300、上证指数基准对比
- 资产数据、汇率缓存、历史序列缓存保存在浏览器本地

## 系统架构

### 前端

- React + TypeScript 单页应用
- Zustand 管理资产和全局状态
- IndexedDB 与 localStorage 缓存组合历史序列和用户资产

### 后端数据服务

- `server/index.js` 提供本地 HTTP 服务，默认端口 `3001`
- `/api/fundnav/*` 负责代理东方财富基金历史净值接口
- `/api/stock/*` 负责股票代码校验和历史 K 线查询

### 股票历史数据库

- `server/stockService.js` 使用 Supabase 客户端访问数据库
- `server/providers/database.js` 从 `stock_symbols` 和 `stock_daily_bars` 读取日线数据
- `database/import_akshare_history.py` 使用 AKShare 拉取历史数据并写入 Supabase

## 技术栈

| 类别 | 技术 |
|-----|------|
| 前端框架 | React 19 + TypeScript 5.9 |
| 构建工具 | Vite 7 |
| 样式 | Tailwind CSS 3.4 + `@tailwindcss/vite` |
| 图表 | ECharts 6 |
| 状态管理 | Zustand |
| 后端服务 | Express 5 |
| 数据库 | Supabase Postgres |
| 股票导入 | Python + AKShare |
| 测试 | Vitest + React Testing Library |
| 动画 | Framer Motion |

## 数据来源

| 功能 | 数据来源 | 接入方式 |
|-----|----------|---------|
| A股历史日线 | Supabase `stock_daily_bars` | 前端调用本地后端 `/api/stock/kline` |
| 港股历史日线 | Supabase `stock_daily_bars` | 前端调用本地后端 `/api/stock/kline` |
| 股票实时行情与名称识别 | 腾讯财经 | 前端 JSONP |
| 股票可用性校验 | Supabase `stock_symbols` | 前端调用本地后端 `/api/stock/validate` |
| 基金实时净值 | 天天基金 | 前端 JSONP |
| 基金历史净值 | 东方财富 F10 | 后端代理 `/api/fundnav/*` |
| 基准指数 | 东方财富 | 前端直接请求 |
| 实时汇率 | open.er-api | 前端直接请求 |
| 历史汇率 | 内置汇率表 | 前端本地计算 |

## 项目结构

```text
StockAnalyst/
├── server/
│   ├── index.js                  # 本地数据服务入口
│   ├── stockService.js           # 股票历史查询服务层
│   └── providers/
│       ├── common.js             # Provider 公共工具
│       └── database.js           # Supabase 数据库 Provider
├── database/
│   ├── 02_create_tables.sql      # Supabase 建表脚本
│   ├── import_akshare_history.py # 股票历史导入脚本
│   ├── symbols.example.csv       # 批量导入示例
│   └── README.md                 # 数据库与导入说明
├── src/
│   ├── api/
│   │   ├── index.ts
│   │   └── adapters/
│   │       ├── stockHistory.ts   # 本地股票历史接口
│   │       ├── eastmoney.ts      # 基金历史净值、基准指数
│   │       ├── tiantian.ts       # 基金实时净值
│   │       ├── tencent.ts        # 股票实时行情
│   │       └── exchange.ts       # 汇率
│   ├── components/
│   ├── stores/
│   ├── types/
│   └── utils/
├── API_INTERFACES.md
├── README.md
└── package.json
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置后端环境变量

股票历史数据查询依赖 Supabase。服务读取以下两个环境变量：

```bash
export SUPABASE_URL='https://your-project.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='your-service-role-key'
```

`service_role` key 只应保留在服务端环境中。

### 3. 初始化股票历史数据库

先按 [database/README.md](./database/README.md) 完成建表和导入。最小可用流程如下：

```bash
pip install -r database/requirements.txt
python3 database/import_akshare_history.py \
  --symbols-file database/symbols.example.csv \
  --adjust-modes raw,qfq,hfq
```

当前股票录入和股票历史回测只支持已经导入数据库的证券。

### 4. 启动本地数据服务

```bash
npm run server
```

服务地址：`http://localhost:3001`

### 5. 启动前端开发服务器

```bash
npm run dev
```

访问：`http://localhost:5173`

## 常用开发流程

```bash
# 终端 1
export SUPABASE_URL='https://your-project.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='your-service-role-key'
npm run server

# 终端 2
npm run dev
```

## 使用说明

### 添加股票

- 输入 6 位 A 股代码或 5 位港股代码
- 前端会通过腾讯财经尝试识别名称
- 后端会校验该证券是否已经存在于 Supabase 历史库中
- 校验通过后，系统才会使用数据库历史数据计算回测曲线

### 股票买入价模式

- A 股和港股买入单价统一按前复权价格保存
- 自动取价会回填买入日的前复权收盘价
- 组合净值和股票历史走势统一使用前复权口径

### 添加基金

- 基金名称和实时估算净值来自天天基金
- 指定日期净值和完整历史净值来自东方财富代理接口
- 遇到休市日时，系统会回退到最近一个可用交易日净值

### 基准与汇率

- 基准指数使用东方财富日线
- 港股与美元资产会自动换算成人民币
- 实时汇率失败时，系统会回退到内置月度汇率表

## 接口文档

运行时接口和外部数据源说明见 [API_INTERFACES.md](./API_INTERFACES.md)。

## 部署说明

### 运行组件

- 前端静态资源
- Node 数据服务
- Supabase 数据库

### 生产环境注意事项

- `SUPABASE_SERVICE_ROLE_KEY` 只应存在于 Node 服务所在环境
- 需要定期执行导入脚本，股票历史库才会持续更新
- 前端通过 [src/config/application.ts](/Users/liuxiaochen/Desktop/有意思/ai/StockAnalyst/src/config/application.ts:1) 读取后端地址
- 后端服务端口当前定义在 [server/index.js](/Users/liuxiaochen/Desktop/有意思/ai/StockAnalyst/server/index.js:5)

部署时先统一前端配置地址和后端监听端口，再发布前端资源。

## 常见问题

### 股票代码校验失败

出现“数据库中暂无该资产的历史数据”时，先把对应证券导入 `stock_symbols` 和 `stock_daily_bars`。

### 股票历史接口返回数据库未配置

确认 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 已经在启动 `npm run server` 的同一终端中导出。

### 基金历史净值获取失败

确认本地数据服务已经启动：

```bash
npm run server
```

## 浏览器支持

- Chrome 90+
- Firefox 90+
- Safari 14+
- Edge 90+

## 免责声明

本项目用于学习、研究和个人分析，不构成投资建议。所有数据来自公开数据源，投资决策请自行判断。

## License

MIT
