#!/usr/bin/env python3

import argparse
import csv
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import akshare as ak
import pandas as pd
import requests


API_PROVIDER = "akshare"
MARKET_ALIASES = {
    "a_stock": "a_stock",
    "ashare": "a_stock",
    "a-share": "a_stock",
    "a股": "a_stock",
    "A股": "a_stock",
    "沪深A股": "a_stock",
    "hk_stock": "hk_stock",
    "hk": "hk_stock",
    "hshare": "hk_stock",
    "h-share": "hk_stock",
    "港股": "hk_stock",
}
HEADER_ALIASES = {
    "market": "market",
    "市场": "market",
    "code": "code",
    "代码": "code",
    "symbol": "code",
    "name": "name",
    "名称": "name",
}
ADJUST_TOKEN_MAP = {
    "raw": "",
    "qfq": "qfq",
    "hfq": "hfq",
}
ADJUSTED_TYPES = {"qfq", "hfq"}


@dataclass
class SymbolInput:
    market: str
    code: str
    name: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="使用 AKShare 拉取历史数据并写入 Supabase 宽表日线结构。"
    )
    parser.add_argument(
        "--symbols-file",
        help="CSV 文件，支持 market,code 或 market,code,name；market 支持 a_stock/hk_stock/A股/港股",
    )
    parser.add_argument("--market", choices=["a_stock", "hk_stock"])
    parser.add_argument("--code", help="单个股票代码，例如 600519 或 00700")
    parser.add_argument("--name", help="单个股票名称，可选")
    parser.add_argument(
        "--adjust-modes",
        default="raw,qfq",
        help="复权模式，逗号分隔，可选 raw,qfq,hfq。raw 总是会写入宽表。",
    )
    parser.add_argument(
        "--job-type",
        default="backfill",
        choices=["backfill", "incremental", "repair"],
        help="导入任务类型",
    )
    parser.add_argument("--start-date", help="起始日期，格式 YYYY-MM-DD")
    parser.add_argument("--end-date", help="结束日期，格式 YYYY-MM-DD")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--pause-seconds", type=float, default=0.2)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def now_utc_iso() -> str:
    return pd.Timestamp.utcnow().isoformat()


def normalize_market(value: str) -> str:
    market = MARKET_ALIASES.get(value.strip())
    if not market:
        raise ValueError(f"不支持的 market: {value}")
    return market


def normalize_code(market: str, code: str) -> str:
    code = code.strip()
    if not code:
        raise ValueError("缺少证券代码")
    if not re.fullmatch(r"\d+", code):
        raise ValueError(f"证券代码格式不合法: {code}")
    if market == "hk_stock":
        normalized = code.zfill(5)
        if len(normalized) != 5:
            raise ValueError(f"港股代码长度不合法: {code}")
        return normalized
    if len(code) != 6:
        raise ValueError(f"A股代码长度不合法: {code}")
    return code


def exchange_for_symbol(market: str, code: str) -> str:
    if market == "hk_stock":
        return "HKEX"
    return "SSE" if code.startswith("6") else "SZSE"


def build_akshare_symbol(market: str, code: str) -> str:
    if market == "hk_stock":
        return normalize_code(market, code)
    return f"sh{code}" if code.startswith("6") else f"sz{code}"


def build_canonical_symbol(market: str, code: str) -> str:
    if market == "hk_stock":
        return f"HK:{normalize_code(market, code)}"
    return f"{'SH' if code.startswith('6') else 'SZ'}:{code}"


def currency_for_market(market: str) -> str:
    return "HKD" if market == "hk_stock" else "CNY"


def load_symbols(args: argparse.Namespace) -> list[SymbolInput]:
    symbols: list[SymbolInput] = []

    if args.symbols_file:
        symbols.extend(load_symbols_from_csv(Path(args.symbols_file)))

    if args.market and args.code:
        symbols.append(
            SymbolInput(
                market=normalize_market(args.market),
                code=normalize_code(args.market, args.code),
                name=args.name,
            )
        )

    if not symbols:
        raise ValueError("请提供 --symbols-file 或 --market + --code")

    deduped: dict[tuple[str, str], SymbolInput] = {}
    for symbol in symbols:
        key = (symbol.market, normalize_code(symbol.market, symbol.code))
        deduped[key] = SymbolInput(
            market=symbol.market,
            code=normalize_code(symbol.market, symbol.code),
            name=symbol.name,
        )

    return list(deduped.values())


