import dayjs from 'dayjs';

import { api } from '../api';
import { getHistoricalExchangeRate, convertToCNY } from '../api/adapters/exchange';
import type {
  Asset,
  KLineData,
  PortfolioPerformancePoint,
  PortfolioScalePoint,
  PortfolioSeriesResult,
} from '../types';
import { dataCache } from './dataCache';

type AssetHistoryMap = Record<string, Map<string, number>>;

export interface PortfolioSeriesBuildOptions {
  startDate?: string;
  endDate?: string;
}

export function getAllDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  let current = dayjs(startDate);
  const end = dayjs(endDate);

  while (current.isBefore(end) || current.isSame(end)) {
    days.push(current.format('YYYY-MM-DD'));
    current = current.add(1, 'day');
  }

  return days;
}

export function findNearestPriceBinary(
  targetDate: string,
  tradingDays: string[],
  history: Map<string, number>,
  assetPurchaseDate: string,
  purchasePrice: number
): number {
  if (targetDate < assetPurchaseDate) {
    return purchasePrice;
  }

  let left = 0;
  let right = tradingDays.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (tradingDays[mid] <= targetDate) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  if (result >= 0) {
    return history.get(tradingDays[result]) ?? purchasePrice;
  }

  return purchasePrice;
}

export function buildAssetTradingDays(assetHistories: AssetHistoryMap): Map<string, string[]> {
  const assetTradingDays = new Map<string, string[]>();

  Object.entries(assetHistories).forEach(([assetId, history]) => {
    assetTradingDays.set(assetId, Array.from(history.keys()).sort());
  });

  return assetTradingDays;
}

export function hasContributionOnDate(asset: Asset, pointDate: string): boolean {
  return dayjs(pointDate).format('YYYY-MM-DD') === dayjs(asset.purchaseDate).format('YYYY-MM-DD');
}

export function calculateContributionCNY(asset: Asset): number {
  const purchaseRate = getHistoricalExchangeRate(asset.purchaseDate);
  return convertToCNY(asset.purchasePrice * asset.quantity, asset.currency, purchaseRate);
}

export function calculateAssetPointValueCNY(asset: Asset, pointDate: string, pointPrice: number): number {
  const pointRate = getHistoricalExchangeRate(pointDate);
  return convertToCNY(pointPrice * asset.quantity, asset.currency, pointRate);
}

export function normalizeRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  const normalized = Number(value.toFixed(12));
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function isAssetActiveOnDate(asset: Asset, pointDate: string): boolean {
  // 直接字符串比较，避免重复格式化日期 (YYYY-MM-DD 格式可直接比较)
  return asset.purchaseDate <= pointDate;
}

export function getAssetPointPrice(
  asset: Asset,
  pointDate: string,
  history?: Map<string, number>,
  tradingDays?: string[]
): number {
  if (!history || history.size === 0) {
    return asset.purchasePrice;
  }

  if (history.has(pointDate)) {
    return history.get(pointDate) ?? asset.purchasePrice;
  }

  return findNearestPriceBinary(
    pointDate,
    tradingDays ?? Array.from(history.keys()).sort(),
    history,
    dayjs(asset.purchaseDate).format('YYYY-MM-DD'),
    asset.purchasePrice
  );
}

export function buildPortfolioScaleSeries(
  assets: Asset[],
  assetHistories: AssetHistoryMap,
  options: PortfolioSeriesBuildOptions = {}
): PortfolioScalePoint[] {
  if (assets.length === 0) {
    return [];
  }

  const earliestAssetPurchaseDate = assets.reduce((earliest, asset) => {
    return asset.purchaseDate < earliest ? asset.purchaseDate : earliest;
  }, assets[0].purchaseDate);
  const startDate = options.startDate ?? earliestAssetPurchaseDate;
  const endDate = options.endDate ?? dayjs().format('YYYY-MM-DD');
  const allDays = getAllDays(startDate, endDate);

  const assetTradingDays = buildAssetTradingDays(assetHistories);

  const assetMeta = assets.map((asset) => ({
    asset,
    costCNY: calculateContributionCNY(asset),
    tradingDays: assetTradingDays.get(asset.id),
  }));

  const purchaseCostCache = new Map<string, number>();
  assets.forEach((asset) => {
    purchaseCostCache.set(asset.id, calculateContributionCNY(asset));
  });

  const scalePoints: PortfolioScalePoint[] = [];
  let accumulatedCostCNY = 0;
  const activeAssetIndices: number[] = [];

  for (const currentDate of allDays) {
    for (let i = 0; i < assetMeta.length; i++) {
      if (!activeAssetIndices.includes(i) && assetMeta[i].asset.purchaseDate <= currentDate) {
        activeAssetIndices.push(i);
        accumulatedCostCNY += assetMeta[i].costCNY;
      }
    }

    if (activeAssetIndices.length === 0) {
      continue;
    }

    let totalValueCNY = 0;
    for (const idx of activeAssetIndices) {
      const { asset, tradingDays } = assetMeta[idx];
      const pointPrice = getAssetPointPrice(
        asset,
        currentDate,
        assetHistories[asset.id],
        tradingDays
      );
      totalValueCNY += calculateAssetPointValueCNY(asset, currentDate, pointPrice);
    }

    if (accumulatedCostCNY <= 0) {
      continue;
    }

    const floatingPnLCNY = totalValueCNY - accumulatedCostCNY;
    const floatingReturnRate = floatingPnLCNY / accumulatedCostCNY;

    scalePoints.push({
      date: currentDate,
      totalValueCNY,
      totalCostCNY: accumulatedCostCNY,
      floatingPnLCNY,
      floatingReturnRate,
    });
  }

  return scalePoints;
}

