import type { Asset } from '../types';
import type { DualPriceResult } from './priceFallback';

export function getEditableStockPurchasePrice(asset: Asset): number {
  if (asset.priceInputType === 'raw') {
    return asset.purchasePriceRaw ?? asset.purchasePrice;
  }

  if (asset.priceInputType === 'adjusted') {
    return asset.purchasePriceAdjusted ?? asset.purchasePrice;
  }

  return asset.purchasePrice;
}

export function buildStockPricePayload(
  inputPrice: number,
  priceInputType: 'raw' | 'adjusted',
  dualPrice: DualPriceResult | null,
  existingPrices?: {
    raw?: number;
    adjusted?: number;
  }
) {
  return {
    purchasePrice: inputPrice,
    priceInputType,
    purchasePriceRaw: priceInputType === 'raw'
      ? inputPrice
      : dualPrice?.raw.price ?? existingPrices?.raw,
    purchasePriceAdjusted: priceInputType === 'adjusted'
      ? inputPrice
      : dualPrice?.preAdjusted.price ?? existingPrices?.adjusted,
  };
}

export function getStockHistoryFqt(asset: Asset): 0 | 1 {
  return asset.priceInputType === 'raw' ? 0 : 1;
}
