import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { dataCache } from '../utils/dataCache';
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
      addAsset: (asset) =>
        set((state) => ({
          assets: [
            ...state.assets,
            { ...asset, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}` },
          ],
        })),
      updateAsset: (id, updates) => {
        // 清除缓存以确保更新的数据被重新获取
        dataCache.invalidate(id);
        set((state) => ({
          assets: state.assets.map((asset) =>
            asset.id === id ? { ...asset, ...updates } : asset
          ),
        }));
      },
      removeAsset: (id) => {
        // 清除该资产的缓存
        dataCache.invalidate(id);
        set((state) => ({
          assets: state.assets.filter((asset) => asset.id !== id),
        }));
      },
      clearAll: async () => {
        await dataCache.clearAll();
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
