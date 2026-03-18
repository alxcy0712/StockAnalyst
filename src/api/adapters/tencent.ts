import type { StockQuote } from '../../types';

const BASE_URL = 'https://qt.gtimg.cn/q=';

// 使用JSONP获取股票实时行情（解决GBK编码问题）
export async function getStockQuote(codes: string[]): Promise<StockQuote[]> {
  return new Promise((resolve) => {
    const codeStr = codes.join(',');
    
    // 创建script标签
    const script = document.createElement('script');
    script.charset = 'gbk'; // 指定GBK编码
    
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

    // 腾讯财经返回的是变量赋值格式，不是标准JSONP
    // 使用全局变量方式获取
    const checkData = () => {
      // 腾讯财经会创建 v_xxx 格式的全局变量
      const results: StockQuote[] = [];
      
      for (const code of codes) {
        const varName = `v_${code}`;
        const data = (window as any)[varName];
        
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
          // 清理全局变量
          delete (window as any)[varName];
        }
      }
      
      if (results.length > 0) {
        cleanup();
        resolve(results);
      } else {
        // 继续等待
        setTimeout(checkData, 100);
      }
    };

    script.src = `${BASE_URL}${codeStr}`;
    script.onload = () => {
      // 等待数据加载
      setTimeout(checkData, 100);
    };
    script.onerror = () => {
      cleanup();
      resolve([]);
    };

    document.head.appendChild(script);
  });
}
