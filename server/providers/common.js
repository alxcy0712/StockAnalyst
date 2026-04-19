export const STOCK_MARKETS = ['a_stock', 'hk_stock'];
export const STOCK_PERIODS = ['day', 'week', 'month'];



export function createProviderError(
  message,
  {
    code = 'provider_error',
    provider,
    market,
    statusCode = 502,
    retriable = true,
    cause,
  } = {}
) {
  const error = new Error(message);
  error.code = code;
  error.provider = provider;
  error.market = market;
  error.statusCode = statusCode;
  error.retriable = retriable;
  error.cause = cause;
  return error;
}

export function normalizeCompactDate(date) {
  if (!date) return '';
  if (date.includes('-')) return date.replace(/-/g, '');
  return date;
}

export function normalizeIsoDate(date) {
  if (!date) return '';
  if (date.includes('-')) return date;
  if (date.length === 8) {
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  }
  return date;
}

export function mapNumber(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mapVolume(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export function mapKLineRow(date, open, close, high, low, volume) {
  return {
    date: normalizeCompactDate(String(date)),
    open: mapNumber(open),
    close: mapNumber(close),
    high: mapNumber(high),
    low: mapNumber(low),
    volume: mapVolume(volume),
  };
}

export function ensureSupportedPeriod(period, provider, market) {
  if (STOCK_PERIODS.includes(period)) {
    return period;
  }

  throw createProviderError(`数据源 ${provider} 不支持周期 ${period}`, {
    code: 'unsupported_period',
    provider,
    market,
    statusCode: 400,
    retriable: false,
  });
}

export function ensureMarketSupported(supportsMarkets, provider, market) {
  if (supportsMarkets.includes(market)) {
    return;
  }

  throw createProviderError(`数据源 ${provider} 不支持市场 ${market}`, {
    code: 'unsupported_market',
    provider,
    market,
    statusCode: 400,
    retriable: false,
  });
}
