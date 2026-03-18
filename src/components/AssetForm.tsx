import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, HelpCircle, Loader2 } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import dayjs from 'dayjs';
import zhCN from 'dayjs/locale/zh-cn';
import { useAssetStore } from '../stores/assetStore';
import { useErrorStore } from '../stores/errorStore';
import { useFormError, getInputErrorClass } from '../hooks/useFormError';
import { api } from '../api';
import { getClosingPriceWithFallback } from '../utils/priceFallback';
import { dataCache } from '../utils/dataCache';
import type { AssetType, Currency } from '../types';

dayjs.locale(zhCN);

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'a_stock', label: 'A股' },
  { value: 'hk_stock', label: '港股' },
  { value: 'fund', label: '基金' },
];



const CODE_EXAMPLES: Record<AssetType, { placeholder: string; example: string; description: string }> = {
  a_stock: {
    placeholder: '如：600050',
    example: '中国联通：600050，贵州茅台：600519，宁德时代：300750',
    description: 'A股代码为6位数字，无需添加市场前缀（如.SH/.SZ）',
  },
  hk_stock: {
    placeholder: '如：00700',
    example: '腾讯控股：00700，阿里巴巴：09988，美团：03690',
    description: '港股代码为5位数字，不足5位前面补0',
  },
  fund: {
    placeholder: '如：007345',
    example: '易方达蓝筹：005827，中欧医疗：003095，招商白酒：161725',
    description: '基金代码为6位数字',
  },
};

