import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  STOCK_MARKETS,
  STOCK_PERIODS,
  createProviderError,
  fetchSingleRowOrNull,
  isSingleRowNotFoundError,
  marketToId,
} from './providers/common.js';
import { fetchDatabaseKLine, checkDatabaseConnection } from './providers/database.js';

const MARKET_BY_ID = {
  1: 'a_stock',
  2: 'hk_stock',
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const IMPORT_SCRIPT_PATH = path.join(PROJECT_ROOT, 'database/import_akshare_history.py');

function buildTencentQuoteCode({ market, code }) {
  if (market === 'hk_stock') {
    return `hk${normalizeStockCode(market, code)}`;
  }

  const normalizedCode = normalizeStockCode(market, code);
  return `${normalizedCode.startsWith('6') ? 'sh' : 'sz'}${normalizedCode}`;
}

async function fetchTencentStockName(symbol) {
  const quoteCode = buildTencentQuoteCode(symbol);
  const response = await fetch(`https://qt.gtimg.cn/q=${quoteCode}`);
  if (!response.ok) {
    return null;
  }

  const buffer = await response.arrayBuffer();
  let text = '';
  try {
    text = new TextDecoder('gbk').decode(buffer);
  } catch {
    text = new TextDecoder().decode(buffer);
  }

  const values = text.split('="')[1]?.split('";')[0]?.split('~') || [];
  const name = values[1]?.trim();
  return name || null;
}

function createValidationError(message) {
  return createProviderError(message, {
    code: 'validation_error',
    statusCode: 400,
    retriable: false,
  });
}

function createDatabaseNotConfiguredError() {
  return createProviderError('数据库未配置，请设置SUPABASE_URL和SUPABASE_SERVICE_ROLE_KEY环境变量', {
    code: 'database_not_configured',
    statusCode: 503,
    retriable: false,
  });
}

function ensureDatabaseClient(supabaseClient) {
  if (!supabaseClient) {
    throw createDatabaseNotConfiguredError();
  }
  return supabaseClient;
}

function marketFromId(marketId) {
  const market = MARKET_BY_ID[Number(marketId)];
  if (!market) {
    throw createValidationError(`不支持的市场编码: ${marketId}`);
  }
  return market;
}

function normalizeStockCode(market, code) {
  const text = String(code ?? '').trim();
  if (!/^\d+$/.test(text)) {
    throw createValidationError(`证券代码格式不合法: ${code}`);
  }

  if (market === 'hk_stock') {
    const normalized = text.padStart(5, '0');
    if (normalized.length !== 5) {
      throw createValidationError(`港股代码长度不合法: ${code}`);
    }
    return normalized;
  }

  if (text.length !== 6) {
    throw createValidationError(`A股代码长度不合法: ${code}`);
  }
  return text;
}

function normalizeImportSymbol(symbol) {
  const market = symbol.market;
  if (!STOCK_MARKETS.includes(market)) {
    throw createValidationError(`不支持的市场: ${market}`);
  }

  return {
    market,
    code: normalizeStockCode(market, symbol.code),
    name: String(symbol.name ?? '').trim() || undefined,
  };
}

function isPlaceholderStockName(name, code) {
  const value = String(name ?? '').trim();
  return !value || value === String(code ?? '').trim();
}

async function resolveStockName(symbol, stockNameResolver) {
  if (!isPlaceholderStockName(symbol.name, symbol.code)) {
    return symbol;
  }

  try {
    const resolvedName = await stockNameResolver(symbol);
    if (resolvedName) {
      return {
        ...symbol,
        name: String(resolvedName).trim() || undefined,
      };
    }
  } catch {
    // Keep the symbol usable when the quote source is unavailable.
  }

  return symbol;
}

function mapDatabaseStockRow(row, summary) {
  return {
    id: row.id,
    market: marketFromId(row.market_id),
    code: row.code,
    name: row.name,
    currency: row.currency,
    listStatus: row.list_status,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestTradeDate: summary.latestTradeDate,
    rowCount: summary.rowCount,
  };
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function buildImportArgs({ symbols, mode, symbolsFile }) {
  const args = [
    IMPORT_SCRIPT_PATH,
    '--job-type',
    mode === 'incremental' ? 'incremental' : 'backfill',
    '--adjust-modes',
    'raw,qfq',
  ];

  if (symbolsFile) {
    args.push('--symbols-file', symbolsFile);
  } else {
    const [symbol] = symbols;
    args.push('--market', symbol.market, '--code', symbol.code);
    if (symbol.name) {
      args.push('--name', symbol.name);
    }
  }

  if (mode === 'incremental') {
    args.push('--incremental-from-db');
  }

  return args;
}

function runImportProcess(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON_EXECUTABLE || 'python3', args, {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(createProviderError(`导入脚本启动失败: ${error.message}`, {
        code: 'import_spawn_failed',
        statusCode: 502,
        retriable: true,
        cause: error,
      }));
    });

    child.on('close', (exitCode) => {
      if (exitCode === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(createProviderError(`导入脚本执行失败，退出码 ${exitCode}`, {
        code: 'import_failed',
        statusCode: 502,
        retriable: true,
        cause: { exitCode, stdout, stderr },
      }));
    });
  });
}

