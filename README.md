# 金融资产模拟回测

一个纯前端实现的金融资产回测工具，支持A股、港股和基金的综合净值分析。

## 功能特点

- 支持多种资产类型：A股、港股、基金
- 自动汇率换算：统一换算为人民币(CNY)显示
- 实时数据获取：基金使用估算净值，交易日提供参考值
- 综合净值走势：可视化展示资产组合走势，支持与沪深300/上证指数对比
- 本地数据存储：所有数据存储在浏览器本地
- 历史净值获取：支持获取基金购入日到现在的完整历史净值

## 技术栈

- **框架**: React 19 + TypeScript 5.3
- **构建工具**: Vite 6
- **样式**: Tailwind CSS 4
- **图表**: ECharts 5
- **状态管理**: Zustand
- **数据存储**: 浏览器 localStorage

## 数据源

| 市场 | 数据源 | 说明 |
|-----|-------|-----|
| A股 | 东方财富 | 历史K线数据 |
| 港股 | 东方财富 | 历史K线数据 |
| 基金 | 天天基金网 + 东方财富 | 实时净值、历史净值 |
| 汇率 | 东方财富 | 实时汇率 |

## 项目结构

```
StockAnalyst/
├── server/                     # 后端代理服务
│   └── index.js               # Express代理服务（解决CORS问题）
├── src/
│   ├── api/                    # API层
│   │   ├── index.ts           # API统一导出
│   │   ├── adapters/          # 数据源适配器
│   │   │   ├── eastmoney.ts   # 东方财富（股票K线、基金净值、基准指数）
│   │   │   ├── tiantian.ts    # 天天基金（实时行情）
│   │   │   ├── tencent.ts     # 腾讯财经（备用）
│   │   │   └── exchange.ts    # 汇率服务
│   │   └── jsonp.ts           # JSONP请求封装
│   ├── components/             # React组件
│   │   ├── AssetForm.tsx      # 资产录入表单
│   │   ├── AssetList.tsx      # 资产列表
│   │   ├── NavChart.tsx       # 净值图表（ECharts）
│   │   ├── AssetAllocationChart.tsx  # 资产配置饼图
│   │   └── EditAssetDialog.tsx       # 编辑资产弹窗
│   ├── stores/                 # 状态管理（Zustand）
│   │   ├── assetStore.ts       # 资产数据存储
│   │   ├── benchmarkStore.ts   # 基准指数选择
│   │   ├── themeStore.ts       # 主题（明暗模式）
│   │   └── errorStore.ts       # 全局错误状态
│   ├── types/                  # TypeScript类型定义
│   │   └── index.ts
│   ├── utils/                  # 工具函数
│   │   ├── calculator.ts       # 收益计算工具
│   │   ├── dataCache.ts        # IndexedDB数据缓存
│   │   └── priceFallback.ts    # 价格获取降级策略
│   └── hooks/                  # 自定义React Hooks
│       └── useFormError.ts     # 表单错误处理
├── index.html
├── vite.config.ts
├── package.json
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动后端代理服务

基金历史净值API存在CORS限制，需要启动后端代理服务：

```bash
cd server
node index.js
```

后端服务默认运行在 `http://localhost:3001`

### 3. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:5173`

## 构建步骤

### 开发环境

```bash
# 安装依赖
npm install

# 启动后端代理（终端1）
cd server && node index.js

# 启动前端开发服务器（终端2）
npm run dev
```

### 生产构建

```bash
# 构建前端资源
npm run build
```

构建产物输出到 `dist` 目录

## 上线部署

### 方案一：Vercel 部署（推荐）

Vercel 可以一键部署 Node.js 后端服务：

1. 将项目推送到 GitHub
2. 在 Vercel 官网导入项目
3. 配置构建命令：
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. 需要配置环境变量或使用 Vercel Serverless Functions 部署后端代理

### 方案二：Docker 部署

创建 `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# 复制后端代码
COPY server ./server
COPY package.json ./
RUN npm install

# 构建前端
RUN npm run build

# 安装生产依赖
RUN npm install -g serve

EXPOSE 3000

CMD ["sh", "-c", "node server/index.js & serve -s dist -p 3000"]
```

构建运行：

```bash
docker build -t stock-analyst .
docker run -p 3000:3000 stock-analyst
```

### 方案三：传统服务器部署

1. **构建前端**：
```bash
npm run build
```

2. **部署后端**：
```bash
cd server
npm install express
node index.js &
```

3. **配置 Nginx**：
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /var/www/stock-analyst/dist;
        try_files $uri $uri/ /index.html;
    }

    # API代理
    location /api/ {
        proxy_pass http://localhost:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 部署注意事项

1. **后端代理**：基金历史净值获取需要后端代理服务解决CORS问题
2. **环境变量**：如需自定义后端端口，修改 `server/index.js` 中的 `PORT` 变量
3. **HTTPS**：生产环境建议使用 HTTPS

## 使用说明

### 1. 添加资产

点击"添加资产"按钮：
- 选择资产类型（A股/港股/基金）
- 输入资产代码（如：007466）
- 选择购入日期
- 获取购入日净值（基金）或手动输入购入单价
- 输入购买数量
- 选择货币类型

### 2. 查看走势

添加资产后，系统会自动：
- 获取从购入日到现在的完整历史数据
- 计算每日总资产净值
- 展示综合净值走势图

支持基准对比（沪深300/上证指数）

### 3. 数据说明

- **净值基准**：以总成本为基准，初始净值为100
- **累计收益率**：(当前总资产 - 总成本) / 总成本
- **最大回撤**：从历史最高点到最低点的最大跌幅

### 4. 指标卡片说明

| 指标 | 说明 |
|------|------|
| 最新总资产 | 当前投资组合的总市值，基于最新价格计算 |
| 累计收益 | (当前总资产 - 总成本) / 总成本 × 100% |
| 最大回撤 | 从历史最高点到最低点的最大跌幅，衡量投资风险 |
| 年化收益率 | 将累计收益按持有时间年化后的收益率，便于不同投资周期比较 |
| 持股天数 | 从最早购买资产到今天持有的总天数 |
| 最大连涨/连跌 | 连续上涨/下跌的最大天数，反映趋势持续性 |
| 波动率 | 收益率的标准差，衡量投资组合的价格波动程度 |
| 夏普比率 | (年化收益率 - 无风险利率) / 波动率，衡量风险调整后的收益，>1表示较好 |
| 卡玛比率 | 年化收益率 / 最大回撤，衡量每承担1%最大回撤获得的收益，>1表示收益能覆盖风险 |
| 超额收益 (Alpha) | 组合收益减去基准收益，正值表示跑赢大盘 |

## 更新日志

### 最新改动
- 移除周K/月K视图：组合的K线数据基于持仓计算，非真实市场K线，蜡烛图形式缺乏实际参考价值
- 简化UI：移除周期切换按钮，统一使用日线视图展示资产组合走势
- 优化缓存：移除K线数据缓存，减少IndexedDB存储占用

## 常见问题

## 常见问题

### 1. 基金历史净值获取失败

确保后端代理服务正在运行：
```bash
cd server && node index.js
```

### 2. CORS 错误

检查后端代理是否正常启动，端口是否为 3001

### 3. 数据不更新

刷新页面，数据存储在浏览器 localStorage 中

## 浏览器支持

- Chrome 90+
- Firefox 90+
- Safari 14+
- Edge 90+

## 免责声明

本项目仅用于学习和研究目的，不构成任何投资建议。投资者应当独立判断，自行承担投资风险。所有数据来自公开API，仅供参考。

## License

MIT
