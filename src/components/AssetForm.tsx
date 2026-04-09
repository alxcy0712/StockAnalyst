import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, HelpCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import dayjs from 'dayjs';
import zhCN from 'dayjs/locale/zh-cn';
import { useAssetStore } from '../stores/assetStore';
import { useErrorStore } from '../stores/errorStore';
import { useFormError, getInputErrorClass } from '../hooks/useFormError';
import { api } from '../api';
import { getDualClosingPriceWithFallback, type DualPriceResult } from '../utils/priceFallback';
import { dataCache } from '../utils/dataCache';
import type { AssetType, Currency } from '../types';

dayjs.locale(zhCN);

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'a_stock', label: 'A股' },
  { value: 'hk_stock', label: '港股' },
  { value: 'fund', label: '基金' },
];

// Apple 缓动函数 [0.4, 0, 0.2, 1] - easeOut
const appleEasing: [number, number, number, number] = [0.4, 0, 0.2, 1];
const appleEasingExit: [number, number, number, number] = [0.4, 0, 1, 1];

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

const modalOverlayVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { duration: 0.2, ease: appleEasing }
  },
  exit: { 
    opacity: 0,
    transition: { duration: 0.15, ease: appleEasingExit }
  }
};

const modalContentVariants = {
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
      ease: appleEasing
    }
  },
  exit: { 
    opacity: 0, 
    scale: 0.98,
    y: 10,
    transition: { 
      duration: 0.2, 
      ease: appleEasingExit
    }
  }
};

const helpPanelVariants = {
  hidden: { 
    opacity: 0, 
    height: 0,
    marginTop: 0
  },
  visible: { 
    opacity: 1, 
    height: 'auto',
    marginTop: 8,
    transition: { 
      duration: 0.25, 
      ease: appleEasing
    }
  },
  exit: { 
    opacity: 0, 
    height: 0,
    marginTop: 0,
    transition: { 
      duration: 0.2, 
      ease: appleEasingExit
    }
  }
};

