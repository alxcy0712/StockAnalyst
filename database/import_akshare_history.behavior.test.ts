import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';

const scriptPath = resolve(process.cwd(), 'database/import_akshare_history.py');

function runPythonAssertions(code: string) {
  execFileSync('python3', ['-c', code], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      IMPORT_SCRIPT_PATH: scriptPath,
    },
    stdio: 'pipe',
  });
}

const importScriptPrelude = String.raw`
import importlib.util
import os
import sys
import types

akshare_stub = types.ModuleType("akshare")
sys.modules["akshare"] = akshare_stub

pandas_stub = types.ModuleType("pandas")
pandas_stub.DataFrame = type("DataFrame", (), {})
pandas_stub.Timestamp = type("Timestamp", (), {"utcnow": staticmethod(lambda: None)})
sys.modules["pandas"] = pandas_stub

requests_stub = types.ModuleType("requests")
requests_stub.Response = type("Response", (), {})
sys.modules["requests"] = requests_stub

spec = importlib.util.spec_from_file_location("import_akshare_history", os.environ["IMPORT_SCRIPT_PATH"])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
`;

describe('import_akshare_history open-day behavior', () => {
  it('skips today before the market close buffer unless explicitly included', () => {
    runPythonAssertions(`${importScriptPrelude}
from datetime import date, datetime

now = datetime(2026, 4, 24, 10, 0, tzinfo=module.SHANGHAI_TZ)
assert module.should_skip_trade_date("a_stock", date(2026, 4, 24), now, False, 30)
assert not module.should_skip_trade_date("a_stock", date(2026, 4, 24), now, True, 30)
assert not module.should_skip_trade_date("a_stock", date(2026, 4, 23), now, False, 30)
`);
  });

  it('keeps today after the market close buffer', () => {
    runPythonAssertions(`${importScriptPrelude}
from datetime import date, datetime

a_stock_after_close = datetime(2026, 4, 24, 15, 31, tzinfo=module.SHANGHAI_TZ)
hk_after_close = datetime(2026, 4, 24, 16, 31, tzinfo=module.SHANGHAI_TZ)
assert not module.should_skip_trade_date("a_stock", date(2026, 4, 24), a_stock_after_close, False, 30)
assert not module.should_skip_trade_date("hk_stock", date(2026, 4, 24), hk_after_close, False, 30)
`);
  });

  it('uses the previous stored trading day as the incremental start date', () => {
    runPythonAssertions(`${importScriptPrelude}
assert module.derive_incremental_start_date([
    {"trade_date": "2024-01-05"},
    {"trade_date": "2024-01-04"},
]) == "2024-01-04"
assert module.derive_incremental_start_date([
    {"trade_date": "2024-01-05"},
]) == "2024-01-05"
assert module.derive_incremental_start_date([]) is None
`);
  });
});
