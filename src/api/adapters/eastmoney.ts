import type { KLineData, BenchmarkIndex, BenchmarkConfig, BenchmarkNavPoint } from '../../types';

const EASTMONEY_KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';

export async function getFundNavHistory(
  fundCode: string,
  startDate?: string,
  endDate?: string
): Promise<{ date: string; unitNav: number; accumulatedNav: number; changePercent: number }[]> {
  try {
    // API期望的日期格式是 YYYY-MM-DD，不是 YYYYMMDD
    const ensureHyphen = (d: string) => {
      if (d.includes('-')) return d;
      if (d.length === 8) return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
      return d;
    };
    const sdate = startDate ? ensureHyphen(startDate) : '';
    const edate = endDate ? ensureHyphen(endDate) : '';
    
    // 使用后端代理获取数据
    const proxyUrl = `http://localhost:3001/api/fundnav/history?code=${fundCode}&startDate=${sdate}&endDate=${edate}&per=500`;
    const response = await fetch(proxyUrl);
    const text = await response.text();

    // 解析 HTML 表格数据
    const parsed: { date: string; unitNav: number; accumulatedNav: number; changePercent: number }[] = [];
    const html = text;
    
    if (html.includes('<table')) {
      const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
      if (tbodyMatch) {
        const tbodyHtml = tbodyMatch[1];
        const trMatcher = /<tr>([\s\S]*?)<\/tr>/gi;
        let trMatch: RegExpExecArray | null = null;
        while ((trMatch = trMatcher.exec(tbodyHtml)) !== null) {
          const trHtml = trMatch[1];
          const tdMatches = trHtml.match(/<td[^>]*>([^<]*)<\/td>/gi);
          if (tdMatches && tdMatches.length >= 4) {
            const dateRaw = tdMatches[0].replace(/<[^>]*>/g, '').trim();
            const unitRaw = tdMatches[1].replace(/<[^>]*>/g, '').trim();
            const accumRaw = tdMatches[2].replace(/<[^>]*>/g, '').trim();
            const changeRaw = tdMatches[3].replace(/<[^>]*>/g, '').trim();
            const unitNum = parseFloat(unitRaw.replace(/,/g, ''));
            const accumNum = parseFloat(accumRaw.replace(/,/g, ''));
            // 日增长率可能为空，视为0%
            const changePercent = changeRaw ? parseFloat(changeRaw.replace('%', '')) / 100 : 0;
            if (dateRaw && Number.isFinite(unitNum) && Number.isFinite(accumNum)) {
              parsed.push({ date: dateRaw, unitNav: unitNum, accumulatedNav: accumNum, changePercent });
            }
          }
        }
      }
    }

    return parsed;
  } catch (err) {
    console.error('Fund NAV history error:', err);
    return [];
  }
}

export async function getFundNavOnDate(fundCode: string, date: string): Promise<{ unitNav: number; accumulatedNav: number } | null> {
  const formatDate = (d: string) => d.replace(/-/g, '');
  const targetDate = formatDate(date);
  
  // 获取指定日期范围的历史净值
  const rows = await getFundNavHistory(fundCode, date, date);
  
  if (rows.length > 0) {
    // 尝试精确匹配日期（API返回的是YYYY-MM-DD格式）
    const targetItem = rows.find(item => formatDate(item.date) === targetDate);
    if (targetItem) {
      return { unitNav: targetItem.unitNav, accumulatedNav: targetItem.accumulatedNav };
    }
    // 如果找不到精确匹配（比如请求日期是周末/节假日），返回最近的一个净值
    return { unitNav: rows[0].unitNav, accumulatedNav: rows[0].accumulatedNav };
  }
  return null;
}

export async function getFundNavAll(fundCode: string, startDate?: string): Promise<{ date: string; unitNav: number; accumulatedNav: number; changePercent: number }[]> {
  try {
    const ensureHyphen = (d: string) => {
      if (d.includes('-')) return d;
      if (d.length === 8) return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
      return d;
    };
    const sdate = startDate ? ensureHyphen(startDate) : '';

    const proxyUrl = `http://localhost:3001/api/fundnav/all?code=${fundCode}&startDate=${sdate}&per=500`;
    const response = await fetch(proxyUrl);
    const data = await response.json();

    return data;
  } catch (err) {
    console.error('Fund NAV all error:', err);
    return [];
  }
}

export const BENCHMARK_CONFIGS: Record<BenchmarkIndex, BenchmarkConfig> = {
  csi300: {
    code: 'csi300',
    name: '沪深300',
    secid: '1.000300',
    description: 'A股市场代表性指数',
  },
  shanghai: {
    code: 'shanghai',
    name: '上证指数',
    secid: '1.000001',
    description: '上海证券交易所综合指数',
  },
  none: {
    code: 'none',
    name: '无基准',
    secid: '',
    description: '不显示基准对比',
  },
};

export async function getBenchmarkKLine(
  benchmark: BenchmarkIndex,
  startDate: string,
  endDate: string,
  period: 'day' | 'week' | 'month' = 'day'
): Promise<KLineData[]> {
  if (benchmark === 'none') return [];

  const config = BENCHMARK_CONFIGS[benchmark];

  try {
    const periodMap = { day: '101', week: '102', month: '103' };
    const klt = periodMap[period];

    const url = `${EASTMONEY_KLINE_URL}?secid=${config.secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${klt}&fqt=0&beg=${startDate}&end=${endDate}&ut=fa5fd1943c7b386f172d6893dbfba10b&_=${Date.now()}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.data && data.data.klines) {
      return data.data.klines.map((item: string) => {
        const [date, open, close, low, high, volume] = item.split(',');
        return {
          date: date.replace(/-/g, ''),
          open: parseFloat(open),
          close: parseFloat(close),
          low: parseFloat(low),
          high: parseFloat(high),
          volume: parseInt(volume),
        };
      });
    }

    if (data.msg) {
      console.error('API error message:', data.msg);
    }

    return [];
  } catch (error) {
    console.error('Benchmark kline error:', error);
    return [];
  }
}

export async function getBenchmarkNavHistory(
  benchmark: BenchmarkIndex,
  startDate: string,
  endDate: string
): Promise<BenchmarkNavPoint[]> {
  if (benchmark === 'none') return [];

  const klineData = await getBenchmarkKLine(benchmark, startDate, endDate, 'day');
  if (klineData.length === 0) return [];

  const startPrice = klineData[0].close;

  const startDateObj = new Date(startDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
  const endDateObj = new Date(endDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));

  const allDates: string[] = [];
  for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
    allDates.push(d.toISOString().slice(0, 10));
  }

  const filledResult: BenchmarkNavPoint[] = [];
  let klineIndex = 0;

  for (const date of allDates) {
    const dateNoHyphen = date.replace(/-/g, '');

    while (klineIndex < klineData.length && klineData[klineIndex].date < dateNoHyphen) {
      klineIndex++;
    }

    if (klineIndex < klineData.length && klineData[klineIndex].date === dateNoHyphen) {
      filledResult.push({
        date,
        nav: (klineData[klineIndex].close / startPrice) * 100,
        returnRate: (klineData[klineIndex].close - startPrice) / startPrice,
      });
    } else {
      const prevIndex = Math.max(0, klineIndex - 1);
      const prevClose = klineData[prevIndex]?.close ?? startPrice;
      filledResult.push({
        date,
        nav: (prevClose / startPrice) * 100,
        returnRate: (prevClose - startPrice) / startPrice,
      });
    }
  }

  return filledResult;
}
