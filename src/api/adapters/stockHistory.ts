import type {
  KLineData,
  StockKLineEnvelope,
  StockMarket,
  StockValidationResult,
} from '../../types';
import { buildBackendUrl } from '../../config/application';

interface StockKLineRequest {
  market: StockMarket;
  code: string;
  period?: 'day' | 'week' | 'month';
  startDate?: string;
  endDate?: string;
  fqt?: 0 | 1 | 2;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') {
      return;
    }
    query.set(key, String(value));
  });

  return query.toString();
}

export async function validateStockCode(
  market: StockMarket,
  code: string
): Promise<StockValidationResult> {
  const response = await fetch(
    `${buildBackendUrl('/api/stock/validate')}?${buildQuery({ market, code })}`
  );

  const result = await response.json();

  if (!response.ok) {
    return {
      valid: false,
      market,
      code,
      message: result.message || '验证失败',
    };
  }

  return result as StockValidationResult;
}

async function fetchStockKLineEnvelope(request: StockKLineRequest): Promise<StockKLineEnvelope> {
  const query = buildQuery({
    market: request.market,
    code: request.code,
    period: request.period || 'day',
    startDate: request.startDate,
    endDate: request.endDate,
    fqt: request.fqt ?? 1,
  });

  const response = await fetch(`${buildBackendUrl('/api/stock/kline')}?${query}`);
  if (!response.ok) {
    let message = '获取股票历史数据失败';
    try {
      const payload = await response.json();
      if (payload?.message) {
        message = payload.message;
      }
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }

  return (await response.json()) as StockKLineEnvelope;
}

export async function getAStockKLine(
  code: string,
  period: 'day' | 'week' | 'month' = 'day',
  startDate?: string,
  endDate?: string,
  fqt: 0 | 1 | 2 = 1
): Promise<KLineData[]> {
  const envelope = await fetchStockKLineEnvelope({
    market: 'a_stock',
    code,
    period,
    startDate,
    endDate,
    fqt,
  });

  return envelope.data;
}

export async function getHKStockKLine(
  code: string,
  period: 'day' | 'week' | 'month' = 'day',
  startDate?: string,
  endDate?: string,
  fqt: 0 | 1 | 2 = 1
): Promise<KLineData[]> {
  const envelope = await fetchStockKLineEnvelope({
    market: 'hk_stock',
    code,
    period,
    startDate,
    endDate,
    fqt,
  });

  return envelope.data;
}