export function AssetForm() {
  const addAsset = useAssetStore((state) => state.addAsset);
  const { addError, clearAll, clearFieldError } = useErrorStore();
  const [isOpen, setIsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isLoadingName, setIsLoadingName] = useState(false);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);

  const [priceInputMode, setPriceInputMode] = useState<'raw' | 'adjusted'>('raw');

  const [dualPrice, setDualPrice] = useState<{
    data: DualPriceResult | null;
    isLoading: boolean;
    selectedType: 'raw' | 'adjusted' | null;
  }>({ data: null, isLoading: false, selectedType: null });

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
      setPriceInputMode('raw');
      setDualPrice({ data: null, isLoading: false, selectedType: null });
      clearAll();
      setShowHelp(false);
    }
  }, [isOpen, clearAll]);

  const fetchClosingPrice = useCallback(async () => {
    if (!formData.code || !formData.purchaseDate) return;

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
    setDualPrice(prev => ({ ...prev, isLoading: true }));
    clearFieldError('purchasePrice');

    try {
      if (formData.type === 'fund') {
        addError('基金请手动输入购入日净值', 'warning', 'purchasePrice', 3000);
        setIsLoadingPrice(false);
        setDualPrice(prev => ({ ...prev, isLoading: false }));
        return;
      }

      const result = await getDualClosingPriceWithFallback(
        formData.code,
        formData.type as 'a_stock' | 'hk_stock',
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
        clearFieldError('purchasePrice');

        if (result.preAdjusted.isHoliday && result.preAdjusted.message) {
          addError(result.preAdjusted.message, 'info', undefined, 5000);
        }
      } else {
        throw new Error(result.preAdjusted.message || '获取价格失败');
      }
    } catch (error: any) {
      console.error('Failed to fetch closing price:', error);
      addError(error.message || '获取价格失败，请手动输入', 'error', 'purchasePrice', 0);
      setFormData(prev => ({ ...prev, purchasePrice: '' }));
      setDualPrice({ data: null, isLoading: false, selectedType: null });
    } finally {
      setIsLoadingPrice(false);
    }
  }, [formData.code, formData.purchaseDate, formData.type, addError, clearFieldError]);

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
  }, [formData.useClosingPrice, formData.code, formData.purchaseDate, formData.type, addError, fetchClosingPrice]);

  useEffect(() => {
    const recognizeAssetName = async () => {
      const code = formData.code.trim();
      if (!code || formData.name) return;

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
  }, [formData.code, formData.type, formData.name]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const isCodeValid = codeError.validateField(formData.code);
    const isPriceValid = priceError.validateField(formData.purchasePrice);
    const isQuantityValid = quantityError.validateField(formData.quantity);

    if (!isCodeValid || !isPriceValid || !isQuantityValid) {
      addError('请检查表单中的错误信息', 'error');
      return;
    }

    const isFund = formData.type === 'fund';
    const accumulatedNav = isFund ? (window as any).__fundAccumulatedNav : undefined;

    const isStock = formData.type === 'a_stock' || formData.type === 'hk_stock';

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
      priceInputType: isStock ? (dualPrice.data ? 'adjusted' : priceInputMode) : undefined,
      purchasePriceRaw: isStock && dualPrice.data?.raw.price !== null ? dualPrice.data?.raw.price : undefined,
      purchasePriceAdjusted: isStock && dualPrice.data?.preAdjusted.price !== null ? dualPrice.data?.preAdjusted.price : undefined,
    });

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
    setPriceInputMode('raw');
    setDualPrice({ data: null, isLoading: false, selectedType: null });
    clearAll();
    setIsOpen(false);
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

  const currentExample = CODE_EXAMPLES[formData.type];
  const isFund = formData.type === 'fund';

  // 输入框通用样式
  const inputBaseClass = `w-full px-3 py-2 bg-white dark:bg-[#1c1c1e] border border-[#d2d2d7] dark:border-[#424245] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-[#1d1d1f] dark:text-white placeholder-[#86868b] dark:placeholder-[#8e8e93] transition-all duration-200`;
  
  // 选择框样式
  const selectBaseClass = `w-full px-3 py-2 bg-white dark:bg-[#1c1c1e] border border-[#d2d2d7] dark:border-[#424245] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-[#1d1d1f] dark:text-white transition-all duration-200`;

  return (
    <>
      <motion.button
        onClick={() => setIsOpen(true)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-all duration-200 shadow-sm"
      >
        <Plus size={16} strokeWidth={2.5} />
        <span>添加资产</span>
      </motion.button>

      {isOpen && createPortal(
        <AnimatePresence>
          <motion.div
            className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
            variants={modalOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              className="bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto border border-[#d2d2d7]/50 dark:border-[#424245]/50"
              variants={modalContentVariants}
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-xl font-semibold mb-5 text-[#1d1d1f] dark:text-white">添加资产</h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#424245] dark:text-[#a1a1a6] mb-1.5">资产类型</label>
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
                    className={selectBaseClass}
                  >
                    {ASSET_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-sm font-medium text-[#424245] dark:text-[#a1a1a6]">资产代码</label>
                    <motion.button
                      type="button"
                      onClick={() => setShowHelp(!showHelp)}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      className="text-[#86868b] dark:text-[#8e8e93] hover:text-[#424245] dark:hover:text-[#a1a1a6] transition-colors"
                    >
                      <HelpCircle size={16} />
                    </motion.button>
                  </div>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => {
                      setFormData({ ...formData, code: e.target.value, name: '', purchasePrice: '' });
                      codeError.clearError();
                    }}
                    placeholder={currentExample.placeholder}
                    className={inputBaseClass}
                  />
                  
                  <AnimatePresence>
                    {showHelp && (
                      <motion.div 
                        className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg overflow-hidden"
                        variants={helpPanelVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                      >
                        <p className="text-sm text-[#1d1d1f] dark:text-white mb-1">
                          <strong>格式说明：</strong>{currentExample.description}
                        </p>
                        <p className="text-xs text-[#424245] dark:text-[#a1a1a6]">
                          <strong>示例：</strong>{currentExample.example}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  {!showHelp && (
                    <p className="mt-1.5 text-xs text-[#86868b] dark:text-[#8e8e93]">
                      {currentExample.description} · 
                      <button
                        type="button"
                        onClick={() => setShowHelp(true)}
                        className="text-[#424245] dark:text-[#a1a1a6] hover:underline ml-1 transition-colors"
                      >
                        查看更多示例
                      </button>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#424245] dark:text-[#a1a1a6] mb-1.5">
                    资产名称
                    {isLoadingName && (
                      <span className="ml-2 inline-flex items-center text-xs text-[#86868b] dark:text-[#8e8e93]">
                        <Loader2 size={12} className="animate-spin mr-1" />
                        识别中...
                      </span>
                    )}
                    {formData.name && !isLoadingName && (
                      <span className="ml-2 text-xs text-[#34c759]">✓ 已自动识别</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="输入代码后自动识别"
                    className={inputBaseClass}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#424245] dark:text-[#a1a1a6] mb-1.5">购入日期</label>
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
                    className={inputBaseClass}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#424245] dark:text-[#a1a1a6] mb-1.5">购入单价</label>

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
                        className={`${inputBaseClass} ${getInputErrorClass(priceError.hasError)}`}
                      />
                      {isLoadingPrice && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center text-xs text-[#86868b] dark:text-[#8e8e93]">
                          <Loader2 size={12} className="animate-spin mr-1" />
                          获取中…
                        </span>
                      )}
                    </div>
                    <motion.button
                      type="button"
                      onClick={isFund ? fetchFundNavOnDate : fetchClosingPrice}
                      disabled={!formData.code || !formData.purchaseDate || isLoadingPrice || (!isFund && priceInputMode === 'adjusted')}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="py-2 px-4 rounded-lg border border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap text-sm"
                    >
                      {isFund ? '获取净值' : '获取收盘价'}
                    </motion.button>
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
                  <label className="block text-sm font-medium text-[#424245] dark:text-[#a1a1a6] mb-1.5">数量</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    placeholder="0.00"
                    className={`${inputBaseClass} ${getInputErrorClass(quantityError.hasError)}`}
                  />
                </div>

                <div className="flex gap-3 pt-5">
                  <motion.button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 py-2.5 px-4 border border-[#d2d2d7] dark:border-[#424245] rounded-lg hover:bg-[#f5f5f7] dark:hover:bg-[#2c2c2e] transition-colors text-[#1d1d1f] dark:text-white font-medium"
                  >
                    取消
                  </motion.button>
                  <motion.button
                    type="submit"
                    disabled={!formData.purchasePrice || isLoadingPrice}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 py-2.5 px-4 bg-[#1d1d1f] hover:bg-[#2a2a2e] dark:bg-white dark:hover:bg-gray-100 text-white dark:text-[#1d1d1f] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                  >
                    确认添加
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
