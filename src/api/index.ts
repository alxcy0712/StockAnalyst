import { getFundQuote } from './adapters/tiantian';
import { getFundNavHistory, getFundNavOnDate, getFundNavAll, getBenchmarkNavHistory, BENCHMARK_CONFIGS } from './adapters/eastmoney';
import { getStockQuote } from './adapters/tencent';
import { getCurrentExchangeRate, getHistoricalExchangeRate, convertToCNY } from './adapters/exchange';
import {
  deleteDatabaseStock,
  getAStockKLine,
  getHKStockKLine,
  importDatabaseStock,
  listDatabaseStocks,
  refreshDatabaseStocks,
  validateStockCode,
} from './adapters/stockHistory';

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
    listDatabaseStocks,
    importDatabaseStock,
    deleteDatabaseStock,
    refreshDatabaseStocks,
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
