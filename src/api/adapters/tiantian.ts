import type { FundData } from '../../types';

// 天天基金API（使用JSONP避免CORS问题）
const TIANTIAN_FUND_API = 'https://fundgz.1234567.com.cn/js';

// 获取基金实时数据（含估算净值）
export async function getFundQuote(fundCode: string): Promise<FundData | null> {
  return new Promise((resolve) => {
    const timestamp = Date.now();
    const script = document.createElement('script');
    
    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 10000);

    const cleanup = () => {
      clearTimeout(timeout);
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    // 天天基金使用固定的 jsonpgz 回调函数
    const handler = (data: FundData) => {
      cleanup();
      if (data && data.name) {
        resolve(data);
      } else {
        resolve(null);
      }
    };

    // 临时替换全局 jsonpgz 函数
    const originalCallback = (window as any).jsonpgz;
    (window as any).jsonpgz = handler;

    script.src = `${TIANTIAN_FUND_API}/${fundCode}.js?rt=${timestamp}`;
    script.onload = () => {
      setTimeout(() => {
        (window as any).jsonpgz = originalCallback;
      }, 100);
    };
    script.onerror = () => {
      cleanup();
      (window as any).jsonpgz = originalCallback;
      resolve(null);
    };

    document.head.appendChild(script);
  });
}
