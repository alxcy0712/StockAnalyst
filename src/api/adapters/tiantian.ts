import type { FundData } from '../../types';

// 天天基金API（使用JSONP避免CORS问题）
const TIANTIAN_FUND_API = 'https://fundgz.1234567.com.cn/js';
let fundQuoteQueue: Promise<void> = Promise.resolve();

function enqueueFundQuote<T>(task: () => Promise<T>): Promise<T> {
  const queuedTask = fundQuoteQueue.catch(() => undefined).then(task);
  fundQuoteQueue = queuedTask.then(() => undefined, () => undefined);
  return queuedTask;
}

// 获取基金实时数据（含估算净值）
export async function getFundQuote(fundCode: string): Promise<FundData | null> {
  return enqueueFundQuote(
    () =>
      new Promise((resolve) => {
        const timestamp = Date.now();
        const script = document.createElement('script');
        const originalCallback = (window as any).jsonpgz;
        let settled = false;

        const restoreCallback = () => {
          (window as any).jsonpgz = originalCallback;
        };

        const cleanup = () => {
          clearTimeout(timeout);
          script.onload = null;
          script.onerror = null;
          if (script.parentNode) {
            script.parentNode.removeChild(script);
          }
          restoreCallback();
        };

        const settle = (value: FundData | null) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve(value);
        };

        const timeout = setTimeout(() => {
          settle(null);
        }, 10000);

        // 天天基金使用固定的 jsonpgz 回调函数，只能串行请求避免互相覆盖
        (window as any).jsonpgz = (data: FundData) => {
          settle(data && data.name ? data : null);
        };

        script.src = `${TIANTIAN_FUND_API}/${fundCode}.js?rt=${timestamp}`;
        script.onerror = () => {
          settle(null);
        };

        document.head.appendChild(script);
      })
  );
}
