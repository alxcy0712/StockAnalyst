// 调试脚本：检查贵州茅台的数据
// 在浏览器控制台执行以下代码

async function debugStockData() {
  const code = '600519';
  const market = 'a_stock';
  const startDate = '20200420';
  const endDate = '20250418';
  
  console.log('=== 开始调试贵州茅台数据 ===');
  
  try {
    // 1. 获取K线数据
    const response = await fetch(
      `http://localhost:3001/api/stock/kline?market=${market}&code=${code}&period=day&startDate=${startDate}&endDate=${endDate}&fqt=1`
    );
    const data = await response.json();
    
    console.log('K线数据条数:', data.data?.length);
    console.log('前3条:', data.data?.slice(0, 3));
    console.log('后3条:', data.data?.slice(-3));
    
    // 2. 检查日期格式
    if (data.data && data.data.length > 0) {
      const firstDate = data.data[0].date;
      const lastDate = data.data[data.data.length - 1].date;
      console.log('第一条日期:', firstDate, '格式:', firstDate.length === 8 ? 'YYYYMMDD' : 'YYYY-MM-DD');
      console.log('最后一条日期:', lastDate, '格式:', lastDate.length === 8 ? 'YYYYMMDD' : 'YYYY-MM-DD');
      
      // 3. 检查2020-06-09附近的数据
      const juneData = data.data.filter(d => d.date.includes('202006'));
      console.log('2020年6月数据条数:', juneData.length);
      console.log('2020年6月前5条:', juneData.slice(0, 5));
      console.log('2020年6月后5条:', juneData.slice(-5));
    }
    
    // 4. 检查2020-06-09之后的数据
    const afterJune9 = data.data?.filter(d => {
      const dateStr = d.date.length === 8 ? d.date : d.date.replace(/-/g, '');
      return dateStr > '20200609';
    });
    console.log('2020-06-09之后的数据条数:', afterJune9?.length);
    
  } catch (error) {
    console.error('调试出错:', error);
  }
}

// 执行调试
debugStockData();
