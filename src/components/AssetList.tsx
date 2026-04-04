import { useState } from 'react';
import { Trash2, Pencil } from 'lucide-react';
import { useAssetStore } from '../stores/assetStore';
import type { Asset } from '../types';
import { EditAssetDialog } from './EditAssetDialog';
import { getHistoricalExchangeRate, convertToCNY } from '../api/adapters/exchange';

const TYPE_LABELS: Record<string, string> = {
  a_stock: 'A股',
  hk_stock: '港股',
  fund: '基金',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥',
  HKD: 'HK$',
  USD: '$',
};

export function AssetList() {
  const { assets, removeAsset } = useAssetStore();
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const highlightedAssetId = useAssetStore((s) => s.highlightedAssetId);

  if (assets.length === 0) {
    return (
      <div className="text-center py-12 text-[#86868b] dark:text-[#86868b]">
        <p className="text-sm font-normal tracking-wide">暂无资产，请点击上方按钮添加</p>
      </div>
    );
  }

  // 计算总成本（统一转换为人民币）
  const totalCost = assets.reduce((sum, asset) => {
    const cost = asset.purchasePrice * asset.quantity;
    const rate = getHistoricalExchangeRate(asset.purchaseDate);
    const costCNY = convertToCNY(cost, asset.currency, rate);
    return sum + costCNY;
  }, 0);

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingAsset(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-1">
        <h3 className="text-base font-semibold text-[#1d1d1f] dark:text-white tracking-tight">资产列表</h3>
        <span className="text-xs text-[#86868b] dark:text-[#86868b] font-normal">{assets.length} 项资产</span>
      </div>

      <div className="max-h-[380px] overflow-y-auto pr-1" aria-label="资产卡片列表">
        <div className="grid gap-3" style={{ gridAutoRows: 'auto' }}>
          {assets.map((asset) => {
            const isHighlighted = highlightedAssetId === asset.id;
            const dim = highlightedAssetId ? (highlightedAssetId === asset.id ? false : true) : false;
            return (
              <div key={asset.id} className={dim ? 'opacity-40 transition-opacity duration-280' : 'transition-opacity duration-280'}>
                <AssetCard
                  asset={asset}
                  onDelete={() => removeAsset(asset.id)}
                  onEdit={() => handleEdit(asset)}
                  isHighlighted={isHighlighted}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-4 bg-[#f2f2f4] dark:bg-[#2c2c2e]/50 rounded-2xl">
        <div className="flex justify-between items-center">
          <span className="text-xs text-[#86868b] dark:text-[#86868b] font-normal">总成本</span>
          <span className="text-base font-semibold text-[#1d1d1f] dark:text-white tracking-tight">
            ¥{totalCost.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <EditAssetDialog
        asset={editingAsset}
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
      />
    </div>
  );
}

function AssetCard({
  asset,
  onDelete,
  onEdit,
  isHighlighted
}: {
  asset: Asset;
  onDelete: () => void;
  onEdit: () => void;
  isHighlighted?: boolean;
}) {
  const cost = asset.purchasePrice * asset.quantity;

  return (
    <div 
      className={`
        bg-white dark:bg-[#1c1c1e] 
        border border-[#e5e5e5] dark:border-[#38383a] 
        rounded-2xl p-4 
        shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none
        hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:hover:shadow-none
        hover:border-[#d1d1d6] dark:hover:border-[#48484a]
        hover:-translate-y-0.5
        transition-all duration-[280ms]
        ${isHighlighted ? 'ring-2 ring-blue-500/50 shadow-[0_4px_20px_rgba(59,130,246,0.15)]' : ''}
      `}
      style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1.0)' }}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] px-2.5 py-1 bg-[#f2f2f4] dark:bg-[#2c2c2e] rounded-full text-[#424245] dark:text-[#e5e5e5] font-medium tracking-tight">
              {TYPE_LABELS[asset.type]}
            </span>
            <span className="text-[11px] px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400 font-medium">
              {asset.currency}
            </span>
          </div>

          <h4 className="font-semibold text-[#1d1d1f] dark:text-white truncate text-sm tracking-tight">{asset.name}</h4>
          <p className="text-[11px] text-[#86868b] dark:text-[#86868b] font-mono mt-0.5 tracking-wide">{asset.code}</p>

          <div className="mt-4 flex justify-between text-xs">
            <div>
              <span className="text-[#86868b] dark:text-[#86868b] block mb-1 text-[10px] font-normal">日期</span>
              <p className="font-medium text-[#424245] dark:text-[#e5e5e5] tracking-tight">{asset.purchaseDate}</p>
            </div>
            <div>
              <span className="text-[#86868b] dark:text-[#86868b] block mb-1 text-[10px] font-normal">单价</span>
              <p className="font-medium text-[#424245] dark:text-[#e5e5e5] tracking-tight">
                {CURRENCY_SYMBOLS[asset.currency]}{asset.purchasePrice.toFixed(4)}
              </p>
            </div>
            <div>
              <span className="text-[#86868b] dark:text-[#86868b] block mb-1 text-[10px] font-normal">数量</span>
              <p className="font-medium text-[#424245] dark:text-[#e5e5e5] tracking-tight">{asset.quantity.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-[#86868b] dark:text-[#86868b] block mb-1 text-[10px] font-normal">成本</span>
              <p className="font-medium text-[#424245] dark:text-[#e5e5e5] tracking-tight">
                {CURRENCY_SYMBOLS[asset.currency]}{cost.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 ml-3">
          <button
            onClick={onEdit}
            className="p-2 text-[#86868b] dark:text-[#86868b] hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all duration-200"
            title="编辑"
          >
            <Pencil size={14} strokeWidth={1.5} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-[#86868b] dark:text-[#86868b] hover:text-[#ff3b30] dark:hover:text-[#ff453a] hover:bg-[#ff3b30]/8 dark:hover:bg-[#ff453a]/15 rounded-xl transition-all duration-200"
            title="删除"
          >
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
