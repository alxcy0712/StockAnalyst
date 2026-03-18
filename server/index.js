// Simple Express proxy to fetch基金净值历史 from Eastmoney without CORS issues
import express from 'express';

const app = express();
const PORT = 3001;

// CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Endpoint: /api/fundnav/history?code=007466&startDate=2025-01-01&endDate=2026-02-19&per=500&page=1
app.get('/api/fundnav/history', async (req, res) => {
  try {
    const { code, startDate, endDate, per = '500', page = '1' } = req.query;
    if (!code) {
      res.status(400).send('code is required');
      return;
    }
    const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&page=${page}&code=${encodeURIComponent(
      code
    )}&sdate=${encodeURIComponent(startDate || '')}&edate=${encodeURIComponent(endDate || '')}&per=${per}`;
    const r = await fetch(url, { mode: 'cors' });
    const text = await r.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(text);
  } catch (err) {
    console.error('Proxy fetch error:', err);
    res.status(500).send('proxy error');
  }
});

// Endpoint: /api/fundnav/all?code=007466&startDate=2025-01-01 - 获取全部历史数据（滑动窗口分页）
app.get('/api/fundnav/all', async (req, res) => {
  try {
    const { code, startDate, per = '20' } = req.query;
    if (!code) {
      res.status(400).send('code is required');
      return;
    }

    const allData = [];
    let currentPage = 1;
    let totalPages = 1;
    let hasMore = true;
    const maxPages = 200;

    while (hasMore && currentPage <= maxPages) {
      const cb = `cb${Date.now()}`;
      const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&page=${currentPage}&code=${encodeURIComponent(
        code
      )}&sdate=${encodeURIComponent(startDate || '')}&per=${per}&callback=${cb}`;
      
      const r = await fetch(url, { mode: 'cors' });
      const text = await r.text();

      // 解析 var apidata = {...} 格式
      const apidataMatch = text.match(/var apidata=(\{[^;]+\});/);
      if (apidataMatch) {
        try {
          // 直接从文本中提取 records 和 pages
          const recordsMatch = text.match(/records:(\d+)/);
          const pagesMatch = text.match(/pages:(\d+)/);
          if (recordsMatch) console.log(`Page ${currentPage}: records=${recordsMatch[1]}, pages=${pagesMatch ? pagesMatch[1] : '?'}`);
          if (pagesMatch) totalPages = parseInt(pagesMatch[1]);
          
          // 解析HTML内容 - 使用更简单的方式
          const tbodyMatch = text.match(/<tbody>([\s\S]*?)<\/tbody>/i);
          if (tbodyMatch) {
            const tbodyHtml = tbodyMatch[1];
            const trMatcher = /<tr>([\s\S]*?)<\/tr>/gi;
            let trMatch = null;
            while ((trMatch = trMatcher.exec(tbodyHtml)) !== null) {
              const trHtml = trMatch[1];
              const tdMatches = trHtml.match(/<td[^>]*>([^<]*)<\/td>/gi);
              if (tdMatches && tdMatches.length >= 4) {
                const dateRaw = tdMatches[0].replace(/<[^>]*>/g, '').trim();
                const unitRaw = tdMatches[1].replace(/<[^>]*>/g, '').trim();
                const accumRaw = tdMatches[2].replace(/<[^>]*>/g, '').trim();
                const changeRaw = tdMatches[3].replace(/<[^>]*>/g, '').trim();
                const unitNum = parseFloat(unitRaw.replace(/,/g, ''));
                const accumNum = parseFloat(accumRaw.replace(/,/g, ''));
                const changePercent = parseFloat(changeRaw.replace('%', '')) / 100;
                if (dateRaw && Number.isFinite(unitNum) && Number.isFinite(accumNum) && Number.isFinite(changePercent)) {
                  allData.push({ date: dateRaw, unitNav: unitNum, accumulatedNav: accumNum, changePercent });
                }
              }
            }
          }
        } catch (e) {
          console.log('Failed to parse apidata:', e);
        }
      }

      if (allData.length > 0 && currentPage < totalPages && currentPage < maxPages) {
        currentPage++;
      } else {
        hasMore = false;
      }
    }

    console.log(`Total fetched: ${allData.length} records`);
    res.setHeader('Content-Type', 'application/json');
    res.json(allData);
  } catch (err) {
    console.error('Proxy fetch error:', err);
    res.status(500).send('proxy error');
  }
});

app.listen(PORT, () => {
  console.log(`Fund NAV proxy listening on http://localhost:${PORT}`);
});
