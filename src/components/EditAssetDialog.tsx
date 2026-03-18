import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useAssetStore } from '../stores/assetStore';
import { useErrorStore } from '../stores/errorStore';
import { useFormError, getInputErrorClass } from '../hooks/useFormError';
import { api } from '../api';
import { getClosingPriceWithFallback } from '../utils/priceFallback';
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

export function EditAssetDialog({ asset, isOpen, onClose }: EditAssetDialogProps) {
  const updateAsset = useAssetStore((state) => state.updateAsset);
  const { addError, clearAll, clearFieldError } = useErrorStore();
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // 表单字段错误管理
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

  // 处理弹窗显示/隐藏的动效
  useEffect(() => {
    if (isOpen) {
      // 小延迟确保DOM已渲染，然后开始动画
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // 当 asset 变化时更新表单数据
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
    }
  }, [asset]);

  // ESC 键关闭弹窗
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // 阻止背景滚动
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

  // 获取收盘价
  useEffect(() => {
    const fetchClosingPrice = async () => {
      if (!asset || !formData.useClosingPrice || !asset.code || !formData.purchaseDate) return;

      // 校验代码格式，格式不对直接返回，不调用API
      const code = asset.code.trim();
      if (asset.type === 'a_stock' && !/^\d{6}$/.test(code)) {
        addError('A股代码应为6位数字', 'error', 'editPurchasePrice', 0);
        return;
      }
      if (asset.type === 'hk_stock' && !/^\d{5}$/.test(code)) {
        addError('港股代码应为5位数字', 'error', 'editPurchasePrice', 0);
        return;
      }
      if (asset.type === 'fund' && !/^\d{6}$/.test(code)) {
        addError('基金代码应为6位数字', 'error', 'editPurchasePrice', 0);
        return;
      }

      setIsLoadingPrice(true);
      clearFieldError('editPurchasePrice');
      try {
        if (asset.type === 'fund') {
          // 基金使用原有的净值查询逻辑，也加上向前查找
          const fundHistory = await api.fund.getNavHistory(asset.code, formData.purchaseDate, formData.purchaseDate);
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
            // 未找到目标日期，使用最近的一个净值
            const nearestItem = fundHistory[0];
            setFormData(prev => ({ ...prev, purchasePrice: nearestItem.unitNav.toString() }));
            (window as any).__fundAccumulatedNav = nearestItem.accumulatedNav;
            clearFieldError('editPurchasePrice');
            addError(`${formData.purchaseDate}为休假日，使用前一交易日净值：${nearestItem.unitNav.toFixed(4)}`, 'info', undefined, 5000);
          } else {
            addError('未获取到该日期净值数据', 'error', 'editPurchasePrice', 0);
          }
        } else {
          // 股票使用带fallback的函数
          const result = await getClosingPriceWithFallback(
            asset.code,
            asset.type as 'a_stock' | 'hk_stock',
            formData.purchaseDate,
            7
          );
          
          if (result.price !== null) {
            setFormData(prev => ({ ...prev, purchasePrice: result.price!.toString() }));
            clearFieldError('editPurchasePrice');
            
            // 如果是休假日，显示提示信息
            if (result.isHoliday && result.message) {
              addError(result.message, 'info', undefined, 5000);
            }
          } else {
            addError(result.message || '未获取到该日期价格数据', 'error', 'editPurchasePrice', 0);
          }
        }
      } catch (error) {
        console.error('Failed to fetch closing price:', error);
        addError('获取价格失败，请手动输入', 'error', 'editPurchasePrice', 0);
      } finally {
        setIsLoadingPrice(false);
      }
    };

    if (formData.useClosingPrice && formData.purchaseDate) {
      fetchClosingPrice();
    }
  }, [formData.useClosingPrice, formData.purchaseDate, asset, addError, clearFieldError]);

  const handleClose = () => {
    setIsVisible(false);
    clearAll();
    // 等待动画完成后再关闭
    setTimeout(() => {
      onClose();
    }, 200);
  };

  const handleSave = () => {
    if (!asset) return;
    
    // 验证所有字段
    const isPriceValid = priceError.validateField(formData.purchasePrice);
    const isQuantityValid = quantityError.validateField(formData.quantity);
    
    if (!isPriceValid || !isQuantityValid) {
      addError('请检查表单中的错误信息', 'error');
      return;
    }
    
    const isFund = asset.type === 'fund';
    const accumulatedNav = isFund ? (window as any).__fundAccumulatedNav : undefined;
    
    updateAsset(asset.id, {
      name: formData.name,
      purchaseDate: formData.purchaseDate,
      purchasePrice: parseFloat(formData.purchasePrice),
      accumulatedNavAtPurchase: accumulatedNav,
      quantity: parseFloat(formData.quantity),
      currency: formData.currency,
      useClosingPrice: formData.useClosingPrice,
    });
    delete (window as any).__fundAccumulatedNav;
    handleClose();
  };

  if (!asset || !isOpen) return null;

  const isFund = asset.type === 'fund';

  return (
    <div 
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-200 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* 遮罩层 */}
      <div 
        className={`absolute inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm transition-opacity duration-200 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />
      
      {/* 弹窗内容 */}
      <div 
        className={`relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 transition-all duration-200 ease-out ${
          isVisible 
            ? 'opacity-100 scale-100 translate-y-0' 
            : 'opacity-0 scale-95 translate-y-4'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">编辑资产</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-mono mt-0.5">{asset.code}</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区 */}
        <div className="p-6 space-y-4">
          {/* 类型标签 */}
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 rounded text-blue-600 dark:text-blue-400 font-medium">
              {TYPE_LABELS[asset.type]}
            </span>
            <span className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300 font-medium">
              {asset.currency}
            </span>
          </div>

          {/* 资产名称 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">资产名称</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-colors"
              placeholder="输入资产名称"
            />
          </div>

          {/* 购入日期 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">购入日期</label>
            <input
              type="date"
              value={formData.purchaseDate}
              onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value, purchasePrice: '' })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-colors"
            />
          </div>

          {/* 购入单价选择（非基金） */}
          {!isFund && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">购入单价来源</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, useClosingPrice: false, purchasePrice: '' })}
                  className={`flex-1 py-2 px-3 rounded-lg border-2 transition-all duration-150 ${
                    !formData.useClosingPrice
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
                  }`}
                >
                  手动输入
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, useClosingPrice: true, purchasePrice: '' })}
                  className={`flex-1 py-2 px-3 rounded-lg border-2 transition-all duration-150 ${
                    formData.useClosingPrice
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
                  }`}
                >
                  使用收盘价
                </button>
              </div>
            </div>
          )}
          
          {/* 购入单价/净值 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {isFund ? '单位净值' : '购入单价'}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.0001"
                  value={formData.purchasePrice}
                  onChange={(e) => {
                    if (!formData.useClosingPrice) {
                      setFormData({ ...formData, purchasePrice: e.target.value });
                    }
                  }}
                  placeholder={formData.useClosingPrice ? "自动获取…" : "请输入价格"}
                  disabled={formData.useClosingPrice}
                  className={`w-full px-3 py-2 bg-white dark:bg-slate-700 border-2 rounded-lg focus:outline-none focus:ring-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-colors ${
                    formData.useClosingPrice 
                      ? 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 cursor-not-allowed' 
                      : getInputErrorClass(priceError.hasError)
                  }`}
                />
                {isLoadingPrice && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center text-xs text-slate-400">
                    <Loader2 size={12} className="animate-spin mr-1" />
                    获取中…
                  </span>
                )}
                {formData.useClosingPrice && formData.purchasePrice && !isLoadingPrice && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600 dark:text-green-400 font-medium">
                    ✓ 已获取
                  </span>
                )}
              </div>
              {/* 基金显示获取净值按钮 */}
              {isFund && (
                <button
                  type="button"
                  onClick={() => {
                    if (!asset?.code || !formData.purchaseDate) return;
                    const code = asset.code.trim();
                    if (!/^\d{6}$/.test(code)) {
                      addError('基金代码应为6位数字', 'error', 'editPurchasePrice', 0);
                      return;
                    }
                    setIsLoadingPrice(true);
                    clearFieldError('editPurchasePrice');
                    api.fund.getNavHistory(code, formData.purchaseDate, formData.purchaseDate)
                      .then((fundHistory: any[]) => {
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
                      })
                      .catch((error: any) => {
                        console.error('Failed to fetch fund NAV:', error);
                        addError('获取净值失败，请手动输入', 'error', 'editPurchasePrice', 0);
                      })
                      .finally(() => {
                        setIsLoadingPrice(false);
                      });
                  }}
                  disabled={!asset?.code || !formData.purchaseDate || isLoadingPrice}
                  className="py-2 px-4 rounded-lg border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  获取净值
                </button>
              )}
            </div>
            {!isFund && formData.useClosingPrice && (
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                系统将自动获取该日期的收盘价
              </p>
            )}
          </div>

          {/* 数量 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">数量</label>
            <input
              type="number"
              step="0.01"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              className={`w-full px-3 py-2 bg-white dark:bg-slate-700 border-2 rounded-lg focus:outline-none focus:ring-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-colors ${getInputErrorClass(quantityError.hasError)}`}
              placeholder="0.00"
            />
          </div>

        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={handleClose}
            className="px-5 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!formData.purchasePrice || isLoadingPrice}
            className="px-5 py-2 text-sm font-medium text-white dark:text-slate-900 bg-slate-900 dark:bg-white rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            保存修改
          </button>
        </div>
      </div>
    </div>
  );
}