export function buildPortfolioPerformanceSeries(assets: Asset[], scalePoints: PortfolioScalePoint[]): PortfolioPerformancePoint[] {
  if (assets.length === 0 || scalePoints.length === 0) {
    return [];
  }

  const contributionByDate = new Map<string, number>();
  assets.forEach((asset) => {
    const date = dayjs(asset.purchaseDate).format('YYYY-MM-DD');
    const contribution = calculateContributionCNY(asset);
    contributionByDate.set(date, (contributionByDate.get(date) ?? 0) + contribution);
  });

  const performancePoints: PortfolioPerformancePoint[] = [];
  let unitsOutstanding = 0;
  let previousUnitValue = 1;
  let previousPortfolioValue = 0;

  for (const [index, point] of scalePoints.entries()) {
    const date = point.date;
    const contributionCNY = contributionByDate.get(date) ?? 0;

    const portfolioValueCNY = contributionCNY > 0 && index > 0
      ? previousPortfolioValue + contributionCNY
      : contributionCNY > 0 && index === 0
        ? contributionCNY
        : point.totalValueCNY;

    if (contributionCNY > 0) {
      const issueBase = previousUnitValue > 0 ? previousUnitValue : 1;
      const newUnits = contributionCNY / issueBase;
      unitsOutstanding += newUnits;
    }

    if (unitsOutstanding <= 0 && portfolioValueCNY > 0) {
      unitsOutstanding = portfolioValueCNY;
    }

    const currentUnitValue = unitsOutstanding > 0
      ? portfolioValueCNY / unitsOutstanding
      : previousUnitValue;
    const nav = currentUnitValue * 100;
    const returnRate = normalizeRatio(nav / 100 - 1);

    performancePoints.push({
      date,
      portfolioValueCNY,
      contributionCNY,
      unitsOutstanding,
      nav,
      returnRate,
    });

    previousUnitValue = currentUnitValue;
    previousPortfolioValue = portfolioValueCNY;
  }

  return performancePoints;
}

// 生成稳定的资产缓存键（基于code+type+purchaseDate，而非随机ID）
function getAssetCacheKey(asset: Asset): string {
  return `${asset.code}_${asset.type}_${asset.purchaseDate}`;
}

