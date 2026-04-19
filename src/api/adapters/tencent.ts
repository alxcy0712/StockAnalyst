import type { StockQuote } from '../../types';

const BASE_URL = 'https://qt.gtimg.cn/q=';

// 使用JSONP获取股票实时行情（解决GBK编码问题）
export async function getStockQuote(codes: string[]): Promise<StockQuote[]> {
  return new Promise((resolve) => {
    const codeStr = codes.join(',');
    const quoteWindow = window;
    
    const script = document.createElement('script');
    script.charset = 'gbk';
    
    const timeout = setTimeout(() => {
      cleanup();
      resolve([]);
    }, 10000);

    const cleanup = () => {
      clearTimeout(timeout);
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    const checkData = () => {
      const results: StockQuote[] = [];
      
      for (const code of codes) {
        const varName = `v_${code}` as `v_${string}`;
        const data = quoteWindow[varName];
        
        if (data) {
          const values = data.split('~');
          if (values.length >= 45) {
            results.push({
              code: code,
              name: values[1],
              price: parseFloat(values[3]) || 0,
              prevClose: parseFloat(values[4]) || 0,
              change: parseFloat(values[4]) - parseFloat(values[3]) || 0,
              changePercent: parseFloat(values[32]) || 0,
              volume: parseInt(values[36]) || 0,
            });
          }
          delete quoteWindow[varName];
        }
      }
      
      if (results.length > 0) {
        cleanup();
        resolve(results);
      } else {
        setTimeout(checkData, 100);
      }
    };

    script.src = `${BASE_URL}${codeStr}`;
    script.onload = () => {
      setTimeout(checkData, 100);
    };
    script.onerror = () => {
      cleanup();
      resolve([]);
    };

    document.head.appendChild(script);
  });
}
