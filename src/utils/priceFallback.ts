import { api } from '../api';

export interface PriceResult {
  price: number | null;
  actualDate: string | null;
  isHoliday: boolean;
  message: string | null;
}

export interface DualPriceResult {
  preAdjusted: PriceResult;  // 前复权价格
  raw: PriceResult;          // 除权价格（不复权）
}

/**
 * 获取指定日期的收盘价，如果当天是休假日则自动查找前一交易日
 * @param code 股票代码
 * @param type 资产类型
 * @param targetDate 目标日期 YYYY-MM-DD
 * @param lookbackDays 向前查找天数（默认7天）
 * @returns PriceResult 包含价格、实际日期、是否假日等信息
 */
export async function getClosingPriceWithFallback(
  code: string,
  type: 'a_stock' | 'hk_stock',
  targetDate: string,
  lookbackDays: number = 7
): Promise<PriceResult> {
  try {
    const startDate = targetDate.replace(/-/g, '');
    // 扩大查询范围，往前查 lookbackDays 天
    const start = new Date(targetDate);
    start.setDate(start.getDate() - lookbackDays);
    const extendedStartDate = start.toISOString().slice(0, 10).replace(/-/g, '');
    const endDate = startDate;
    
    let klineData: { date: string; close: number }[] = [];
    
    if (type === 'a_stock') {
      klineData = await api.stock.getAStockKLine(code, 'day', extendedStartDate, endDate);
    } else {
      klineData = await api.stock.getHKStockKLine(code, 'day', extendedStartDate, endDate);
    }
    
    if (klineData.length === 0) {
      return {
        price: null,
        actualDate: null,
        isHoliday: true,
        message: '未获取到该日期附近的价格数据'
      };
    }
    
    // 按日期排序（最新的在前）
    klineData.sort((a, b) => b.date.localeCompare(a.date));
    
    // 查找目标日期
    const targetDateFormatted = targetDate.replace(/-/g, '');
    const targetData = klineData.find(item => item.date === targetDateFormatted);
    
    if (targetData) {
      // 找到目标日期的数据
      return {
        price: targetData.close,
        actualDate: targetDate,
        isHoliday: false,
        message: null
      };
    } else {
      // 未找到目标日期，使用最近的一个交易日
      const nearestData = klineData[0];
      const nearestDate = nearestData.date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
      
      return {
        price: nearestData.close,
        actualDate: nearestDate,
        isHoliday: true,
        message: `${targetDate}为休假日，使用前一交易日${nearestDate}收盘价：${nearestData.close.toFixed(2)}元`
      };
    }
    
  } catch (error) {
    console.error('Failed to fetch closing price with fallback:', error);
    return {
      price: null,
      actualDate: null,
      isHoliday: true,
      message: '获取价格失败'
    };
  }
}

/**
 * 获取指定日期的收盘价（支持指定复权类型）
 * @param code 股票代码
 * @param type 资产类型
 * @param targetDate 目标日期 YYYY-MM-DD
 * @param lookbackDays 向前查找天数
 * @param fqt 复权类型：0=不复权(除权)，1=前复权
 */
export async function getClosingPriceWithAdjustment(
  code: string,
  type: 'a_stock' | 'hk_stock',
  targetDate: string,
  lookbackDays: number = 7,
  fqt: 0 | 1 = 1
): Promise<PriceResult> {
  try {
    const startDate = targetDate.replace(/-/g, '');
    const start = new Date(targetDate);
    start.setDate(start.getDate() - lookbackDays);
    const extendedStartDate = start.toISOString().slice(0, 10).replace(/-/g, '');
    const endDate = startDate;

    let klineData: { date: string; close: number }[] = [];

    if (type === 'a_stock') {
      klineData = await api.stock.getAStockKLine(code, 'day', extendedStartDate, endDate, fqt);
    } else {
      klineData = await api.stock.getHKStockKLine(code, 'day', extendedStartDate, endDate, fqt);
    }

    if (klineData.length === 0) {
      return {
        price: null,
        actualDate: null,
        isHoliday: true,
        message: '未获取到该日期附近的价格数据'
      };
    }

    klineData.sort((a, b) => b.date.localeCompare(a.date));

    const targetDateFormatted = targetDate.replace(/-/g, '');
    const targetData = klineData.find(item => item.date === targetDateFormatted);

    if (targetData) {
      return {
        price: targetData.close,
        actualDate: targetDate,
        isHoliday: false,
        message: null
      };
    } else {
      const nearestData = klineData[0];
      const nearestDate = nearestData.date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
      const adjustmentType = fqt === 1 ? '前复权' : '除权';

      return {
        price: nearestData.close,
        actualDate: nearestDate,
        isHoliday: true,
        message: `${targetDate}为休假日，使用前一交易日${nearestDate}${adjustmentType}收盘价：${nearestData.close.toFixed(2)}元`
      };
    }
  } catch (error) {
    console.error('Failed to fetch closing price with adjustment:', error);
    return {
      price: null,
      actualDate: null,
      isHoliday: true,
      message: '获取价格失败'
    };
  }
}

/**
 * 同时获取前复权和除权两种收盘价
 * @param code 股票代码
 * @param type 资产类型
 * @param targetDate 目标日期 YYYY-MM-DD
 * @param lookbackDays 向前查找天数
 */
export async function getDualClosingPriceWithFallback(
  code: string,
  type: 'a_stock' | 'hk_stock',
  targetDate: string,
  lookbackDays: number = 7
): Promise<DualPriceResult> {
  const [preAdjusted, raw] = await Promise.all([
    getClosingPriceWithAdjustment(code, type, targetDate, lookbackDays, 1),
    getClosingPriceWithAdjustment(code, type, targetDate, lookbackDays, 0)
  ]);

  return { preAdjusted, raw };
}