def load_symbols_from_csv(path: Path) -> list[SymbolInput]:
    if not path.exists():
        raise FileNotFoundError(f"找不到 symbols 文件: {path}")

    symbols: list[SymbolInput] = []
    invalid_rows: list[str] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = [row for row in csv.reader(handle) if any(cell.strip() for cell in row)]

    if not rows:
        raise ValueError(f"symbols 文件为空: {path}")

    first_row_aliases = [HEADER_ALIASES.get(cell.strip()) for cell in rows[0]]
    has_header = "market" in first_row_aliases and "code" in first_row_aliases

    if has_header:
        header_map = {
            HEADER_ALIASES[cell.strip()]: index
            for index, cell in enumerate(rows[0])
            if HEADER_ALIASES.get(cell.strip())
        }
        data_rows = rows[1:]
    else:
        header_map = {"market": 0, "code": 1, "name": 2}
        data_rows = rows

    for line_number, row in enumerate(data_rows, start=2 if has_header else 1):
        try:
            market_raw = row[header_map["market"]].strip()
            code_raw = row[header_map["code"]].strip()
            name_index = header_map.get("name")
            name_raw = (
                row[name_index].strip()
                if name_index is not None and name_index < len(row)
                else ""
            )
            market = normalize_market(market_raw)
            code = normalize_code(market, code_raw)
            name = name_raw or None
            symbols.append(SymbolInput(market=market, code=code, name=name))
        except Exception as error:
            invalid_rows.append(
                f"[skip] line={line_number} reason={error} row={','.join(cell.strip() for cell in row)}"
            )

    for message in invalid_rows:
        print(message, file=sys.stderr)

    if invalid_rows:
        print(
            f"[symbols] valid={len(symbols)} invalid={len(invalid_rows)} file={path}",
            file=sys.stderr,
        )

    if not symbols:
        raise ValueError(f"symbols 文件没有可导入的有效行: {path}")

    return symbols


def fetch_history(symbol: SymbolInput, adjust_mode: str) -> pd.DataFrame:
    adjust_token = ADJUST_TOKEN_MAP[adjust_mode]
    if symbol.market == "hk_stock":
        return ak.stock_hk_daily(symbol=symbol.code, adjust=adjust_token)
    return ak.stock_zh_a_daily(
        symbol=build_akshare_symbol(symbol.market, symbol.code),
        adjust=adjust_token,
    )


def prepare_history_frame(
    df: pd.DataFrame,
    start_date: str | None,
    end_date: str | None,
) -> pd.DataFrame:
    working = df.copy()
    if "date" not in working.columns:
        working = working.reset_index()
        first_column = working.columns[0]
        working = working.rename(columns={first_column: "date"})

    working["date"] = pd.to_datetime(working["date"]).dt.date

    if start_date:
        start = pd.to_datetime(start_date).date()
        working = working[working["date"] >= start]

    if end_date:
        end = pd.to_datetime(end_date).date()
        working = working[working["date"] <= end]

    return working.sort_values("date").drop_duplicates(subset=["date"], keep="last")


def drop_repeated_hk_raw_rows(frame: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    if frame.empty:
        return frame, []

    compare_columns = [
        column
        for column in ("open", "high", "low", "close", "volume")
        if column in frame.columns
    ]
    repeated_mask = frame[compare_columns].eq(frame[compare_columns].shift(1)).all(axis=1)
    dropped_dates = [date.isoformat() for date in frame.loc[repeated_mask, "date"].tolist()]
    cleaned = frame.loc[~repeated_mask].copy()
    return cleaned, dropped_dates


def to_float(value):
    if pd.isna(value):
        return None
    return float(value)


def to_int(value):
    if pd.isna(value):
        return None
    return int(round(float(value)))


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"缺少环境变量 {name}")
    return value


def build_auth_headers(service_role_key: str) -> dict[str, str]:
    return {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }


def chunked(rows: list[dict], batch_size: int) -> Iterable[list[dict]]:
    for index in range(0, len(rows), batch_size):
        yield rows[index : index + batch_size]


def handle_response(response: requests.Response, table: str):
    if response.ok:
        if response.text.strip():
            return response.json()
        return None

    raise RuntimeError(
        f"Supabase 请求失败: table={table} status={response.status_code} body={response.text[:500]}"
    )


def insert_rows(
    base_url: str,
    service_role_key: str,
    table: str,
    rows: list[dict],
    return_representation: bool = False,
):
    headers = build_auth_headers(service_role_key)
    headers["Prefer"] = (
        "return=representation" if return_representation else "return=minimal"
    )
    response = requests.post(
        f"{base_url.rstrip('/')}/rest/v1/{table}",
        headers=headers,
        json=rows,
        timeout=60,
    )
    return handle_response(response, table)


