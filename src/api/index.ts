import { getFundQuote } from './adapters/tiantian';
import { getFundNavHistory, getFundNavOnDate, getFundNavAll, getAStockKLineEastmoney, getHKStockKLineEastmoney, getBenchmarkNavHistory, BENCHMARK_CONFIGS } from './adapters/eastmoney';
import { getStockQuote } from './adapters/tencent';
import { getCurrentExchangeRate, getHistoricalExchangeRate, convertToCNY } from './adapters/exchange';

export const api = {
  fund: {
    getQuote: getFundQuote,
    getNavHistory: getFundNavHistory,
    getNavOnDate: getFundNavOnDate,
    getNavAll: getFundNavAll,
  },
  stock: {
    getQuote: getStockQuote,
    getAStockKLineEastmoney,
    getHKStockKLineEastmoney,
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
