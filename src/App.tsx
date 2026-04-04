import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { AssetForm } from './components/AssetForm';
import { AssetList } from './components/AssetList';
import { AssetAllocationChart } from './components/AssetAllocationChart';
import { NavChart } from './components/NavChart';
import { TrendingUp, BarChart3, Database, Clock, Sun, Moon, Monitor, RefreshCw } from 'lucide-react';
import { useThemeStore } from './stores/themeStore';
import { useExchangeStore } from './stores/exchangeStore';
import { GlobalToast } from './components/GlobalToast';
import { getCurrentExchangeRate } from './api/adapters/exchange';

const APPLE_EASE: [number, number, number, number] = [0.25, 0.1, 0.25, 1.0];

function App() {
  const { theme, setTheme, isDark } = useThemeStore();
  const { rates, updateTime, isLoading, setRates, setLoading } = useExchangeStore();

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const fetchRates = async () => {
    setLoading(true);
    try {
      const data = await getCurrentExchangeRate();
      setRates(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const ThemeIcon = () => {
    if (theme === 'light') return <Sun className="w-5 h-5" />;
    if (theme === 'dark') return <Moon className="w-5 h-5" />;
    return <Monitor className="w-5 h-5" />;
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#0d0d0f] flex flex-col transition-colors duration-300">
      <GlobalToast />
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: APPLE_EASE }}
        className="bg-white/70 dark:bg-[#1c1c1e]/70 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 sticky top-0 z-40"
      >
        <div className="max-w-[1400px] mx-auto px-8 sm:px-10">
          <div className="flex justify-between items-center h-16">
            <motion.div
              className="flex items-center gap-3"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1, ease: APPLE_EASE }}
            >
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 dark:from-blue-500 dark:to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                <TrendingUp className="w-4 h-4 text-white dark:text-[#1d1d1f]" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">金融资产回测</h1>
                <p className="text-[10px] text-[#86868b] dark:text-gray-400 font-medium tracking-wide uppercase">Portfolio Backtesting</p>
              </div>
            </motion.div>
            <motion.div
              className="flex items-center gap-3"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.15, ease: APPLE_EASE }}
            >
              {rates && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-100/80 dark:bg-gray-800/50 rounded-full text-[11px]">
                  <span className="text-gray-600 dark:text-gray-300">1HKD={(1/rates.CNY_HKD).toFixed(4)}CNY</span>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <span className="text-gray-600 dark:text-gray-300">1USD={(1/rates.CNY_USD).toFixed(4)}CNY</span>
                  {updateTime && (
                    <span className="text-[#86868b] dark:text-gray-500 ml-1">({updateTime})</span>
                  )}
                  <button
                    onClick={fetchRates}
                    disabled={isLoading}
                    className="ml-1 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200"
                    title="刷新汇率"
                  >
                    <RefreshCw className={`w-3 h-3 text-[#86868b] ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              )}
              <button
                onClick={cycleTheme}
                className="p-2.5 rounded-full text-[#86868b] dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-300"
                style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1.0)' }}
                title={theme === 'system' ? '跟随系统' : theme === 'dark' ? '深色模式' : '浅色模式'}
              >
                <ThemeIcon />
              </button>
              <AssetForm />
            </motion.div>
          </div>
        </div>
      </motion.header>

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-8 sm:px-10 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.2, ease: APPLE_EASE }}
              className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] dark:shadow-none border border-gray-200/50 dark:border-gray-800/50 p-6 transition-all duration-500"
            >
              <NavChart />
            </motion.div>

            <motion.div
              className="grid grid-cols-2 md:grid-cols-4 gap-4"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.35, ease: APPLE_EASE }}
            >
              {[
                { icon: BarChart3, label: '支持市场', value: 'A股 / 港股 / 基金' },
                { icon: Database, label: '货币基准', value: 'CNY 人民币' },
                { icon: Clock, label: '数据更新', value: '实时' },
                { icon: Database, label: '存储方式', value: '本地存储' },
              ].map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.4 + idx * 0.08, ease: APPLE_EASE }}
                  whileHover={{
                    y: -2,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                    transition: { duration: 0.3 }
                  }}
                  className="bg-white dark:bg-[#1c1c1e] rounded-2xl p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] dark:shadow-none border border-gray-200/50 dark:border-gray-800/50 transition-all duration-300 group"
                  style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1.0)' }}
                >
                  <div className="flex items-center gap-2.5 mb-2">
                    <item.icon className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">{item.label}</p>
                  </div>
                  <p className="text-sm font-semibold text-[#1d1d1f] dark:text-gray-100">{item.value}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <motion.div
            className="lg:col-span-1 space-y-6"
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.3, ease: APPLE_EASE }}
          >
            <AssetList />
            <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-800 to-transparent" />
            <AssetAllocationChart />
          </motion.div>
        </div>
      </main>

      <motion.footer
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.5, ease: APPLE_EASE }}
        className="bg-white/50 dark:bg-[#1c1c1e]/30 border-t border-gray-200/50 dark:border-gray-800/50 transition-colors"
      >
        <div className="max-w-[1400px] mx-auto px-8 sm:px-10 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <p className="text-xs text-[#86868b] dark:text-gray-500">
              数据仅供学习参考，不构成投资建议
            </p>
            <div className="flex gap-4 text-[10px] text-[#86868b] dark:text-gray-500 flex-wrap justify-center">
              <span>A股/港股：东方财富</span>
              <span>基金净值：天天基金</span>
              <span>历史净值：东方财富</span>
              {rates && (
                <span>汇率：1HKD={(1/rates.CNY_HKD).toFixed(4)}CNY / 1USD={(1/rates.CNY_USD).toFixed(4)}CNY {updateTime && `(${updateTime})`}</span>
              )}
            </div>
          </div>
        </div>
      </motion.footer>
    </div>
  );
}

export default App;