def upsert_rows(
    base_url: str,
    service_role_key: str,
    table: str,
    on_conflict: str,
    rows: list[dict],
    batch_size: int,
    return_representation: bool = False,
) -> list[dict]:
    if not rows:
        return []

    headers = build_auth_headers(service_role_key)
    headers["Prefer"] = (
        "resolution=merge-duplicates,return=representation"
        if return_representation
        else "resolution=merge-duplicates,return=minimal"
    )
    endpoint = f"{base_url.rstrip('/')}/rest/v1/{table}"
    results: list[dict] = []

    for batch in chunked(rows, batch_size):
        response = requests.post(
            endpoint,
            params={"on_conflict": on_conflict},
            headers=headers,
            json=batch,
            timeout=60,
        )
        payload = handle_response(response, table)
        if return_representation and payload:
            if isinstance(payload, list):
                results.extend(payload)
            else:
                results.append(payload)

    return results


def patch_rows(
    base_url: str,
    service_role_key: str,
    table: str,
    filters: dict[str, str],
    payload: dict,
):
    headers = build_auth_headers(service_role_key)
    headers["Prefer"] = "return=minimal"
    response = requests.patch(
        f"{base_url.rstrip('/')}/rest/v1/{table}",
        params=filters,
        headers=headers,
        json=payload,
        timeout=60,
    )
    handle_response(response, table)


def build_symbol_row(symbol: SymbolInput) -> dict:
    return {
        "market": symbol.market,
        "code": symbol.code,
        "exchange": exchange_for_symbol(symbol.market, symbol.code),
        "canonical_symbol": build_canonical_symbol(symbol.market, symbol.code),
        "name": symbol.name,
        "currency": currency_for_market(symbol.market),
        "list_status": "active",
        "is_active": True,
        "source": API_PROVIDER,
        "metadata": {},
    }


def frame_to_price_map(frame: pd.DataFrame) -> dict:
    price_map: dict = {}
    for _, row in frame.iterrows():
        price_map[row["date"]] = {
            "open": to_float(row.get("open")),
            "high": to_float(row.get("high")),
            "low": to_float(row.get("low")),
            "close": to_float(row.get("close")),
        }
    return price_map


def build_daily_bar_rows(
    raw_frame: pd.DataFrame,
    adjusted_frames: dict[str, pd.DataFrame],
    symbol_id: str,
    ingestion_run_id: str,
) -> list[dict]:
    adjusted_maps = {
        mode: frame_to_price_map(frame) for mode, frame in adjusted_frames.items()
    }
    rows: list[dict] = []

    for _, row in raw_frame.iterrows():
        trade_date = row["date"]
        item = {
            "symbol_id": symbol_id,
            "trade_date": trade_date.isoformat(),
            "raw_open": to_float(row.get("open")),
            "raw_high": to_float(row.get("high")),
            "raw_low": to_float(row.get("low")),
            "raw_close": to_float(row.get("close")),
            "volume": to_int(row.get("volume")),
            "amount": to_float(row.get("amount")),
            "provider": API_PROVIDER,
            "ingestion_run_id": ingestion_run_id,
        }

        for mode, price_map in adjusted_maps.items():
            adjusted = price_map.get(trade_date)
            if adjusted is None:
                continue
            item[f"{mode}_open"] = adjusted["open"]
            item[f"{mode}_high"] = adjusted["high"]
            item[f"{mode}_low"] = adjusted["low"]
            item[f"{mode}_close"] = adjusted["close"]

        rows.append(item)

    return rows


def create_ingestion_run(
    base_url: str,
    service_role_key: str,
    args: argparse.Namespace,
    symbol_count: int,
) -> str:
    row = {
        "provider": API_PROVIDER,
        "job_type": args.job_type,
        "status": "running",
        "symbol_count": symbol_count,
        "row_count": 0,
        "started_at": now_utc_iso(),
        "request_params": {
            "symbols_file": args.symbols_file,
            "market": args.market,
            "code": args.code,
            "adjust_modes": args.adjust_modes,
            "start_date": args.start_date,
            "end_date": args.end_date,
            "batch_size": args.batch_size,
        },
    }
    created = insert_rows(
        base_url=base_url,
        service_role_key=service_role_key,
        table="stock_ingestion_runs",
        rows=[row],
        return_representation=True,
    )
    return created[0]["id"]


