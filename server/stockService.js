import { createClient } from '@supabase/supabase-js';
import {
  STOCK_MARKETS,
  STOCK_PERIODS,
  createProviderError,
  fetchSingleRowOrNull,
  isSingleRowNotFoundError,
} from './providers/common.js';
import { fetchDatabaseKLine, checkDatabaseConnection } from './providers/database.js';

function createValidationError(message) {
  return createProviderError(message, {
    code: 'validation_error',
    statusCode: 400,
    retriable: false,
  });
}

export function createStockHistoryService({
  supabaseUrl = process.env.SUPABASE_URL,
  supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
} = {}) {
  const supabaseClient = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

  function validateRequest({ market, period }) {
    if (!STOCK_MARKETS.includes(market)) {
      throw createValidationError(`不支持的市场: ${market}`);
    }

    if (!STOCK_PERIODS.includes(period)) {
      throw createValidationError(`不支持的周期: ${period}`);
    }
  }

  async function checkConnection() {
    return checkDatabaseConnection(supabaseClient);
  }

  async function validateSymbol(market, code) {
    if (!supabaseClient) {
      return { exists: false, error: '数据库未配置' };
    }

    const symbolQuery = supabaseClient
      .from('stock_symbols')
      .select('id, name, currency')
      .eq('market', market)
      .eq('code', code);

    const { data, error } = await fetchSingleRowOrNull(symbolQuery);

    if (error && !isSingleRowNotFoundError(error)) {
      return { exists: false, error: error.message || '证券查询失败' };
    }

    if (!data) {
      return { exists: false, error: `数据库中暂无 ${market === 'a_stock' ? 'A股' : '港股'} ${code} 的历史数据` };
    }

    const { data: bars, error: barsError } = await supabaseClient
      .from('stock_daily_bars')
      .select('trade_date')
      .eq('symbol_id', data.id)
      .limit(1);

    if (barsError) {
      return { exists: false, error: barsError.message || '历史日线查询失败' };
    }

    if (!bars || bars.length === 0) {
      return { exists: false, error: `数据库中暂无 ${market === 'a_stock' ? 'A股' : '港股'} ${code} 的历史数据` };
    }

    return { exists: true, symbol: data };
  }

  async function getKLineEnvelope(params) {
    validateRequest(params);

    const {
      market,
      code,
      period,
      startDate,
      endDate,
      fqt = 1,
    } = params;

    if (!supabaseClient) {
      throw createProviderError('数据库未配置，请设置SUPABASE_URL和SUPABASE_SERVICE_ROLE_KEY环境变量', {
        code: 'database_not_configured',
        market,
        statusCode: 503,
        retriable: false,
      });
    }

    const data = await fetchDatabaseKLine({
      market,
      code,
      period,
      startDate,
      endDate,
      fqt,
      supabaseClient,
    });

    return {
      data,
      providerUsed: 'database',
      attemptedProviders: ['database'],
      degraded: false,
      message: null,
    };
  }

  return {
    getKLineEnvelope,
    checkConnection,
    validateSymbol,
  };
}

export const stockHistoryService = createStockHistoryService();
