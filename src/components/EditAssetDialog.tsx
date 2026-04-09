import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { useAssetStore } from '../stores/assetStore';
import { useErrorStore } from '../stores/errorStore';
import { useFormError, getInputErrorClass } from '../hooks/useFormError';
import { api } from '../api';
import { getDualClosingPriceWithFallback, type DualPriceResult } from '../utils/priceFallback';
import type { Asset, Currency } from '../types';

const TYPE_LABELS: Record<string, string> = {
  a_stock: 'A股',
  hk_stock: '港股',
  fund: '基金',
};

interface EditAssetDialogProps {
  asset: Asset | null;
  isOpen: boolean;
  onClose: () => void;
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const APPLE_EASE_OUT: [number, number, number, number] = [0.25, 0.1, 0.25, 1.0];

const dialogVariants = {
  hidden: { 
    opacity: 0, 
    scale: 0.98, 
    y: 10 
  },
  visible: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: {
      duration: 0.32,
      ease: APPLE_EASE_OUT,
    }
  },
  exit: { 
    opacity: 0, 
    scale: 0.985, 
    y: 8,
    transition: {
      duration: 0.25,
      ease: APPLE_EASE_OUT,
    }
  },
};

export function EditAssetDialog({ asset, isOpen, onClose }: EditAssetDialogProps) {
  const updateAsset = useAssetStore((state) => state.updateAsset);
  const { addError, clearAll, clearFieldError } = useErrorStore();
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);

  const [priceInputMode, setPriceInputMode] = useState<'raw' | 'adjusted'>(
    asset?.priceInputType || 'adjusted'
  );

  const [dualPrice, setDualPrice] = useState<{
    data: DualPriceResult | null;
    isLoading: boolean;
    selectedType: 'raw' | 'adjusted' | null;
  }>({ data: null, isLoading: false, selectedType: null });

  const priceError = useFormError({
    field: 'editPurchasePrice',
    validate: (value) => {
      if (!value || parseFloat(value as string) <= 0) {
        return '请输入有效的购入价格';
      }
      return null;
    },
  });

  const quantityError = useFormError({
    field: 'editQuantity',
    validate: (value) => {
      if (!value || parseFloat(value as string) <= 0) {
        return '请输入有效的数量';
      }
      return null;
    },
  });

  const [formData, setFormData] = useState({
    name: '',
    purchaseDate: '',
    purchasePrice: '',
    quantity: '',
    currency: 'CNY' as Currency,
    useClosingPrice: false,
  });

  useEffect(() => {
    if (asset) {
      setFormData({
        name: asset.name,
        purchaseDate: asset.purchaseDate,
        purchasePrice: asset.purchasePrice.toString(),
        quantity: asset.quantity.toString(),
        currency: asset.currency,
        useClosingPrice: asset.useClosingPrice ?? false,
      });
      setPriceInputMode(asset.priceInputType || 'adjusted');
      setDualPrice({ data: null, isLoading: false, selectedType: null });
    }
  }, [asset]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleClose = () => {
    clearAll();
    setDualPrice({ data: null, isLoading: false, selectedType: null });
    onClose();
  };

  const fetchClosingPrice = async () => {
    if (!asset || !asset.code || !formData.purchaseDate) return;

    const code = asset.code.trim();
    if (asset.type === 'a_stock' && !/^\d{6}$/.test(code)) {
      addError('A股代码应为6位数字', 'error', 'editPurchasePrice', 0);
      return;
    }
    if (asset.type === 'hk_stock' && !/^\d{5}$/.test(code)) {
      addError('港股代码应为5位数字', 'error', 'editPurchasePrice', 0);
      return;
    }

    setIsLoadingPrice(true);
    setDualPrice(prev => ({ ...prev, isLoading: true }));
    clearFieldError('editPurchasePrice');

    try {
      const result = await getDualClosingPriceWithFallback(
        asset.code,
        asset.type as 'a_stock' | 'hk_stock',
        formData.purchaseDate,
        7
      );

      setDualPrice({
        data: result,
        isLoading: false,
        selectedType: 'adjusted'
      });

      if (result.preAdjusted.price !== null) {
        setFormData(prev => ({ ...prev, purchasePrice: result.preAdjusted.price!.toString() }));
        clearFieldError('editPurchasePrice');

        if (result.preAdjusted.isHoliday && result.preAdjusted.message) {
          addError(result.preAdjusted.message, 'info', undefined, 5000);
        }
      } else {
        addError(result.preAdjusted.message || '未获取到该日期价格数据', 'error', 'editPurchasePrice', 0);
      }
    } catch (error) {
      console.error('Failed to fetch closing price:', error);
      addError('获取价格失败，请手动输入', 'error', 'editPurchasePrice', 0);
    } finally {
      setIsLoadingPrice(false);
    }
  };

  const fetchFundNav = async () => {
    if (!asset?.code || !formData.purchaseDate) return;
    const code = asset.code.trim();
    if (!/^\d{6}$/.test(code)) {
      addError('基金代码应为6位数字', 'error', 'editPurchasePrice', 0);
      return;
    }
    setIsLoadingPrice(true);
    clearFieldError('editPurchasePrice');
    try {
      const fundHistory = await api.fund.getNavHistory(code, formData.purchaseDate, formData.purchaseDate);
      const targetDate = formData.purchaseDate.replace(/-/g, '');
      const targetItem = fundHistory.find((item: { date: string; unitNav: number; accumulatedNav: number }) => {
        const itemDate = item.date.replace(/-/g, '');
        return itemDate === targetDate;
      });
      if (targetItem) {
        setFormData(prev => ({ ...prev, purchasePrice: targetItem.unitNav.toString() }));
        (window as any).__fundAccumulatedNav = targetItem.accumulatedNav;
        clearFieldError('editPurchasePrice');
      } else if (fundHistory.length > 0) {
        const nearestItem = fundHistory[0];
        setFormData(prev => ({ ...prev, purchasePrice: nearestItem.unitNav.toString() }));
        (window as any).__fundAccumulatedNav = nearestItem.accumulatedNav;
        clearFieldError('editPurchasePrice');
        addError(`${formData.purchaseDate}为休假日，使用前一交易日净值：${nearestItem.unitNav.toFixed(4)}`, 'info', undefined, 5000);
      } else {
        addError('未获取到该日期净值数据', 'error', 'editPurchasePrice', 0);
      }
    } catch (error) {
      console.error('Failed to fetch fund NAV:', error);
      addError('获取净值失败，请手动输入', 'error', 'editPurchasePrice', 0);
    } finally {
      setIsLoadingPrice(false);
    }
  };

  const handleSave = () => {
    if (!asset) return;

    const isPriceValid = priceError.validateField(formData.purchasePrice);
    const isQuantityValid = quantityError.validateField(formData.quantity);

    if (!isPriceValid || !isQuantityValid) {
      addError('请检查表单中的错误信息', 'error');
      return;
    }

    const isFund = asset.type === 'fund';
    const accumulatedNav = isFund ? (window as any).__fundAccumulatedNav : undefined;
    const isStock = asset.type === 'a_stock' || asset.type === 'hk_stock';

    updateAsset(asset.id, {
      name: formData.name,
      purchaseDate: formData.purchaseDate,
      purchasePrice: parseFloat(formData.purchasePrice),
      accumulatedNavAtPurchase: accumulatedNav,
      quantity: parseFloat(formData.quantity),
      currency: formData.currency,
      useClosingPrice: formData.useClosingPrice,
      priceInputType: isStock ? (dualPrice.data ? 'adjusted' : priceInputMode) : undefined,
      purchasePriceRaw: isStock && dualPrice.data?.raw.price !== null ? dualPrice.data?.raw.price : undefined,
      purchasePriceAdjusted: isStock && dualPrice.data?.preAdjusted.price !== null ? dualPrice.data?.preAdjusted.price : undefined,
    });
    delete (window as any).__fundAccumulatedNav;
    handleClose();
  };

  const isNegativePrice = (price: number | null): boolean => {
    if (price === null) return false;
    return price <= 0 || price < 0.01;
  };

  const formatPrice = (price: number | null): string => {
    if (price === null) return '--';
    if (price <= 0) return '≤ 0';
    return price.toFixed(2);
  };

  if (!asset) return null;

  const isFund = asset.type === 'fund';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-[#1d1d1f]/50 dark:bg-black/70 backdrop-blur-sm"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.25 }}
            onClick={handleClose}
          />
          
          <motion.div
            className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-white/95 dark:bg-[#1c1c1e]/95 rounded-2xl shadow-2xl border border-black/5 dark:border-white/10 backdrop-blur-xl"
            variants={dialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/10">
              <div>
                <h2 className="text-xl font-semibold text-[#1d1d1f] dark:text-white tracking-tight">编辑资产</h2>
                <p className="text-sm text-[#86868b] font-mono mt-0.5">{asset.code}</p>
              </div>
              <button
                onClick={handleClose}
                className="p-2 text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white hover:bg-[#f2f2f4] dark:hover:bg-white/10 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 font-medium">
                  {TYPE_LABELS[asset.type]}
                </span>
                <span className="text-xs px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 font-medium">
                  {asset.currency}
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1d1d1f] dark:text-white mb-1.5">资产名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-[#2c2c2e] border-2 border-[#e5e5e5] dark:border-[#3a3a3c] rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 text-[#1d1d1f] dark:text-white placeholder-[#86868b] transition-all"
                  placeholder="输入资产名称"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1d1d1f] dark:text-white mb-1.5">购入日期</label>
                <input
                  type="date"
                  value={formData.purchaseDate}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value, purchasePrice: '' })}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-[#2c2c2e] border-2 border-[#e5e5e5] dark:border-[#3a3a3c] rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 text-[#1d1d1f] dark:text-white transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1d1d1f] dark:text-white mb-1.5">
                  {isFund ? '单位净值' : '购入单价'}
                </label>

                {!isFund && (
                  <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (priceInputMode !== 'raw') {
                          setPriceInputMode('raw');
                          setDualPrice({ data: null, isLoading: false, selectedType: null });
                          setFormData(prev => ({ ...prev, purchasePrice: '' }));
                        }
                      }}
                      className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-all ${
                        priceInputMode === 'raw'
                          ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      当时实际价格
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (priceInputMode !== 'adjusted') {
                          setPriceInputMode('adjusted');
                          setDualPrice({ data: null, isLoading: false, selectedType: null });
                          setFormData(prev => ({ ...prev, purchasePrice: '' }));
                        }
                      }}
                      className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-all ${
                        priceInputMode === 'adjusted'
                          ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      账户成本价
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      step="0.0001"
                      value={formData.purchasePrice}
                      onChange={(e) => {
                        setFormData({ ...formData, purchasePrice: e.target.value });
                        if (dualPrice.data) {
                          setDualPrice(prev => ({ ...prev, selectedType: null }));
                        }
                      }}
                      placeholder={isFund ? '请输入购入单价' : (priceInputMode === 'raw' ? '输入当时实际成交价格' : '输入券商App显示的成本价')}
                      className={`w-full px-3.5 py-2.5 bg-white dark:bg-[#2c2c2e] border-2 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 text-[#1d1d1f] dark:text-white placeholder-[#86868b] transition-all ${getInputErrorClass(priceError.hasError)}`}
                    />
                    {isLoadingPrice && (
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 inline-flex items-center text-xs text-[#86868b]">
                        <Loader2 size={12} className="animate-spin mr-1.5" />
                        获取中…
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={isFund ? fetchFundNav : fetchClosingPrice}
                    disabled={!asset?.code || !formData.purchaseDate || isLoadingPrice || (!isFund && priceInputMode === 'adjusted')}
                    className="py-2.5 px-4 rounded-xl border border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-sm font-medium"
                  >
                    {isFund ? '获取净值' : '获取收盘价'}
                  </button>
                </div>

                {!isFund && dualPrice.data && (
                  <div className="mt-2 p-2 bg-[#f5f5f7] dark:bg-[#2c2c2e] rounded-lg border border-[#d2d2d7] dark:border-[#424245]">
                    <div className="flex items-center justify-between text-xs text-[#86868b] dark:text-[#8e8e93]">
                      <span>{formData.purchaseDate} 收盘价：前复权 ¥{formatPrice(dualPrice.data.preAdjusted.price)}</span>
                      <span>除权价 ¥{formatPrice(dualPrice.data.raw.price)}（当时实际价格）</span>
                    </div>
                    {isNegativePrice(dualPrice.data.preAdjusted.price) && (
                      <div className="mt-1 text-[10px] text-red-500">
                        ⚠️ 前复权价格极低，建议清除后手动输入除权价
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1d1d1f] dark:text-white mb-1.5">数量</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  className={`w-full px-3.5 py-2.5 bg-white dark:bg-[#2c2c2e] border-2 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 text-[#1d1d1f] dark:text-white placeholder-[#86868b] transition-all ${getInputErrorClass(quantityError.hasError)}`}
                  placeholder="0.00"
                />
              </div>

            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-black/5 dark:border-white/10 bg-[#fafafa] dark:bg-[#1c1c1e]/50 rounded-b-2xl">
              <button
                onClick={handleClose}
                className="px-5 py-2.5 text-sm font-medium text-[#1d1d1f] dark:text-white hover:bg-[#f2f2f4] dark:hover:bg-white/10 rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.purchasePrice || isLoadingPrice}
                className="px-5 py-2.5 text-sm font-medium text-white dark:text-[#1d1d1f] bg-[#1d1d1f] dark:bg-white rounded-xl hover:bg-[#000] dark:hover:bg-[#f5f5f7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                保存修改
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