function parsePositiveNumber(value?: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function buildAssetPriceHistoryMaps(
  assets: Asset[],
  forceRefresh: boolean = false,
  today: string = dayjs().format('YYYY-MM-DD')
): Promise<AssetHistoryMap> {
  const assetHistories: AssetHistoryMap = {};

  const cacheResults = await Promise.all(
    assets.map(async (asset) => {
      if (!forceRefresh) {
        const cacheKey = getAssetCacheKey(asset);
        const cached = await dataCache.getByKey(cacheKey, asset);
        if (cached) {
          return { asset, data: cached, fromCache: true };
        }
      }

      return { asset, data: null, fromCache: false };
    })
  );

  const needFetch = cacheResults.filter((result) => !result.fromCache);
  const fetchResults = await Promise.all(
    needFetch.map(async ({ asset }) => {
      try {
        const history = new Map<string, number>();

        if (asset.type === 'fund') {
          const fundHist = await api.fund.getNavAll(asset.code, asset.purchaseDate);
          const sortedHist = [...fundHist].sort((a, b) => a.date.localeCompare(b.date));

          const baseNav = asset.purchasePrice;
          let adjustedNav = baseNav;

          sortedHist.forEach((entry) => {
            const normalizedDate = normalizeHistoryDate(entry.date);

            if (normalizedDate === asset.purchaseDate) {
              adjustedNav = baseNav;
              history.set(normalizedDate, adjustedNav);
            } else {
              adjustedNav = adjustedNav * (1 + (entry.changePercent || 0));
              history.set(normalizedDate, adjustedNav);
            }
          });

          if (sortedHist.length === 0) {
            history.set(asset.purchaseDate, baseNav);
            history.set(today, baseNav);
          } else {
            const latestHistEntry = sortedHist[sortedHist.length - 1];
            const latestHistDate = normalizeHistoryDate(latestHistEntry.date);
            const latestAdjustedNav = history.get(latestHistDate) ?? adjustedNav;
            const fundData = await api.fund.getQuote(asset.code);

            let referenceAdjustedNav = latestAdjustedNav;
            let referenceOfficialNav = latestHistEntry.unitNav;

            if (fundData) {
              const quoteDate = fundData.jzrq ? normalizeHistoryDate(fundData.jzrq) : latestHistDate;
              const officialNav = parsePositiveNumber(fundData.dwjz);
              const estimatedNav = parsePositiveNumber(fundData.gsz);
              const canApplyOfficialQuote = Boolean(
                officialNav &&
                latestHistEntry.unitNav > 0 &&
                quoteDate >= latestHistDate
              );

              if (canApplyOfficialQuote && officialNav) {
                referenceAdjustedNav = latestAdjustedNav * (officialNav / latestHistEntry.unitNav);
                referenceOfficialNav = officialNav;
                history.set(quoteDate, referenceAdjustedNav);
              }

              const latestVisibleNav = estimatedNav ?? officialNav;
              if (latestVisibleNav && referenceOfficialNav > 0) {
                history.set(today, referenceAdjustedNav * (latestVisibleNav / referenceOfficialNav));
              } else {
                history.set(today, referenceAdjustedNav);
              }
            } else {
              history.set(today, referenceAdjustedNav);
            }
          }
        } else {
          const startDate = asset.purchaseDate.replace(/-/g, '');
          const endDate = today.replace(/-/g, '');
          const klineData: KLineData[] = asset.type === 'a_stock'
            ? await api.stock.getAStockKLine(asset.code, 'day', startDate, endDate)
            : await api.stock.getHKStockKLine(asset.code, 'day', startDate, endDate);

          klineData.forEach((item) => {
            history.set(normalizeHistoryDate(item.date), item.close);
          });
        }

        // 使用稳定的缓存键保存
        const cacheKey = getAssetCacheKey(asset);
        await dataCache.setByKey(cacheKey, Array.from(history.entries()), asset);
        return { assetId: asset.id, history };
      } catch (error) {
        console.error(`Error fetching history for ${asset.code}:`, error);
        const fallback = new Map<string, number>();
        fallback.set(asset.purchaseDate, asset.purchasePrice);
        fallback.set(today, asset.purchasePrice);
        return { assetId: asset.id, history: fallback };
      }
    })
  );

  cacheResults.forEach((result) => {
    if (result.fromCache && result.data) {
      assetHistories[result.asset.id] = new Map<string, number>(result.data);
    }
  });

  fetchResults.forEach((result) => {
    assetHistories[result.assetId] = result.history;
  });

  return assetHistories;
}

// 系列计算结果缓存
interface SeriesCacheEntry {
  assetsHash: string;
  result: PortfolioSeriesResult;
  timestamp: number;
}

let seriesCache: SeriesCacheEntry | null = null;
const SERIES_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

function generateAssetsHash(assets: Asset[]): string {
  return assets
    .map((a) => `${a.id}:${a.code}:${a.type}:${a.currency}:${a.purchaseDate}:${a.purchasePrice}:${a.quantity}`)
    .sort()
    .join('|');
}

export function clearPortfolioSeriesCache(): void {
  seriesCache = null;
}

export async function calculatePortfolioSeries(
  assets: Asset[],
  forceRefresh: boolean = false
): Promise<PortfolioSeriesResult> {
  if (assets.length === 0) {
    return { scale: [], performance: [] };
  }

  const currentHash = generateAssetsHash(assets);

  // 检查缓存是否有效
  if (!forceRefresh && seriesCache) {
    const isExpired = Date.now() - seriesCache.timestamp > SERIES_CACHE_TTL;
    if (seriesCache.assetsHash === currentHash && !isExpired) {
      return seriesCache.result;
    }
  }

  const assetHistories = await buildAssetPriceHistoryMaps(assets, forceRefresh);
  const scale = buildPortfolioScaleSeries(assets, assetHistories);
  const performance = buildPortfolioPerformanceSeries(assets, scale);

  const result = { scale, performance };

  // 更新缓存
  seriesCache = {
    assetsHash: currentHash,
    result,
    timestamp: Date.now(),
  };

  return result;
}

function normalizeHistoryDate(date: string): string {
  if (date.includes('/')) {
    return date.replace(/\//g, '-');
  }

  if (!date.includes('-')) {
    return date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
  }

  return date;
}
