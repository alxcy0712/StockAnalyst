import {
  createProviderError,
  ensureMarketSupported,
  ensureSupportedPeriod,
  normalizeCompactDate,
} from './common.js';

const FQT_COLUMN_MAP = {
  0: 'raw',
  1: 'qfq',
  2: 'hfq',
};

const BARS_PAGE_SIZE = 1000;

export async function fetchDatabaseKLine({
  market,
  code,
  period,
  startDate,
  endDate,
  fqt = 1,
  supabaseClient,
}) {
  ensureMarketSupported(['a_stock', 'hk_stock'], 'database', market);
  ensureSupportedPeriod(period, 'database', market);

  if (!supabaseClient) {
    throw createProviderError('Supabase客户端未初始化', {
      code: 'client_not_initialized',
      provider: 'database',
      market,
      statusCode: 503,
      retriable: false,
    });
  }

  const { data: symbolData, error: symbolError } = await supabaseClient
    .from('stock_symbols')
    .select('id, code, market, name')
    .eq('market', market)
    .eq('code', code)
    .single();

  if (symbolError) {
    throw createProviderError(`查询证券信息失败: ${symbolError.message}`, {
      code: 'symbol_query_error',
      provider: 'database',
      market,
      cause: symbolError,
    });
  }

  if (!symbolData) {
    throw createProviderError(`未找到证券: ${market}:${code}`, {
      code: 'symbol_not_found',
      provider: 'database',
      market,
      statusCode: 404,
      retriable: false,
    });
  }

  const symbolId = symbolData.id;
  const adjustMode = FQT_COLUMN_MAP[fqt] || 'qfq';

  const openCol = `${adjustMode}_open`;
  const highCol = `${adjustMode}_high`;
  const lowCol = `${adjustMode}_low`;
  const closeCol = `${adjustMode}_close`;

  const barsData = [];
  let pageStart = 0;

  while (true) {
    let query = supabaseClient
      .from('stock_daily_bars')
      .select(`trade_date, ${openCol}, ${highCol}, ${lowCol}, ${closeCol}, volume`)
      .eq('symbol_id', symbolId)
      .order('trade_date', { ascending: true });

    if (startDate) {
      query = query.gte('trade_date', startDate);
    }
    if (endDate) {
      query = query.lte('trade_date', endDate);
    }

    const { data: pageData, error: barsError } = await query.range(
      pageStart,
      pageStart + BARS_PAGE_SIZE - 1
    );

    if (barsError) {
      throw createProviderError(`查询日线数据失败: ${barsError.message}`, {
        code: 'bars_query_error',
        provider: 'database',
        market,
        cause: barsError,
      });
    }

    if (!pageData || pageData.length === 0) {
      break;
    }

    barsData.push(...pageData);

    if (pageData.length < BARS_PAGE_SIZE) {
      break;
    }

    pageStart += BARS_PAGE_SIZE;
  }

  if (barsData.length === 0) {
    throw createProviderError('数据库返回空数据', {
      code: 'empty_response',
      provider: 'database',
      market,
    });
  }

  const klineData = barsData.map((row) => ({
    date: normalizeCompactDate(row.trade_date),
    open: Number(row[openCol]) || 0,
    high: Number(row[highCol]) || 0,
    low: Number(row[lowCol]) || 0,
    close: Number(row[closeCol]) || 0,
    volume: Math.round(Number(row.volume) || 0),
  }));

  if (period === 'week') {
    return aggregateToWeek(klineData);
  } else if (period === 'month') {
    return aggregateToMonth(klineData);
  }

  return klineData;
}

function aggregateToWeek(dailyData) {
  const weekMap = new Map();

  for (const day of dailyData) {
    const dateStr = day.date;
    const year = parseInt(dateStr.slice(0, 4));
    const month = parseInt(dateStr.slice(4, 6)) - 1;
    const date = parseInt(dateStr.slice(6, 8));

    const d = new Date(year, month, date);
    const dayOfWeek = d.getDay();
    const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const weekStart = new Date(d.setDate(diff));

    const weekKey = `${weekStart.getFullYear()}${String(weekStart.getMonth() + 1).padStart(2, '0')}${String(weekStart.getDate()).padStart(2, '0')}`;

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {
        date: weekKey,
        open: day.open,
        high: day.high,
        low: day.low,
        close: day.close,
        volume: day.volume,
      });
    } else {
      const week = weekMap.get(weekKey);
      week.high = Math.max(week.high, day.high);
      week.low = Math.min(week.low, day.low);
      week.close = day.close;
      week.volume += day.volume;
    }
  }

  return Array.from(weekMap.values())
    .map(({ date, open, high, low, close, volume }) => ({
      date,
      open,
      high,
      low,
      close,
      volume,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateToMonth(dailyData) {
  const monthMap = new Map();

  for (const day of dailyData) {
    const monthKey = day.date.slice(0, 6);

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, {
        date: `${monthKey}01`,
        open: day.open,
        high: day.high,
        low: day.low,
        close: day.close,
        volume: day.volume,
      });
    } else {
      const month = monthMap.get(monthKey);
      month.high = Math.max(month.high, day.high);
      month.low = Math.min(month.low, day.low);
      month.close = day.close;
      month.volume += day.volume;
    }
  }

  return Array.from(monthMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function checkDatabaseConnection(supabaseClient) {
  if (!supabaseClient) {
    return { ok: false, error: 'Supabase客户端未配置' };
  }

  try {
    const { error } = await supabaseClient.from('stock_symbols').select('id').limit(1);
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
