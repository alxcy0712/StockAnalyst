import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { dataCache } from '../utils/dataCache';
import { clearPortfolioSeriesCache } from '../utils/portfolioSeries';
import type { Asset } from '../types';

interface AssetState {
  assets: Asset[];
  addAsset: (asset: Omit<Asset, 'id'>) => void;
  updateAsset: (id: string, updates: Partial<Asset>) => void;
  removeAsset: (id: string) => void;
  clearAll: () => void;
  highlightedAssetId?: string | null;
  setHighlightedAssetId: (id: string | null) => void;
}

export const useAssetStore = create<AssetState>()(
  persist(
    (set) => ({
      assets: [],
      addAsset: (asset) => {
        clearPortfolioSeriesCache();
        set((state) => ({
          assets: [
            ...state.assets,
            { ...asset, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}` },
          ],
        }));
      },
      updateAsset: (id, updates) => {
        dataCache.invalidate(id);
        clearPortfolioSeriesCache();
        set((state) => ({
          assets: state.assets.map((asset) =>
            asset.id === id ? { ...asset, ...updates } : asset
          ),
        }));
      },
      removeAsset: (id) => {
        dataCache.invalidate(id);
        clearPortfolioSeriesCache();
        set((state) => ({
          assets: state.assets.filter((asset) => asset.id !== id),
        }));
      },
      clearAll: async () => {
        await dataCache.clearAll();
        clearPortfolioSeriesCache();
        set({ assets: [] });
      },
      highlightedAssetId: null,
      setHighlightedAssetId: (id) => set(() => ({ highlightedAssetId: id })),
    }),
    {
      name: 'asset-storage',
    }
  )
);
