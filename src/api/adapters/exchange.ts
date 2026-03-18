// 当前汇率（用于实时查询）
let currentRates: { CNY_HKD: number; CNY_USD: number } | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1小时缓存

// 历史汇率表（月平均，用于历史数据换算）
const HISTORICAL_RATES: Record<string, { CNY_HKD: number; CNY_USD: number }> = {
  '2024-01': { CNY_HKD: 0.92, CNY_USD: 7.15 },
  '2024-02': { CNY_HKD: 0.92, CNY_USD: 7.18 },
  '2024-03': { CNY_HKD: 0.91, CNY_USD: 7.20 },
  '2024-04': { CNY_HKD: 0.91, CNY_USD: 7.24 },
  '2024-05': { CNY_HKD: 0.91, CNY_USD: 7.22 },
  '2024-06': { CNY_HKD: 0.91, CNY_USD: 7.26 },
  '2024-07': { CNY_HKD: 0.91, CNY_USD: 7.25 },
  '2024-08': { CNY_HKD: 0.91, CNY_USD: 7.18 },
  '2024-09': { CNY_HKD: 0.90, CNY_USD: 7.05 },
  '2024-10': { CNY_HKD: 0.90, CNY_USD: 7.10 },
  '2024-11': { CNY_HKD: 0.91, CNY_USD: 7.20 },
  '2024-12': { CNY_HKD: 0.92, CNY_USD: 7.30 },
  '2025-01': { CNY_HKD: 0.93, CNY_USD: 7.35 },
};

// 获取当前实时汇率
export async function getCurrentExchangeRate(): Promise<{ CNY_HKD: number; CNY_USD: number }> {
  // 检查缓存
  if (currentRates && Date.now() - lastFetchTime < CACHE_DURATION) {
    return currentRates;
  }

  try {
    // 使用免费汇率API
    const response = await fetch('https://open.er-api.com/v6/latest/CNY');
    const data = await response.json();
    
    if (data.rates) {
      currentRates = {
        CNY_HKD: 1 / data.rates.HKD,
        CNY_USD: 1 / data.rates.USD,
      };
      lastFetchTime = Date.now();
      return currentRates;
    }
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
  }

  // 失败时使用历史最新汇率
  const latestKey = Object.keys(HISTORICAL_RATES).sort().pop() || '2025-01';
  return HISTORICAL_RATES[latestKey];
}

// 获取历史汇率
export function getHistoricalExchangeRate(date: string): { CNY_HKD: number; CNY_USD: number } {
  const monthKey = date.substring(0, 7); // 获取YYYY-MM
  
  // 找最近的有效月份
  let key = monthKey;
  while (!HISTORICAL_RATES[key] && key >= '2024-01') {
    const [year, month] = key.split('-').map(Number);
    if (month === 1) {
      key = `${year - 1}-12`;
    } else {
      key = `${year}-${String(month - 1).padStart(2, '0')}`;
    }
  }
  
  return HISTORICAL_RATES[key] || { CNY_HKD: 0.92, CNY_USD: 7.20 };
}

// 换算金额为CNY
export function convertToCNY(amount: number, currency: 'CNY' | 'HKD' | 'USD', rate: { CNY_HKD: number; CNY_USD: number }): number {
  if (currency === 'CNY') return amount;
  if (currency === 'HKD') return amount * rate.CNY_HKD;
  if (currency === 'USD') return amount * rate.CNY_USD;
  return amount;
}
