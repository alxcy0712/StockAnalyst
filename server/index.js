import express from 'express';
import { stockHistoryService } from './stockService.js';

const app = express();
const PORT = 3001;

app.use(express.json());

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

      const apidataMatch = text.match(/var apidata=(\{[^;]+\});/);
      if (apidataMatch) {
        try {
          const recordsMatch = text.match(/records:(\d+)/);
          const pagesMatch = text.match(/pages:(\d+)/);
          if (recordsMatch) console.log(`Page ${currentPage}: records=${recordsMatch[1]}, pages=${pagesMatch ? pagesMatch[1] : '?'}`);
          if (pagesMatch) totalPages = parseInt(pagesMatch[1]);
          
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

app.get('/api/stock/validate', async (req, res) => {
  try {
    const { market, code } = req.query;

    if (!market || !code) {
      res.status(400).json({ valid: false, message: 'market and code are required' });
      return;
    }

    if (!['a_stock', 'hk_stock'].includes(market)) {
      res.status(400).json({ valid: false, message: 'market must be a_stock or hk_stock' });
      return;
    }

    const result = await stockHistoryService.validateSymbol(market, String(code));

    if (result.exists) {
      res.json({
        valid: true,
        market,
        code,
        name: result.symbol.name,
        currency: result.symbol.currency,
      });
    } else {
      res.status(404).json({
        valid: false,
        market,
        code,
        message: result.error || '数据库中没有该资产的历史数据',
      });
    }
  } catch (error) {
    console.error('Stock validation error:', error);
    res.status(500).json({
      valid: false,
      message: error.message || 'validation error',
    });
  }
});

app.get('/api/stock/kline', async (req, res) => {
  try {
    const {
      market,
      code,
      period = 'day',
      startDate,
      endDate,
      fqt = '1',
    } = req.query;

    if (!market || !code) {
      res.status(400).json({ message: 'market and code are required' });
      return;
    }

    const envelope = await stockHistoryService.getKLineEnvelope({
      market: String(market),
      code: String(code),
      period: String(period),
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
      fqt: Number.parseInt(String(fqt), 10),
    });

    res.json(envelope);
  } catch (error) {
    console.error('Stock kline error:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'stock kline error',
      code: error.code || 'internal_error',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Data proxy listening on http://localhost:${PORT}`);
});
