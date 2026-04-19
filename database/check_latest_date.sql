SELECT 
  s.code,
  s.name,
  MAX(b.trade_date) as latest_date,
  (CURRENT_DATE - MAX(b.trade_date)) as days_behind
FROM public.stock_daily_bars b
JOIN public.stock_symbols s ON s.id = b.symbol_id
WHERE s.code = '600519' 
  AND s.market = 'a_stock'
GROUP BY s.code, s.name;
