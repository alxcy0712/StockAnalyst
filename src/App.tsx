import { useEffect } from 'react';
import { AssetForm } from './components/AssetForm';
import { AssetList } from './components/AssetList';
import { AssetAllocationChart } from './components/AssetAllocationChart';
import { NavChart } from './components/NavChart';
import { TrendingUp, BarChart3, Database, Clock, Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore } from './stores/themeStore';
import { GlobalToast } from './components/GlobalToast';

function App() {
  const { theme, setTheme, isDark } = useThemeStore();

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

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
      <header className="bg-white/70 dark:bg-[#1c1c1e]/70 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-8 sm:px-10">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">金融资产回测</h1>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium tracking-wide uppercase">Portfolio Backtesting</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={cycleTheme}
                className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200"
                title={theme === 'system' ? '跟随系统' : theme === 'dark' ? '深色模式' : '浅色模式'}
              >
                <ThemeIcon />
              </button>
              <AssetForm />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-8 sm:px-10 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-none border border-gray-200/60 dark:border-gray-800/60 p-6 transition-all duration-300">
              <NavChart />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: BarChart3, label: '支持市场', value: 'A股 / 港股 / 基金' },
                { icon: Database, label: '货币基准', value: 'CNY 人民币' },
                { icon: Clock, label: '数据更新', value: '实时' },
                { icon: Database, label: '存储方式', value: '本地存储' },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white dark:bg-[#1c1c1e] rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none border border-gray-200/50 dark:border-gray-800/50 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:hover:shadow-none transition-all duration-300 group"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <item.icon className="w-3.5 h-3.5 text-blue-500" />
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">{item.label}</p>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-1 space-y-4">
            <AssetList />
            <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-800 to-transparent" />
            <AssetAllocationChart />
          </div>
        </div>
      </main>

      <footer className="bg-white/50 dark:bg-[#1c1c1e]/30 border-t border-gray-200/50 dark:border-gray-800/50 transition-colors">
        <div className="max-w-[1400px] mx-auto px-8 sm:px-10 py-5">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              数据仅供学习参考，不构成投资建议
            </p>
            <div className="flex gap-4 text-[10px] text-gray-400 dark:text-gray-500 flex-wrap justify-center">
              <span>A股/港股：东方财富</span>
              <span>基金净值：天天基金</span>
              <span>历史净值：东方财富</span>
              <span>汇率：东方财富</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
