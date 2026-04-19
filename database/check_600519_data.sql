-- 查询贵州茅台(600519)在数据库中的数据范围
SELECT 
  s.code,
  s.name,
  s.market,
  COUNT(*) as total_days,
  MIN(b.trade_date) as earliest_date,
  MAX(b.trade_date) as latest_date,
  MAX(b.trade_date) - MIN(b.trade_date) as date_span_days
FROM public.stock_daily_bars b
JOIN public.stock_symbols s ON s.id = b.symbol_id
WHERE s.code = '600519' 
  AND s.market = 'a_stock'
GROUP BY s.code, s.name, s.market;

-- 查看最近10条数据，确认最新日期
SELECT 
  s.code,
  s.name,
  b.trade_date,
  b.qfq_close
FROM public.stock_daily_bars b
JOIN public.stock_symbols s ON s.id = b.symbol_id
WHERE s.code = '600519' 
  AND s.market = 'a_stock'
ORDER BY b.trade_date DESC
LIMIT 10;

-- 检查2020年6月前后的数据是否存在间隙
SELECT 
  trade_date,
  qfq_close
FROM public.stock_daily_bars b
JOIN public.stock_symbols s ON s.id = b.symbol_id
WHERE s.code = '600519' 
  AND s.market = 'a_stock'
  AND b.trade_date BETWEEN '2020-06-01' AND '2020-06-15'
ORDER BY trade_date;
