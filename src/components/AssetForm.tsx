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

const CODE_PATTERNS: Record<AssetType, RegExp> = {
  a_stock: /^\d{6}$/,
  hk_stock: /^\d{5}$/,
  fund: /^\d{6}$/,
};

const CODE_ERROR_MESSAGES: Record<AssetType, string> = {
  a_stock: 'A股代码应为6位数字',
  hk_stock: '港股代码应为5位数字',
  fund: '基金代码应为6位数字',
};

const modalOverlayVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2, ease: appleEasing },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15, ease: appleEasingExit },
  },
};

const modalContentVariants = {
  hidden: {
    opacity: 0,
    scale: 0.98,
    y: 10,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.32,
      ease: appleEasing,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 10,
    transition: {
      duration: 0.2,
      ease: appleEasingExit,
    },
  },
};

const helpPanelVariants = {
  hidden: {
    opacity: 0,
    height: 0,
    marginTop: 0,
  },
  visible: {
    opacity: 1,
    height: 'auto',
    marginTop: 8,
    transition: {
      duration: 0.25,
      ease: appleEasing,
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    marginTop: 0,
    transition: {
      duration: 0.2,
      ease: appleEasingExit,
    },
  },
};

type StockHistoryValidation =
  | { status: 'idle' | 'checking' | 'valid'; message: null }
  | { status: 'invalid' | 'retryable_error'; message: string };

function isStockAssetType(type: AssetType): type is 'a_stock' | 'hk_stock' {
  return type === 'a_stock' || type === 'hk_stock';
}

function hasCompleteCode(type: AssetType, code: string): boolean {
  return CODE_PATTERNS[type].test(code.trim());
}

function getCodeErrorMessage(type: AssetType): string {
  return CODE_ERROR_MESSAGES[type];
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function AssetForm() {
  const addAsset = useAssetStore((state) => state.addAsset);
  const { addError, clearAll, clearFieldError } = useErrorStore();
  const [isOpen, setIsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isLoadingName, setIsLoadingName] = useState(false);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [stockHistoryValidation, setStockHistoryValidation] = useState<StockHistoryValidation>({
    status: 'idle',
    message: null,
  });
  const [validationRetryToken, setValidationRetryToken] = useState(0);

  const [priceInputMode, setPriceInputMode] = useState<'raw' | 'adjusted'>('raw');
  const [dualPrice, setDualPrice] = useState<DualPriceResult | null>(null);

  const codeError = useFormError({
    field: 'code',
    validate: (value) => {
      if (!value || (value as string).trim() === '') {
        return '请输入资产代码';
      }
      const code = (value as string).trim();
      if (!hasCompleteCode(formData.type, code)) {
        return getCodeErrorMessage(formData.type);
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
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setFormData({
      type: 'a_stock',
      code: '',
      name: '',
      purchaseDate: new Date().toISOString().split('T')[0],
      purchasePrice: '',
      quantity: '',
      currency: 'CNY',
    });
    setPriceInputMode('raw');
    setDualPrice(null);
    setStockHistoryValidation({ status: 'idle', message: null });
    setValidationRetryToken(0);
    clearAll();
    setShowHelp(false);
  }, [isOpen, clearAll]);

  const fetchClosingPrice = useCallback(async () => {
    if (!formData.code || !formData.purchaseDate) {
      return;
    }

    const code = formData.code.trim();
    if (!hasCompleteCode(formData.type, code)) {
      addError(getCodeErrorMessage(formData.type), 'error', 'code');
      return;
    }

    setIsLoadingPrice(true);
    clearFieldError('purchasePrice');

    try {
      if (formData.type === 'fund') {
        addError('基金请手动输入购入日净值', 'warning', 'purchasePrice', 3000);
        return;
      }

      const result = await getDualClosingPriceWithFallback(
        formData.code,
        formData.type,
        formData.purchaseDate,
        7
      );

      setDualPrice(result);

      if (result.preAdjusted.price !== null) {
        setFormData((prev) => ({ ...prev, purchasePrice: result.preAdjusted.price!.toString() }));
        clearFieldError('purchasePrice');

        if (result.preAdjusted.isHoliday && result.preAdjusted.message) {
          addError(result.preAdjusted.message, 'info', undefined, 5000);
        }
        return;
      }

      throw new Error(result.preAdjusted.message || '获取价格失败');
    } catch (error: unknown) {
      console.error('Failed to fetch closing price:', error);
      addError(getErrorMessage(error, '获取价格失败，请手动输入'), 'error', 'purchasePrice');
      setFormData((prev) => ({ ...prev, purchasePrice: '' }));
      setDualPrice(null);
    } finally {
      setIsLoadingPrice(false);
    }
  }, [formData.code, formData.purchaseDate, formData.type, addError, clearFieldError]);

  const fetchFundNavOnDate = useCallback(async () => {
    if (formData.type !== 'fund' || !formData.code || !formData.purchaseDate) {
      return;
    }

    try {
      setIsLoadingPrice(true);
      const navData = await api.fund.getNavOnDate(formData.code, formData.purchaseDate);

      if (navData && typeof navData.unitNav === 'number' && typeof navData.accumulatedNav === 'number') {
        setFormData((prev) => ({
          ...prev,
          purchasePrice: String(navData.unitNav),
        }));
        window.__fundAccumulatedNav = navData.accumulatedNav;
        clearFieldError('purchasePrice');
        return;
      }

      addError('未找到购入日净值，请手动输入', 'error', 'purchasePrice');
    } catch (error: unknown) {
      console.error('Failed to fetch fund NAV on date:', error);
      addError('无法获取购入日净值，请手动输入', 'error', 'purchasePrice');
    } finally {
      setIsLoadingPrice(false);
    }
  }, [formData.type, formData.code, formData.purchaseDate, addError, clearFieldError]);

  const retryStockValidation = useCallback(() => {
    const code = formData.code.trim();
    if (!isStockAssetType(formData.type) || !hasCompleteCode(formData.type, code)) {
      addError(getCodeErrorMessage(formData.type), 'error', 'code');
      return;
    }

    clearFieldError('code');
    setIsLoadingName(true);
    setStockHistoryValidation({ status: 'checking', message: null });
    setValidationRetryToken((current) => current + 1);
  }, [formData.code, formData.type, addError, clearFieldError]);

  useEffect(() => {
    const code = formData.code.trim();
    if (!code || !hasCompleteCode(formData.type, code)) {
      setIsLoadingName(false);
      setStockHistoryValidation({ status: 'idle', message: null });
      return;
    }

    let cancelled = false;
    const currentType = formData.type;

    const recognizeAssetName = async () => {
      setIsLoadingName(true);
      clearFieldError('code');
      setStockHistoryValidation(
        isStockAssetType(currentType)
          ? { status: 'checking', message: null }
          : { status: 'idle', message: null }
      );

      try {
        let name = '';

        if (currentType === 'fund') {
          const fundData = await api.fund.getQuote(code);
          if (fundData?.name) {
            name = fundData.name;
          }
        } else {
          const prefix = currentType === 'a_stock'
            ? code.startsWith('6') ? 'sh' : 'sz'
            : 'hk';
          const quotes = await api.stock.getQuote([`${prefix}${code}`]);
          if (quotes.length > 0 && quotes[0].name) {
            name = quotes[0].name;
          }
        }

        if (cancelled) {
          return;
        }

        if (name) {
          setFormData((prev) => {
            if (prev.type !== currentType || prev.code.trim() !== code) {
              return prev;
            }
            if (prev.name.trim() && prev.name !== name) {
              return prev;
            }
            return prev.name === name ? prev : { ...prev, name };
          });
        }

        if (!isStockAssetType(currentType)) {
          return;
        }

        const validationResult = await api.stock.validateCode(currentType, code);
        if (cancelled) {
          return;
        }

        if (validationResult.valid) {
          setStockHistoryValidation({ status: 'valid', message: null });
          clearFieldError('code');

          const validatedName = validationResult.name;
          if (!name && validatedName) {
            setFormData((prev) => {
              if (prev.type !== currentType || prev.code.trim() !== code) {
                return prev;
              }
              if (prev.name.trim() && prev.name !== validatedName) {
                return prev;
              }
              return prev.name === validatedName
                ? prev
                : { ...prev, name: validatedName };
            });
          }
          return;
        }

        const message = validationResult.message || '数据库中没有该资产的历史数据';
        setStockHistoryValidation({ status: 'invalid', message });
        addError(message, 'error', 'code');
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        console.error('Failed to recognize asset name:', error);
        if (isStockAssetType(currentType)) {
          setStockHistoryValidation({
            status: 'retryable_error',
            message: getErrorMessage(error, '校验服务暂时不可用，请重新校验'),
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingName(false);
        }
      }
    };

    const timer = window.setTimeout(recognizeAssetName, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [formData.code, formData.type, validationRetryToken, addError, clearFieldError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isCodeValid = codeError.validateField(formData.code);
    const isPriceValid = priceError.validateField(formData.purchasePrice);
    const isQuantityValid = quantityError.validateField(formData.quantity);

    if (!isCodeValid || !isPriceValid || !isQuantityValid) {
      addError('请检查表单中的错误信息', 'error');
      return;
    }

    const isStock = isStockAssetType(formData.type);
    if (isStock && stockHistoryValidation.status !== 'valid') {
      const message = stockHistoryValidation.status === 'invalid' || stockHistoryValidation.status === 'retryable_error'
        ? stockHistoryValidation.message
        : '正在校验数据库历史数据，请稍候';
      addError(
        message,
        'error',
        'code'
      );
      return;
    }

    const isFund = formData.type === 'fund';
    const accumulatedNav = isFund ? window.__fundAccumulatedNav : undefined;

    addAsset({
      type: formData.type,
      code: formData.code,
      name: formData.name || formData.code,
      purchaseDate: formData.purchaseDate,
      purchasePrice: parseFloat(formData.purchasePrice),
      accumulatedNavAtPurchase: accumulatedNav,
      quantity: parseFloat(formData.quantity),
      currency: formData.currency,
      priceInputType: isStock ? (dualPrice ? 'adjusted' : priceInputMode) : undefined,
      purchasePriceRaw: isStock && dualPrice?.raw.price !== null ? dualPrice?.raw.price : undefined,
      purchasePriceAdjusted: isStock && dualPrice?.preAdjusted.price !== null ? dualPrice?.preAdjusted.price : undefined,
    });

    dataCache.clearAll();
    delete window.__fundAccumulatedNav;

    setFormData({
      type: 'a_stock',
      code: '',
      name: '',
      purchaseDate: new Date().toISOString().split('T')[0],
      purchasePrice: '',
      quantity: '',
      currency: 'CNY',
    });
    setPriceInputMode('raw');
    setDualPrice(null);
    setStockHistoryValidation({ status: 'idle', message: null });
    clearAll();
    setIsOpen(false);
  };

  const isNegativePrice = (price: number | null): boolean => {
    if (price === null) {
      return false;
    }
    return price <= 0 || price < 0.01;
  };

  const formatPrice = (price: number | null): string => {
    if (price === null) {
      return '--';
    }
    if (price <= 0) {
      return '≤ 0';
    }
    return price.toFixed(2);
  };

  const currentExample = CODE_EXAMPLES[formData.type];
  const isFund = formData.type === 'fund';
  const isSubmitDisabled = !formData.purchasePrice || isLoadingPrice || (
    isStockAssetType(formData.type) &&
    (
      stockHistoryValidation.status === 'checking' ||
      stockHistoryValidation.status === 'invalid' ||
      stockHistoryValidation.status === 'retryable_error'
    )
  );

  const inputBaseClass = 'w-full px-3 py-2 bg-white dark:bg-[#1c1c1e] border border-[#d2d2d7] dark:border-[#424245] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-[#1d1d1f] dark:text-white placeholder-[#86868b] dark:placeholder-[#8e8e93] transition-all duration-200';
  const selectBaseClass = 'w-full px-3 py-2 bg-white dark:bg-[#1c1c1e] border border-[#d2d2d7] dark:border-[#424245] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-[#1d1d1f] dark:text-white transition-all duration-200';

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
              onClick={(e) => e.stopPropagation()}
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
                        purchasePrice: '',
                      });
                      setDualPrice(null);
                      setStockHistoryValidation({ status: 'idle', message: null });
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
                      setDualPrice(null);
                      setStockHistoryValidation({ status: 'idle', message: null });
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

                  {stockHistoryValidation.status === 'checking' && (
                    <p className="mt-1.5 text-xs text-[#86868b] dark:text-[#8e8e93]">
                      正在校验数据库历史数据...
                    </p>
                  )}

                  {stockHistoryValidation.status === 'invalid' && (
                    <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">
                      {stockHistoryValidation.message}
                    </p>
                  )}

                  {stockHistoryValidation.status === 'retryable_error' && (
                    <div className="mt-1.5 flex items-center justify-between gap-3">
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {stockHistoryValidation.message}
                      </p>
                      <button
                        type="button"
                        onClick={retryStockValidation}
                        className="shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        重新校验
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#424245] dark:text-[#a1a1a6] mb-1.5">
                    资产名称
                    {isLoadingName && (
                      <span className="ml-2 inline-flex items-center text-xs text-[#86868b] dark:text-[#8e8e93]">
                        <Loader2 size={12} className="animate-spin mr-1" />
                        {isStockAssetType(formData.type) ? '识别与校验中...' : '识别中...'}
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
                            setDualPrice(null);
                            setFormData((prev) => ({ ...prev, purchasePrice: '' }));
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
                            setDualPrice(null);
                            setFormData((prev) => ({ ...prev, purchasePrice: '' }));
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
                          if (dualPrice) {
                            setDualPrice(null);
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

                  {!isFund && dualPrice && (
                    <div className="mt-2 p-2 bg-[#f5f5f7] dark:bg-[#2c2c2e] rounded-lg border border-[#d2d2d7] dark:border-[#424245]">
                      <div className="flex items-center justify-between text-xs text-[#86868b] dark:text-[#8e8e93]">
                        <span>{formData.purchaseDate} 收盘价：前复权 ¥{formatPrice(dualPrice.preAdjusted.price)}</span>
                        <span>除权价 ¥{formatPrice(dualPrice.raw.price)}（当时实际价格）</span>
                      </div>
                      {isNegativePrice(dualPrice.preAdjusted.price) && (
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
                    disabled={isSubmitDisabled}
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
