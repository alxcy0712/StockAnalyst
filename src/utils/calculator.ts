import dayjs from 'dayjs';

import type { PortfolioPerformancePoint } from '../types';

type DatedReturnPoint = Pick<PortfolioPerformancePoint, 'date' | 'returnRate'>;
type DatedNavPoint = Pick<PortfolioPerformancePoint, 'date' | 'nav'>;

export interface PerformanceMetrics {
  currentNav: number;
  totalReturn: number;
  maxDrawdown: number;
  annualizedReturn: number;
  gain: number;
  loss: number;
  volatility: number;
  sharpeRatio: number;
  calmarRatio: number;
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

export function calculatePerformanceMaxDrawdown(points: DatedNavPoint[]): number {
  if (points.length === 0) return 0;

  let maxDrawdown = 0;
  let peak = points[0].nav || 100;

  for (const point of points) {
    if (point.nav > peak) {
      peak = point.nav;
    } else if (peak > 0) {
      const drawdown = (peak - point.nav) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
  }

  return maxDrawdown;
}

export function calculatePerformanceVolatility(points: DatedReturnPoint[]): number {
  if (points.length < 2) return 0;

  const dailyReturns: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    dailyReturns.push(points[index].returnRate - points[index - 1].returnRate);
  }

  if (dailyReturns.length === 0) return 0;

  const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / dailyReturns.length;
  return Math.sqrt(variance) * Math.sqrt(252);
}

export function calculatePerformanceMaxConsecutive(points: DatedNavPoint[]): { gain: number; loss: number } {
  if (points.length < 2) return { gain: 0, loss: 0 };

  let maxGain = 0;
  let maxLoss = 0;
  let currentGain = 0;
  let currentLoss = 0;

  for (let index = 1; index < points.length; index += 1) {
    if (points[index].nav > points[index - 1].nav) {
      currentGain += 1;
      currentLoss = 0;
      maxGain = Math.max(maxGain, currentGain);
    } else if (points[index].nav < points[index - 1].nav) {
      currentLoss += 1;
      currentGain = 0;
      maxLoss = Math.max(maxLoss, currentLoss);
    } else {
      currentGain = 0;
      currentLoss = 0;
    }
  }

  return { gain: maxGain, loss: maxLoss };
}

export function calculatePerformanceSharpeRatio(
  points: PortfolioPerformancePoint[],
  riskFreeRate: number = 0.03
): number {
  if (points.length < 2) return 0;

  const totalReturn = points[points.length - 1].returnRate;
  const annualizedReturn = calculateAnnualizedReturn(totalReturn, points[0].date, points[points.length - 1].date);
  const volatility = calculatePerformanceVolatility(points);

  if (volatility === 0) return 0;
  return (annualizedReturn - riskFreeRate) / volatility;
}

export function calculatePerformanceMetrics(
  points: PortfolioPerformancePoint[],
  riskFreeRate: number = 0.03
): PerformanceMetrics | null {
  if (points.length === 0) return null;

  const current = points[points.length - 1];
  const totalReturn = current.returnRate;
  const annualizedReturn = calculateAnnualizedReturn(totalReturn, points[0].date, current.date);
  const maxDrawdown = calculatePerformanceMaxDrawdown(points);
  const { gain, loss } = calculatePerformanceMaxConsecutive(points);
  const volatility = calculatePerformanceVolatility(points);
  const sharpeRatio = volatility > 0 ? (annualizedReturn - riskFreeRate) / volatility : 0;
  const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

  return {
    currentNav: current.nav,
    totalReturn,
    maxDrawdown,
    annualizedReturn,
    gain,
    loss,
    volatility,
    sharpeRatio,
    calmarRatio,
  };
}