export function createStockHistoryService({
  supabaseUrl = process.env.SUPABASE_URL,
  supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
  stockNameResolver = fetchTencentStockName,
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

  async function listDatabaseStocks() {
    const client = ensureDatabaseClient(supabaseClient);

    const { data, error } = await client
      .from('stock_symbols')
      .select('id, market_id, code, name, currency, list_status, is_active, created_at, updated_at')
      .order('market_id', { ascending: true })
      .order('code', { ascending: true });

    if (error) {
      throw createProviderError(`查询资产库失败: ${error.message}`, {
        code: 'stock_library_query_error',
        statusCode: 500,
        cause: error,
      });
    }

    const rows = await Promise.all((data || []).map(async (row) => {
      const symbol = {
        market: marketFromId(row.market_id),
        code: row.code,
        name: row.name,
      };
      const resolvedSymbol = await resolveStockName(symbol, stockNameResolver);
      if (resolvedSymbol.name && resolvedSymbol.name !== row.name) {
        const { error: updateError } = await client
          .from('stock_symbols')
          .update({ name: resolvedSymbol.name })
          .eq('id', row.id);

        if (updateError) {
          throw createProviderError(`更新资产名称失败: ${updateError.message}`, {
            code: 'stock_name_update_error',
            statusCode: 500,
            cause: updateError,
          });
        }
      }

      return {
        ...row,
        name: resolvedSymbol.name || row.name,
      };
    }));

    const summaries = await Promise.all(rows.map(async (row) => {
      const { data: bars, error: barsError, count } = await client
        .from('stock_daily_bars')
        .select('trade_date', { count: 'exact' })
        .eq('symbol_id', row.id)
        .order('trade_date', { ascending: false })
        .limit(1);

      if (barsError) {
        throw createProviderError(`查询资产行情概况失败: ${barsError.message}`, {
          code: 'stock_library_summary_error',
          statusCode: 500,
          cause: barsError,
        });
      }

      return {
        id: row.id,
        latestTradeDate: bars?.[0]?.trade_date ?? null,
        rowCount: count ?? 0,
      };
    }));

    const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));

    return {
      stocks: rows.map((row) => mapDatabaseStockRow(row, summaryById.get(row.id) || {
        latestTradeDate: null,
        rowCount: 0,
      })),
    };
  }

  async function validateSymbol(market, code) {
    if (!supabaseClient) {
      return { exists: false, error: '数据库未配置' };
    }

    const marketId = marketToId(market);
    const symbolQuery = supabaseClient
      .from('stock_symbols')
      .select('id, name, currency')
      .eq('market_id', marketId)
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

  async function getDatabaseStockById(id) {
    const client = ensureDatabaseClient(supabaseClient);
    const symbolQuery = client
      .from('stock_symbols')
      .select('id, market_id, code, name, currency')
      .eq('id', id);

    const { data, error } = await fetchSingleRowOrNull(symbolQuery);

    if (error && !isSingleRowNotFoundError(error)) {
      throw createProviderError(`查询资产失败: ${error.message}`, {
        code: 'stock_symbol_query_error',
        statusCode: 500,
        cause: error,
      });
    }

    if (!data) {
      throw createProviderError('资产不存在', {
        code: 'stock_symbol_not_found',
        statusCode: 404,
        retriable: false,
      });
    }

    return {
      id: data.id,
      market: marketFromId(data.market_id),
      code: data.code,
      name: data.name,
      currency: data.currency,
    };
  }

  async function getDatabaseStocksByIds(ids) {
    const client = ensureDatabaseClient(supabaseClient);
    let query = client
      .from('stock_symbols')
      .select('id, market_id, code, name');

    if (ids?.length) {
      query = query.in('id', ids);
    }

    const { data, error } = await query
      .order('market_id', { ascending: true })
      .order('code', { ascending: true });

    if (error) {
      throw createProviderError(`查询待更新资产失败: ${error.message}`, {
        code: 'stock_refresh_query_error',
        statusCode: 500,
        cause: error,
      });
    }

    return (data || []).map((row) => ({
      market: marketFromId(row.market_id),
      code: row.code,
      name: row.name,
    }));
  }

  async function deleteDatabaseStock(id) {
    const client = ensureDatabaseClient(supabaseClient);
    const stock = await getDatabaseStockById(id);

    const { error: symbolError } = await client
      .from('stock_symbols')
      .delete()
      .eq('id', id);

    if (symbolError) {
      throw createProviderError(`删除资产失败: ${symbolError.message}`, {
        code: 'stock_symbol_delete_error',
        statusCode: 500,
        cause: symbolError,
      });
    }

    return {
      deleted: true,
      stock,
    };
  }

  async function importStockData({ symbols, mode = 'backfill' }) {
    ensureDatabaseClient(supabaseClient);

    if (!Array.isArray(symbols) || symbols.length === 0) {
      throw createValidationError('请提供至少一只股票');
    }

    const normalizedSymbols = await Promise.all(symbols
      .map(normalizeImportSymbol)
      .map((symbol) => resolveStockName(symbol, stockNameResolver)));
    const importMode = mode === 'incremental' ? 'incremental' : 'backfill';
    let symbolsFile = null;

    try {
      if (normalizedSymbols.length > 1) {
        symbolsFile = path.join(os.tmpdir(), `stockanalyst-symbols-${Date.now()}-${randomUUID()}.csv`);
        const csv = [
          'market,code,name',
          ...normalizedSymbols.map((symbol) => [
            symbol.market,
            symbol.code,
            symbol.name || '',
          ].map(escapeCsvCell).join(',')),
        ].join('\n');
        await writeFile(symbolsFile, `${csv}\n`, 'utf8');
      }

      const processResult = await runImportProcess(buildImportArgs({
        symbols: normalizedSymbols,
        mode: importMode,
        symbolsFile,
      }));

      return {
        ok: true,
        mode: importMode,
        symbols: normalizedSymbols,
        ...processResult,
      };
    } finally {
      if (symbolsFile) {
        await unlink(symbolsFile).catch(() => {});
      }
    }
  }

  async function refreshDatabaseStocks(ids) {
    const symbols = await getDatabaseStocksByIds(ids);
    if (symbols.length === 0) {
      return {
        ok: true,
        mode: 'incremental',
        symbols: [],
        stdout: '',
        stderr: '',
      };
    }

    return importStockData({
      mode: 'incremental',
      symbols,
    });
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
      const error = createDatabaseNotConfiguredError();
      error.market = market;
      throw error;
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
    listDatabaseStocks,
    deleteDatabaseStock,
    importStockData,
    refreshDatabaseStocks,
  };
}

export const stockHistoryService = createStockHistoryService();
