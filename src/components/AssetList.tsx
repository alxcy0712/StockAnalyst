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
      <div className="text-center py-10 text-gray-400 dark:text-gray-500">
        <p className="text-sm">暂无资产，请点击上方按钮添加</p>
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
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">资产列表</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">{assets.length} 项资产</span>
      </div>

      <div className="max-h-[380px] overflow-y-auto pr-1" aria-label="资产卡片列表">
        <div className="grid gap-2" style={{ gridAutoRows: 'auto' }}>
          {assets.map((asset) => {
            const isHighlighted = highlightedAssetId === asset.id;
            const dim = highlightedAssetId ? (highlightedAssetId === asset.id ? false : true) : false;
            return (
              <div key={asset.id} className={dim ? 'opacity-50' : ''}>
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

      <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500 dark:text-gray-400">总成本</span>
          <span className="text-base font-semibold text-gray-900 dark:text-white">
            ¥{totalCost.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
    <div className={`bg-white dark:bg-[#1c1c1e] border border-gray-200/60 dark:border-gray-800/60 rounded-xl p-3 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:hover:shadow-none hover:border-gray-300/60 dark:hover:border-gray-700/60 transition-all duration-300 ${isHighlighted ? 'ring-2 ring-blue-500/50' : ''}`}>
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300 font-medium">
              {TYPE_LABELS[asset.type]}
            </span>
            <span className="text-[10px] px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 rounded-full text-blue-600 dark:text-blue-400 font-medium">
              {asset.currency}
            </span>
          </div>

          <h4 className="font-medium text-gray-900 dark:text-white truncate text-sm">{asset.name}</h4>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono mt-0.5">{asset.code}</p>

          <div className="mt-3 flex justify-between text-[11px]">
            <div>
              <span className="text-gray-400 dark:text-gray-500 block mb-0.5">日期</span>
              <p className="font-medium text-gray-700 dark:text-gray-300">{asset.purchaseDate}</p>
            </div>
            <div>
              <span className="text-gray-400 dark:text-gray-500 block mb-0.5">单价</span>
              <p className="font-medium text-gray-700 dark:text-gray-300">
                {CURRENCY_SYMBOLS[asset.currency]}{asset.purchasePrice.toFixed(3)}
              </p>
            </div>
            <div>
              <span className="text-gray-400 dark:text-gray-500 block mb-0.5">数量</span>
              <p className="font-medium text-gray-700 dark:text-gray-300">{asset.quantity.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-gray-400 dark:text-gray-500 block mb-0.5">成本</span>
              <p className="font-medium text-gray-700 dark:text-gray-300">
                {CURRENCY_SYMBOLS[asset.currency]}{cost.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all duration-200"
            title="编辑"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200"
            title="删除"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
