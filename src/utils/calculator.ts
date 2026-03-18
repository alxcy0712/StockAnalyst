import dayjs from 'dayjs';
import type { NavPoint } from '../types';

export function getTradingDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  let current = dayjs(startDate);
  const end = dayjs(endDate);

  while (current.isBefore(end) || current.isSame(end)) {
    const dayOfWeek = current.day();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(current.format('YYYY-MM-DD'));
    }
    current = current.add(1, 'day');
  }

  return days;
}

export function calculateMaxDrawdown(navHistory: NavPoint[]): number {
  let maxDrawdown = 0;
  let peak = navHistory[0]?.nav || 100;

  for (const point of navHistory) {
    if (point.nav > peak) {
      peak = point.nav;
    } else {
      const drawdown = (peak - point.nav) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
  }

  return maxDrawdown;
}

export function calculateAnnualizedReturn(
  totalReturn: number,
  startDate: string,
  endDate: string
): number {
  const years = dayjs(endDate).diff(dayjs(startDate), 'year', true);
  if (years <= 0) return 0;
  return Math.pow(1 + totalReturn, 1 / years) - 1;
}

export function calculateVolatility(navHistory: NavPoint[]): number {
  if (navHistory.length < 2) return 0;

  const returns: number[] = [];
  for (let i = 1; i < navHistory.length; i++) {
    const prevValue = navHistory[i - 1].totalValueCNY;
    const currValue = navHistory[i].totalValueCNY;
    if (prevValue > 0) {
      returns.push((currValue - prevValue) / prevValue);
    }
  }

  if (returns.length === 0) return 0;

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const dailyStd = Math.sqrt(variance);
  
  return dailyStd * Math.sqrt(252);
}

export function calculateSharpeRatio(navHistory: NavPoint[], riskFreeRate: number = 0.03): number {
  if (navHistory.length < 2) return 0;

  const startDate = navHistory[0].date;
  const endDate = navHistory[navHistory.length - 1].date;
  const totalReturn = navHistory[navHistory.length - 1].returnRate;
  const annualizedReturn = calculateAnnualizedReturn(totalReturn, startDate, endDate);
  const volatility = calculateVolatility(navHistory);

  if (volatility === 0) return 0;
  return (annualizedReturn - riskFreeRate) / volatility;
}

export function calculateMaxConsecutive(navHistory: NavPoint[]): { gain: number; loss: number } {
  if (navHistory.length < 2) return { gain: 0, loss: 0 };

  let maxGain = 0;
  let maxLoss = 0;
  let currentGain = 0;
  let currentLoss = 0;

  for (let i = 1; i < navHistory.length; i++) {
    if (navHistory[i].totalValueCNY > navHistory[i - 1].totalValueCNY) {
      currentGain++;
      currentLoss = 0;
      maxGain = Math.max(maxGain, currentGain);
    } else if (navHistory[i].totalValueCNY < navHistory[i - 1].totalValueCNY) {
      currentLoss++;
      currentGain = 0;
      maxLoss = Math.max(maxLoss, currentLoss);
    } else {
      currentGain = 0;
      currentLoss = 0;
    }
  }

  return { gain: maxGain, loss: maxLoss };
}
