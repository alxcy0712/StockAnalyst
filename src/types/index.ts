// 资产类型
export type AssetType = 'a_stock' | 'hk_stock' | 'fund';
export type Currency = 'CNY' | 'HKD' | 'USD';

// 资产基础定义
export interface Asset {
  id: string;
  type: AssetType;
  code: string;
  name: string;
  purchaseDate: string;    // YYYY-MM-DD
  purchasePrice: number;   // 买入时的单位净值（基金）或价格（股票）
  accumulatedNavAtPurchase?: number; // 买入时的累计净值（仅基金用）
  quantity: number;
  currency: Currency;
  useClosingPrice?: boolean; // 是否使用收盘价作为购入单价（可选，默认为false）
}

// 综合净值点
export interface NavPoint {
  date: string;
  totalValueCNY: number;
  totalCostCNY: number;
  nav: number;
  returnRate: number;
}

export type PortfolioChartMode = 'scale' | 'performance';

export interface PortfolioScalePoint {
  date: string;
  totalValueCNY: number;
  totalCostCNY: number;
  floatingPnLCNY: number;
  floatingReturnRate: number;
}

export interface PortfolioPerformancePoint {
  date: string;
  portfolioValueCNY: number;
  contributionCNY: number;
  unitsOutstanding: number;
  nav: number;
  returnRate: number;
}

export interface PortfolioSeriesResult {
  scale: PortfolioScalePoint[];
  performance: PortfolioPerformancePoint[];
}

// 基金数据（天天基金网格式）
export interface FundData {
  fundcode: string;
  name: string;
  jzrq: string;          // 净值日期
  dwjz: string;          // 单位净值
  gsz?: string;          // 估算净值
  gszzl?: string;        // 估算涨跌幅
  gztime?: string;       // 估算时间
}

// 股票实时数据
export interface StockQuote {
  code: string;
  name: string;
  price: number;
  prevClose: number;
  change: number;
  changePercent: number;
  volume?: number;
}

// 汇率数据
export interface ExchangeRate {
  date: string;
  CNY_HKD: number;
  CNY_USD: number;
}

// K线数据
export interface KLineData {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume?: number;
}

export type BenchmarkIndex = 'csi300' | 'shanghai' | 'none';

export interface BenchmarkConfig {
  code: BenchmarkIndex;
  name: string;
  secid: string;
  description: string;
}

export interface BenchmarkNavPoint {
  date: string;
  nav: number;
  returnRate: number;
}

export interface BenchmarkComparison {
  portfolioReturn: number;
  benchmarkReturn: number;
  alpha: number;
  trackingError: number;
  informationRatio: number;
}