export function AssetForm() {
  const addAsset = useAssetStore((state) => state.addAsset);
  const { addError, clearAll, clearFieldError } = useErrorStore();
  const [isOpen, setIsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isLoadingName, setIsLoadingName] = useState(false);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);

  // 表单字段错误管理
  const codeError = useFormError({
    field: 'code',
    validate: (value) => {
      if (!value || (value as string).trim() === '') {
        return '请输入资产代码';
      }
      const code = (value as string).trim();
      if (formData.type === 'a_stock' && !/^\d{6}$/.test(code)) {
        return 'A股代码应为6位数字';
      }
      if (formData.type === 'hk_stock' && !/^\d{5}$/.test(code)) {
        return '港股代码应为5位数字';
      }
      if (formData.type === 'fund' && !/^\d{6}$/.test(code)) {
        return '基金代码应为6位数字';
      }
      return null;
    },
  });

  const priceError = useFormError({
    field: 'purchasePrice',
    validate: (value) => {
      if (!value || parseFloat(value as string) <= 0) {
        return '请输入有效的购入价格';
      }
      return null;
    },
  });

  const quantityError = useFormError({
    field: 'quantity',
    validate: (value) => {
      if (!value || parseFloat(value as string) <= 0) {
        return '请输入有效的数量';
      }
      return null;
    },
  });
  const [retryCount, setRetryCount] = useState(0);
  const [formData, setFormData] = useState({
    type: 'a_stock' as AssetType,
    code: '',
    name: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    purchasePrice: '',
    quantity: '',
    currency: 'CNY' as Currency,
    useClosingPrice: false,
  });

  useEffect(() => {
    if (isOpen) {
      setFormData({
        type: 'a_stock' as AssetType,
        code: '',
        name: '',
        purchaseDate: new Date().toISOString().split('T')[0],
        purchasePrice: '',
        quantity: '',
        currency: 'CNY' as Currency,
        useClosingPrice: false,
      });
      clearAll();
      setShowHelp(false);
    }
  }, [isOpen]);

  const fetchClosingPrice = useCallback(async () => {
    // 现在不强制要求 useClosingPrice，点击按钮时尽量尝试获取价格
    if (!formData.code || !formData.purchaseDate) return;

    // 校验代码格式，格式不对直接返回，不调用API
    const code = formData.code.trim();
    if (formData.type === 'a_stock' && !/^\d{6}$/.test(code)) {
      addError('A股代码应为6位数字', 'error', 'code', 0);
      return;
    }
    if (formData.type === 'hk_stock' && !/^\d{5}$/.test(code)) {
      addError('港股代码应为5位数字', 'error', 'code', 0);
      return;
    }
    if (formData.type === 'fund' && !/^\d{6}$/.test(code)) {
      addError('基金代码应为6位数字', 'error', 'code', 0);
      return;
    }

    setIsLoadingPrice(true);
    clearFieldError('purchasePrice');
    
    try {
      if (formData.type === 'fund') {
        addError('基金请手动输入购入日净值', 'warning', 'purchasePrice', 3000);
        setIsLoadingPrice(false);
        return;
      }
      
      // 使用带fallback的函数获取收盘价
      const result = await getClosingPriceWithFallback(
        formData.code,
        formData.type as 'a_stock' | 'hk_stock',
        formData.purchaseDate,
        7  // 向前查找7天
      );
      
      if (result.price !== null) {
        setFormData(prev => ({ ...prev, purchasePrice: result.price!.toString() }));
        clearFieldError('purchasePrice');
        
        // 如果是休假日，显示提示信息
        if (result.isHoliday && result.message) {
          addError(result.message, 'info', undefined, 5000);
        }
      } else {
        throw new Error(result.message || '获取价格失败');
      }
    } catch (error: any) {
      console.error('Failed to fetch closing price:', error);
      addError(error.message || '获取价格失败，请手动输入', 'error', 'purchasePrice', 0);
      setFormData(prev => ({ ...prev, purchasePrice: '' }));
    } finally {
      setIsLoadingPrice(false);
    }
  }, [formData.useClosingPrice, formData.code, formData.purchaseDate, formData.type, addError, clearFieldError]);

  const fetchFundNavOnDate = useCallback(async () => {
    if (formData.type !== 'fund' || !formData.code || !formData.purchaseDate) return;
    try {
      setIsLoadingPrice(true);
      const navData = await (api.fund as any).getNavOnDate?.(formData.code, formData.purchaseDate);
      if (navData && typeof navData.unitNav === 'number' && typeof navData.accumulatedNav === 'number') {
        setFormData((p) => ({ 
          ...p, 
          purchasePrice: String(navData.unitNav),
        }));
        (window as any).__fundAccumulatedNav = navData.accumulatedNav;
        clearFieldError('purchasePrice');
      } else {
        addError('未找到购入日净值，请手动输入', 'error', 'purchasePrice', 0);
      }
    } catch (e) {
      console.error('Failed to fetch fund NAV on date:', e);
      addError('无法获取购入日净值，请手动输入', 'error', 'purchasePrice', 0);
    } finally {
      setIsLoadingPrice(false);
    }
  }, [formData.type, formData.code, formData.purchaseDate, addError, clearFieldError]);

  useEffect(() => {
    if (formData.useClosingPrice && formData.code && formData.purchaseDate) {
      // 校验代码格式
      const code = formData.code.trim();
      if (formData.type === 'a_stock' && !/^\d{6}$/.test(code)) {
        addError('A股代码应为6位数字', 'error', 'code', 0);
        return;
      }
      if (formData.type === 'hk_stock' && !/^\d{5}$/.test(code)) {
        addError('港股代码应为5位数字', 'error', 'code', 0);
        return;
      }
      if (formData.type === 'fund' && !/^\d{6}$/.test(code)) {
        addError('基金代码应为6位数字', 'error', 'code', 0);
        return;
      }
      fetchClosingPrice();
    }
  }, [formData.useClosingPrice, formData.code, formData.purchaseDate, retryCount]);

  useEffect(() => {
    const recognizeAssetName = async () => {
      const code = formData.code.trim();
      if (!code || formData.name) return;

      // 校验代码格式，格式不对直接返回，不调用API
      if (formData.type === 'a_stock' && !/^\d{6}$/.test(code)) {
        return;
      }
      if (formData.type === 'hk_stock' && !/^\d{5}$/.test(code)) {
        return;
      }
      if (formData.type === 'fund' && !/^\d{6}$/.test(code)) {
        return;
      }

      setIsLoadingName(true);
      try {
        let name = '';
        
        if (formData.type === 'fund') {
          const fundData = await api.fund.getQuote(code);
          if (fundData?.name) {
            name = fundData.name;
          }
        } else {
          let prefix = '';
          if (formData.type === 'a_stock') {
            prefix = code.startsWith('6') ? 'sh' : 'sz';
          } else {
            prefix = 'hk';
          }
          const quotes = await api.stock.getQuote([`${prefix}${code}`]);
          if (quotes.length > 0 && quotes[0].name) {
            name = quotes[0].name;
          }
        }

        if (name) {
          setFormData(prev => ({ ...prev, name }));
        }
      } catch (error) {
        console.error('Failed to recognize asset name:', error);
      } finally {
        setIsLoadingName(false);
      }
    };

    const timer = setTimeout(recognizeAssetName, 500);
    return () => clearTimeout(timer);
  }, [formData.code, formData.type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证所有字段
    const isCodeValid = codeError.validateField(formData.code);
    const isPriceValid = priceError.validateField(formData.purchasePrice);
    const isQuantityValid = quantityError.validateField(formData.quantity);
    
    if (!isCodeValid || !isPriceValid || !isQuantityValid) {
      addError('请检查表单中的错误信息', 'error');
      return;
    }

    const isFund = formData.type === 'fund';
    const accumulatedNav = isFund ? (window as any).__fundAccumulatedNav : undefined;

    addAsset({
      type: formData.type,
      code: formData.code,
      name: formData.name || formData.code,
      purchaseDate: formData.purchaseDate,
      purchasePrice: parseFloat(formData.purchasePrice),
      accumulatedNavAtPurchase: accumulatedNav,
      quantity: parseFloat(formData.quantity),
      currency: formData.currency,
      useClosingPrice: formData.useClosingPrice,
    });

    // 清除缓存以确保新资产数据被正确获取
    dataCache.clearAll();

    delete (window as any).__fundAccumulatedNav;

    setFormData({
      type: 'a_stock',
      code: '',
      name: '',
      purchaseDate: new Date().toISOString().split('T')[0],
      purchasePrice: '',
      quantity: '',
      currency: 'CNY',
      useClosingPrice: true,
    });
    clearAll();
    setRetryCount(0);
    setIsOpen(false);
  };

  const currentExample = CODE_EXAMPLES[formData.type];
  const isFund = formData.type === 'fund';

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-full transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
      >
        <Plus size={16} strokeWidth={2.5} />
        <span>添加资产</span>
      </button>
    );
  }

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setIsOpen(false)}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-white">添加资产</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">资产类型</label>
            <select
              value={formData.type}
              onChange={(e) => {
                const newType = e.target.value as AssetType;
                const newCurrency: Currency = newType === 'hk_stock' ? 'HKD' : 'CNY';
                setFormData({ 
                  ...formData, 
                  type: newType, 
                  code: '', 
                  name: '', 
                  currency: newCurrency,
                  useClosingPrice: false,
                  purchasePrice: '',
                });
                clearAll();
              }}
              className="w-full px-3 py-2 bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
            >
              {ASSET_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">资产代码</label>
              <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
              >
                <HelpCircle size={16} />
              </button>
            </div>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => {
                setFormData({ ...formData, code: e.target.value, name: '', purchasePrice: '' });
                codeError.clearError();
              }}
              placeholder={currentExample.placeholder}
              className="w-full px-3 py-2 bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
            />
            
            {showHelp && (
              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-300 mb-1">
                  <strong>格式说明：</strong>{currentExample.description}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  <strong>示例：</strong>{currentExample.example}
                </p>
              </div>
            )}
            
            {!showHelp && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {currentExample.description} · 
                <button
                  type="button"
                  onClick={() => setShowHelp(true)}
                  className="text-blue-600 dark:text-blue-400 hover:underline ml-1"
                >
                  查看更多示例
                </button>
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              资产名称
              {isLoadingName && (
                <span className="ml-2 inline-flex items-center text-xs text-slate-400">
                  <Loader2 size={12} className="animate-spin mr-1" />
                  识别中...
                </span>
              )}
              {formData.name && !isLoadingName && (
                <span className="ml-2 text-xs text-green-600 dark:text-green-400">✓ 已自动识别</span>
              )}
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="输入代码后自动识别"
              className="w-full px-3 py-2 bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">购入日期</label>
            <DatePicker
              selected={formData.purchaseDate ? dayjs(formData.purchaseDate).toDate() : null}
              onChange={(date: Date | null) => {
                const newDate = date ? dayjs(date).format('YYYY-MM-DD') : '';
                setFormData({ ...formData, purchaseDate: newDate, purchasePrice: '' });
                clearFieldError('purchasePrice');
              }}
              maxDate={new Date()}
              minDate={new Date('1990-01-01')}
              dateFormat="yyyy-MM-dd"
              showYearDropdown
              scrollableYearDropdown
              yearDropdownItemNumber={30}
              placeholderText="选择日期"
              locale="zh-CN"
              className="w-full px-3 py-2 bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">购入单价</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.0001"
                  value={formData.purchasePrice}
                  onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                  placeholder="请输入购入单价"
               className={`w-full px-3 py-2 bg-white dark:bg-slate-700 border-2 rounded-lg focus:outline-none focus:ring-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 ${getInputErrorClass(priceError.hasError)}`}
            />
                {isLoadingPrice && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center text-xs text-slate-400">
                    <Loader2 size={12} className="animate-spin mr-1" />
                    获取中…
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={isFund ? fetchFundNavOnDate : fetchClosingPrice}
                disabled={!formData.code || !formData.purchaseDate || isLoadingPrice}
                className="py-2 px-4 rounded-lg border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isFund ? '获取净值' : '获取收盘价'}
              </button>
            </div>

          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">数量</label>
            <input
              type="number"
              step="0.01"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              placeholder="0.00"
              className={`w-full px-3 py-2 bg-white dark:bg-slate-700 border-2 rounded-lg focus:outline-none focus:ring-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 ${getInputErrorClass(quantityError.hasError)}`}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex-1 py-2 px-4 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-700 dark:text-slate-300"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!formData.purchasePrice || isLoadingPrice}
              className="flex-1 py-2 px-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              确认添加
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