def complete_ingestion_run(
    base_url: str,
    service_role_key: str,
    run_id: str,
    status: str,
    row_count: int,
    error_message: str | None = None,
):
    payload = {
        "status": status,
        "row_count": row_count,
        "finished_at": now_utc_iso(),
        "error_message": error_message,
    }
    patch_rows(
        base_url=base_url,
        service_role_key=service_role_key,
        table="stock_ingestion_runs",
        filters={"id": f"eq.{run_id}"},
        payload=payload,
    )


def main() -> int:
    args = parse_args()

    try:
        symbols = load_symbols(args)
    except Exception as error:
        print(f"[error] {error}", file=sys.stderr)
        return 1

    adjust_modes = list(
        dict.fromkeys(mode.strip() for mode in args.adjust_modes.split(",") if mode.strip())
    )
    invalid_modes = [mode for mode in adjust_modes if mode not in ADJUST_TOKEN_MAP]
    if invalid_modes:
        print(f"[error] 不支持的 adjust mode: {', '.join(invalid_modes)}", file=sys.stderr)
        return 1

    requested_adjusted_modes = [mode for mode in adjust_modes if mode in ADJUSTED_TYPES]

    base_url = None
    service_role_key = None
    run_id = None
    total_bar_rows = 0
    adjusted_row_counts = {mode: 0 for mode in requested_adjusted_modes}

    if not args.dry_run:
        try:
            base_url = require_env("SUPABASE_URL")
            service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
            run_id = create_ingestion_run(
                base_url=base_url,
                service_role_key=service_role_key,
                args=args,
                symbol_count=len(symbols),
            )
        except Exception as error:
            print(f"[error] {error}", file=sys.stderr)
            return 1

    try:
        for symbol in symbols:
            print(f"[import] {symbol.market} {symbol.code}")

            raw_df = fetch_history(symbol, "raw")
            raw_frame = prepare_history_frame(raw_df, args.start_date, args.end_date)
            if symbol.market == "hk_stock":
                raw_frame, dropped_dates = drop_repeated_hk_raw_rows(raw_frame)
                if dropped_dates:
                    print(f"  - filtered duplicated raw dates: {', '.join(dropped_dates)}")
            bar_rows_count = len(raw_frame)
            total_bar_rows += bar_rows_count
            print(f"  - bars: {bar_rows_count} rows")

            adjusted_frames: dict[str, pd.DataFrame] = {}
            for mode in requested_adjusted_modes:
                adjusted_df = fetch_history(symbol, mode)
                adjusted_frame = prepare_history_frame(
                    adjusted_df, args.start_date, args.end_date
                )
                adjusted_frames[mode] = adjusted_frame
                adjusted_row_counts[mode] += len(adjusted_frame)
                print(f"  - {mode}: {len(adjusted_frame)} rows")

            if args.dry_run:
                time.sleep(args.pause_seconds)
                continue

            assert base_url is not None
            assert service_role_key is not None
            assert run_id is not None

            symbol_payload = upsert_rows(
                base_url=base_url,
                service_role_key=service_role_key,
                table="stock_symbols",
                on_conflict="market,code",
                rows=[build_symbol_row(symbol)],
                batch_size=1,
                return_representation=True,
            )
            symbol_id = symbol_payload[0]["id"]

            upsert_rows(
                base_url=base_url,
                service_role_key=service_role_key,
                table="stock_daily_bars",
                on_conflict="symbol_id,trade_date",
                rows=build_daily_bar_rows(raw_frame, adjusted_frames, symbol_id, run_id),
                batch_size=args.batch_size,
            )

            time.sleep(args.pause_seconds)
    except Exception as error:
        if not args.dry_run and base_url and service_role_key and run_id:
            complete_ingestion_run(
                base_url=base_url,
                service_role_key=service_role_key,
                run_id=run_id,
                status="failed",
                row_count=total_bar_rows,
                error_message=str(error),
            )
        print(f"[error] 导入失败 detail={error}", file=sys.stderr)
        return 1

    if not args.dry_run and base_url and service_role_key and run_id:
        complete_ingestion_run(
            base_url=base_url,
            service_role_key=service_role_key,
            run_id=run_id,
            status="succeeded",
            row_count=total_bar_rows,
        )

    adjusted_summary = ", ".join(
        f"{mode}_rows={count}" for mode, count in adjusted_row_counts.items()
    )
    suffix = f" {adjusted_summary}" if adjusted_summary else ""
    mode_label = "dry-run" if args.dry_run else "write"
    print(
        f"[done] mode={mode_label} symbols={len(symbols)} bar_rows={total_bar_rows}{suffix}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
