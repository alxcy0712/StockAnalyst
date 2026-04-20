import type { Asset } from '../types';
import type { DualPriceResult } from './priceFallback';

export function getEditableStockPurchasePrice(asset: Asset): number {
  return asset.purchasePriceAdjusted ?? asset.purchasePrice;
}

export function buildStockPricePayload(
  inputPrice: number,
  dualPrice: DualPriceResult | null,
  existingPrices?: {
    raw?: number;
    adjusted?: number;
  }
) {
  return {
    purchasePrice: inputPrice,
    priceInputType: 'adjusted' as const,
    purchasePriceRaw: dualPrice?.raw.price ?? existingPrices?.raw,
    purchasePriceAdjusted: inputPrice,
  };
}

export function getStockHistoryFqt(_asset: Asset): 1 {
  return 1;
}
