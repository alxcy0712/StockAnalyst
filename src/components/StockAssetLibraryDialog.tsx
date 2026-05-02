import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Database,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api';
import { useErrorStore } from '../stores/errorStore';
import type { DatabaseStock, StockMarket } from '../types';

const appleEasing: [number, number, number, number] = [0.4, 0, 0.2, 1];
const appleEasingExit: [number, number, number, number] = [0.4, 0, 1, 1];

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

const CODE_PATTERNS: Record<StockMarket, RegExp> = {
  a_stock: /^\d{6}$/,
  hk_stock: /^\d{1,5}$/,
};

const CODE_HINTS: Record<StockMarket, string> = {
  a_stock: '6位数字',
  hk_stock: '1-5位数字',
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatRowCount(value: number): string {
  return value.toLocaleString('zh-CN');
}

function normalizeLatestDate(value: string | null): string {
  return value || '暂无数据';
}

function sortStocks(stocks: DatabaseStock[]): DatabaseStock[] {
  return [...stocks].sort((left, right) => {
    const leftDate = left.latestTradeDate || '';
    const rightDate = right.latestTradeDate || '';
    if (leftDate !== rightDate) {
      return rightDate.localeCompare(leftDate);
    }
    return left.code.localeCompare(right.code);
  });
}

function buildQuoteCode(market: StockMarket, code: string): string {
  if (market === 'hk_stock') {
    return `hk${code.padStart(5, '0')}`;
  }

  return `${code.startsWith('6') ? 'sh' : 'sz'}${code}`;
}

export function StockAssetLibraryDialog() {
  const addError = useErrorStore((state) => state.addError);
  const [isOpen, setIsOpen] = useState(false);
  const [stocks, setStocks] = useState<DatabaseStock[]>([]);
  const [market, setMarket] = useState<StockMarket>('a_stock');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isLoadingName, setIsLoadingName] = useState(false);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [refreshConfirmation, setRefreshConfirmation] = useState<DatabaseStock | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStocks = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = await api.stock.listDatabaseStocks();
      setStocks(payload.stocks);
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError, '获取资产库失败'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setMessage(null);
    setError(null);
    loadStocks();
  }, [isOpen, loadStocks]);

  useEffect(() => {
    const trimmedCode = code.trim();
    if (!isOpen || !CODE_PATTERNS[market].test(trimmedCode)) {
      setIsLoadingName(false);
      return;
    }

    let cancelled = false;
    setIsLoadingName(true);

    const timer = window.setTimeout(async () => {
      try {
        const quotes = await api.stock.getQuote([buildQuoteCode(market, trimmedCode)]);
        if (!cancelled && quotes[0]?.name) {
          setName(quotes[0].name);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingName(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, isOpen, market]);

  const filteredStocks = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const sorted = sortStocks(stocks);
    if (!keyword) {
      return sorted;
    }

    return sorted.filter((stock) => {
      return stock.code.toLowerCase().includes(keyword)
        || stock.name.toLowerCase().includes(keyword)
        || stock.currency.toLowerCase().includes(keyword);
    });
  }, [query, stocks]);

  const latestDate = useMemo(() => {
    return stocks.reduce<string | null>((latest, stock) => {
      if (!stock.latestTradeDate) {
        return latest;
      }
      if (!latest || stock.latestTradeDate > latest) {
        return stock.latestTradeDate;
      }
      return latest;
    }, null);
  }, [stocks]);

  const totalRows = useMemo(() => {
    return stocks.reduce((sum, stock) => sum + stock.rowCount, 0);
  }, [stocks]);

  const validateCode = () => {
    const trimmedCode = code.trim();
    if (!CODE_PATTERNS[market].test(trimmedCode)) {
      setError(`股票代码应为${CODE_HINTS[market]}`);
      return null;
    }
    return trimmedCode;
  };

  const handleImport = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedCode = validateCode();
    if (!trimmedCode) {
      return;
    }

    const trimmedName = name.trim();
    setBusyAction('import');
    setError(null);
    setMessage(null);

    try {
      await api.stock.importDatabaseStock({
        market,
        code: trimmedCode,
        name: trimmedName || undefined,
        mode: 'backfill',
      });
      setCode('');
      setName('');
      setMessage('已添加并拉取历史数据');
      await loadStocks();
    } catch (importError: unknown) {
      setError(getErrorMessage(importError, '导入资产失败'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleRefreshAll = async () => {
    setBusyAction('refresh-all');
    setError(null);
    setMessage(null);

    try {
      await api.stock.refreshDatabaseStocks();
      addError('已更新资产库数据', 'info', undefined, 4000);
      await loadStocks();
    } catch (refreshError: unknown) {
      setError(getErrorMessage(refreshError, '更新资产库失败'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleRefreshOne = async (stock: DatabaseStock) => {
    setBusyAction(`refresh:${stock.id}`);
    setError(null);
    setMessage(null);

    try {
      await api.stock.refreshDatabaseStocks([stock.id]);
      addError(`已更新 ${stock.name}`, 'info', undefined, 4000);
      await loadStocks();
    } catch (refreshError: unknown) {
      setError(getErrorMessage(refreshError, `更新 ${stock.name} 失败`));
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async (stock: DatabaseStock) => {
    const confirmed = window.confirm(`删除 ${stock.name} 及其全部历史行情数据？`);
    if (!confirmed) {
      return;
    }

    setBusyAction(`delete:${stock.id}`);
    setError(null);
    setMessage(null);

    try {
      await api.stock.deleteDatabaseStock(stock.id);
      setMessage(`已删除 ${stock.name}`);
      await loadStocks();
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError, `删除 ${stock.name} 失败`));
    } finally {
      setBusyAction(null);
    }
  };

  const isBusy = busyAction !== null;

  return (
    <>
      <motion.button
        onClick={() => setIsOpen(true)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="h-10 flex items-center gap-1.5 px-3 sm:px-4 bg-white/80 dark:bg-[#2c2c2e]/80 text-[#424245] dark:text-[#e5e5e5] hover:bg-gray-100 dark:hover:bg-gray-800 text-sm font-medium rounded-full transition-all duration-200 border border-gray-200/70 dark:border-gray-700/60 shadow-sm"
        aria-label="资产库"
      >
        <Database size={16} strokeWidth={2.2} />
        <span className="hidden sm:inline">资产库</span>
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
              className="bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-hidden border border-[#d2d2d7]/50 dark:border-[#424245]/50"
              variants={modalContentVariants}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-200/70 dark:border-gray-800/80">
                <div>
                  <h2 className="text-xl font-semibold text-[#1d1d1f] dark:text-white tracking-tight">资产库</h2>
                  <p className="text-sm text-[#86868b] dark:text-[#8e8e93] mt-1">
                    查看、添加、删除并更新数据库股票
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-10 h-10 inline-flex items-center justify-center rounded-full text-[#86868b] hover:text-[#1d1d1f] hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-white transition-colors"
                  aria-label="关闭资产库"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-97px)]">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-[#f5f5f7] dark:bg-[#2c2c2e]/60 p-3">
                    <p className="text-[11px] text-[#86868b] dark:text-[#8e8e93] mb-1">股票数</p>
                    <p className="text-lg font-semibold text-[#1d1d1f] dark:text-white">{stocks.length}</p>
                  </div>
                  <div className="rounded-xl bg-[#f5f5f7] dark:bg-[#2c2c2e]/60 p-3">
                    <p className="text-[11px] text-[#86868b] dark:text-[#8e8e93] mb-1">行情行数</p>
                    <p className="text-lg font-semibold text-[#1d1d1f] dark:text-white">{formatRowCount(totalRows)}</p>
                  </div>
                  <div className="rounded-xl bg-[#f5f5f7] dark:bg-[#2c2c2e]/60 p-3">
                    <p className="text-[11px] text-[#86868b] dark:text-[#8e8e93] mb-1">最新日期</p>
                    <p className="text-lg font-semibold text-[#1d1d1f] dark:text-white">{normalizeLatestDate(latestDate)}</p>
                  </div>
                </div>

                <form
                  onSubmit={handleImport}
                  className="grid grid-cols-1 md:grid-cols-[120px_1fr_1fr_auto] gap-3 items-end"
                >
                  <div>
                    <label htmlFor="stock-library-market" className="block text-xs font-medium text-[#424245] dark:text-[#a1a1a6] mb-1.5">
                      市场
                    </label>
                    <select
                      id="stock-library-market"
                      value={market}
      onChange={(event) => {
        setMarket(event.target.value as StockMarket);
        setCode('');
        setName('');
        setError(null);
      }}
                      className="w-full h-10 px-3 bg-white dark:bg-[#1c1c1e] border border-[#d2d2d7] dark:border-[#424245] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-[#1d1d1f] dark:text-white text-sm"
                    >
                      <option value="a_stock">A股</option>
                      <option value="hk_stock">港股</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="stock-library-code" className="block text-xs font-medium text-[#424245] dark:text-[#a1a1a6] mb-1.5">
                      股票代码
                    </label>
                    <input
                      id="stock-library-code"
                      value={code}
                      onChange={(event) => {
                        setCode(event.target.value);
                        setName('');
                        setError(null);
                      }}
                      placeholder={market === 'a_stock' ? '600519' : '00700'}
                      className="w-full h-10 px-3 bg-white dark:bg-[#1c1c1e] border border-[#d2d2d7] dark:border-[#424245] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-[#1d1d1f] dark:text-white placeholder-[#86868b] text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="stock-library-name" className="block text-xs font-medium text-[#424245] dark:text-[#a1a1a6] mb-1.5">
                      股票名称
                    </label>
                    <input
                      id="stock-library-name"
                      value={name}
                      readOnly
                      placeholder={isLoadingName ? '正在自动获取' : '自动获取'}
                      className="w-full h-10 px-3 bg-[#f5f5f7] dark:bg-[#2c2c2e]/60 border border-[#d2d2d7] dark:border-[#424245] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-[#1d1d1f] dark:text-white placeholder-[#86868b] text-sm cursor-default"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isBusy}
                    className="h-10 px-4 inline-flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                  >
                    {busyAction === 'import' ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Plus size={16} />
                    )}
                    添加并拉取
                  </button>
                </form>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="搜索代码、名称或币种"
                      className="w-full h-10 pl-9 pr-3 bg-[#f5f5f7] dark:bg-[#2c2c2e]/60 border border-transparent focus:border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[#1d1d1f] dark:text-white placeholder-[#86868b] text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRefreshAll}
                    disabled={isBusy || stocks.length === 0}
                    className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 text-[#424245] dark:text-[#e5e5e5] hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors text-sm font-medium whitespace-nowrap"
                  >
                    <RefreshCw size={16} className={busyAction === 'refresh-all' ? 'animate-spin' : ''} />
                    更新全部
                  </button>
                </div>

                {(error || message) && (
                  <div
                    className={`rounded-lg px-3 py-2 text-sm ${
                      error
                        ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                        : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                    }`}
                  >
                    {error || message}
                  </div>
                )}

                <div className="border border-gray-200/80 dark:border-gray-800 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[1fr_110px_100px_96px] gap-3 px-4 py-2 bg-[#f5f5f7] dark:bg-[#2c2c2e]/60 text-[11px] font-medium text-[#86868b] dark:text-[#8e8e93]">
                    <span>股票</span>
                    <span>最新日期</span>
                    <span>行数</span>
                    <span className="text-right">操作</span>
                  </div>

                  <div className="max-h-[320px] overflow-y-auto" aria-label="数据库资产列表">
                    {isLoading ? (
                      <div className="h-32 flex items-center justify-center text-[#86868b]">
                        <Loader2 size={20} className="animate-spin mr-2" />
                        加载资产库
                      </div>
                    ) : filteredStocks.length === 0 ? (
                      <div className="h-32 flex items-center justify-center text-sm text-[#86868b] dark:text-[#8e8e93]">
                        暂无数据库股票
                      </div>
                    ) : (
                      filteredStocks.map((stock) => (
                        <div
                          key={stock.id}
                          className="grid grid-cols-[1fr_110px_100px_96px] gap-3 items-center px-4 py-3 border-t border-gray-100 dark:border-gray-800/80 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-[#1d1d1f] dark:text-white truncate">{stock.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-xs text-[#86868b] dark:text-[#8e8e93]">{stock.code}</span>
                              <span className="text-[11px] text-blue-600 dark:text-blue-400">{stock.currency}</span>
                            </div>
                          </div>
                          <span className="text-xs text-[#424245] dark:text-[#d1d1d6]">{normalizeLatestDate(stock.latestTradeDate)}</span>
                          <span className="text-xs text-[#424245] dark:text-[#d1d1d6]">{formatRowCount(stock.rowCount)}</span>
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setRefreshConfirmation(stock)}
                              disabled={isBusy}
                              className="w-10 h-10 inline-flex items-center justify-center rounded-xl text-[#86868b] hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 transition-colors"
                              aria-label={`更新 ${stock.name}`}
                              title="拉取最新数据"
                            >
                              <RefreshCw size={15} className={busyAction === `refresh:${stock.id}` ? 'animate-spin' : ''} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(stock)}
                              disabled={isBusy}
                              className="w-10 h-10 inline-flex items-center justify-center rounded-xl text-[#86868b] hover:text-[#ff3b30] hover:bg-[#ff3b30]/10 dark:hover:bg-[#ff453a]/15 disabled:opacity-50 transition-colors"
                              aria-label={`删除 ${stock.name}`}
                              title="删除资产和行情数据"
                            >
                              {busyAction === `delete:${stock.id}` ? (
                                <Loader2 size={15} className="animate-spin" />
                              ) : (
                                <Trash2 size={15} />
                              )}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
              {refreshConfirmation && (
                <div className="fixed inset-0 z-[120] bg-black/35 dark:bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: 8 }}
                    transition={{ duration: 0.2, ease: appleEasing }}
                    className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 shadow-2xl p-5"
                  >
                    <h3 className="text-base font-semibold text-[#1d1d1f] dark:text-white">确认更新数据</h3>
                    <p className="mt-2 text-sm leading-6 text-[#424245] dark:text-[#a1a1a6]">
                      将为 {refreshConfirmation.name} 拉取最新行情并写入数据库。
                    </p>
                    <div className="mt-5 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setRefreshConfirmation(null)}
                        className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-[#424245] dark:text-[#e5e5e5] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const stock = refreshConfirmation;
                          setRefreshConfirmation(null);
                          handleRefreshOne(stock);
                        }}
                        className="h-10 px-4 rounded-lg bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-sm font-medium text-white transition-colors"
                      >
                        确认更新
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
