"""
UltrON — CSV / Excel File Watcher Service
Reads the latest data row from a CSV or Excel (.xlsx) file for poll-based ingestion.
Supports:
  - Plain CSV files (header or headerless)
  - Daily date-patterned CSV files  (e.g. {YYYYMMDD}.csv)
  - Excel .xlsx files               (skips header rows & footer rows like MAX/MIN/AVG)
  - Daily date-patterned .xlsx files (e.g. {DD.MM.YYYY} Daily Rep..xlsx)
  - SmartWatcher / DailySmartWatcher: auto-detects .csv vs .xlsx from filename
"""

import csv
import os
from pathlib import Path
from typing import Optional
from datetime import date, datetime, timedelta
from app.core.logger import get_logger

log = get_logger("ultron.csv_watcher")


# ─── Timestamp parser ─────────────────────────────────────────────────────────

def parse_csv_timestamp(raw_str: str) -> Optional[datetime]:
    if not raw_str:
        return None
    raw_str = str(raw_str).strip()
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%d-%m-%Y %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%m/%d/%Y %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%d %H:%M",
        "%d-%m-%Y %H:%M",
        "%m/%d/%Y %H:%M",
        "%d-%m-%y %H:%M:%S",
        "%d-%m-%y %H:%M",
        "%m/%d/%y %H:%M:%S",
        "%m/%d/%y %H:%M",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(raw_str, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(raw_str)
    except ValueError:
        pass
    return None


# ─── Footer row detection ─────────────────────────────────────────────────────

_FOOTER_KEYWORDS = {"max", "min", "avg", "average", "sum", "total", "count", "std"}

def _is_footer_row(first_cell: str) -> bool:
    """Return True if the row is a summary footer (MAX/MIN/AVG etc.)."""
    return str(first_cell).strip().lower() in _FOOTER_KEYWORDS


def _is_formula(value) -> bool:
    """Return True if the cell value is an Excel formula string."""
    return isinstance(value, str) and value.strip().startswith("=")


# ─── Shared value mapper ──────────────────────────────────────────────────────

def _map_row_to_results(
    row: Optional[dict],
    parameters: list[dict],
    csv_ts: Optional[datetime],
) -> list[dict]:
    """Map {col_index: raw_str} row to parameter readings."""
    results = []
    for p in parameters:
        col_idx = p.get("register_address", 0)
        raw_str = row.get(col_idx) if row else None

        raw_val: Optional[float] = None
        if raw_str not in (None, "", "N/A", "NA", "---", "null", "NULL", "nan"):
            try:
                raw_val = float(str(raw_str).replace(",", ""))
            except (ValueError, TypeError):
                log.debug(f"Non-numeric value at col {col_idx}: '{raw_str}'")

        value: Optional[float] = None
        if raw_val is not None:
            sf = p.get("scale_factor", 1.0) or 1.0
            off = p.get("offset", 0.0) or 0.0
            value = (raw_val * sf) + off

        results.append({
            "parameter_id": p["id"],
            "value": value,
            "raw_value": raw_val,
            "quality": "U",
            "timestamp": csv_ts,
        })
    return results


# ─── CSV Watcher ──────────────────────────────────────────────────────────────

class CSVWatcher:
    """
    Reads the last (most recent) data row from a plain CSV file.
    Uses column position (register_address) to map values to parameters.
    """

    def __init__(
        self,
        path: str,
        delimiter: str = ",",
        poll_interval: int = 60,
        csv_timestamp_col: Optional[int] = None,
    ):
        self.path = path
        self.delimiter = delimiter
        self.poll_interval = poll_interval
        self.csv_timestamp_col = csv_timestamp_col
        self._last_mtime: Optional[float] = None
        self._last_row: Optional[dict] = None

    def _read_last_row(self) -> Optional[dict]:
        """Read the last data row from the CSV. Returns {col_index: value_str}."""
        if not os.path.exists(self.path):
            log.warning(f"CSV file not found: {self.path}")
            return None

        try:
            mtime = os.path.getmtime(self.path)
            if self._last_mtime == mtime and self._last_row is not None:
                return self._last_row

            with open(self.path, newline="", encoding="utf-8-sig", errors="ignore") as f:
                reader = csv.reader(f, delimiter=self.delimiter)
                rows = list(reader)

            if not rows:
                log.warning(f"CSV file is empty: {self.path}")
                return None

            # Skip header row if first cell looks like text (non-numeric)
            data_rows = rows
            if len(rows) > 1:
                try:
                    float(rows[0][0].strip())
                except (ValueError, IndexError):
                    data_rows = rows[1:]

            # Filter out footer rows (MAX/MIN/AVG etc.)
            data_rows = [r for r in data_rows if r and not _is_footer_row(r[0])]

            if not data_rows:
                return None

            last_row = data_rows[-1]
            result = {i: v.strip() for i, v in enumerate(last_row)}

            self._last_mtime = mtime
            self._last_row = result
            return result

        except Exception as e:
            log.error(f"CSV read error ({self.path}): {e}")
            return None

    def get_latest_values(self, parameters: list[dict]) -> list[dict]:
        """Map CSV column positions to parameter values."""
        row = self._read_last_row()

        csv_ts = None
        if row and self.csv_timestamp_col is not None and self.csv_timestamp_col >= 0:
            raw_ts = row.get(self.csv_timestamp_col)
            if raw_ts:
                csv_ts = parse_csv_timestamp(raw_ts)

        if not row:
            log.warning(f"CSV watcher: no data available from {self.path}")

        return _map_row_to_results(row, parameters, csv_ts)


# ─── Excel Watcher ────────────────────────────────────────────────────────────

class ExcelWatcher:
    """
    Reads the last (most recent) data row from an Excel .xlsx file.
    - Automatically skips header rows (rows where the first cell is not a timestamp)
    - Automatically skips footer rows (MAX / MIN / AVG / SUM / formula rows)
    - Uses column position (register_address) to map values to parameters.

    File format expected (like 24.06.2026 Daily Rep..xlsx):
        Row 1:  "Date"  (title / label row — skipped)
        Row 2:  Column headers  (e.g. NOX, PM10 … — skipped)
        Row 3:  Units row  (e.g. ppb, ppb … — skipped)
        Row 4+: Hourly data  (timestamp, value, value, …)
        Last rows: MAX / MIN / AVG summary  (skipped automatically)
    """

    # How many leading rows to skip before looking for timestamp data
    HEADER_ROWS = 3

    def __init__(
        self,
        path: str,
        poll_interval: int = 60,
        xlsx_timestamp_col: Optional[int] = 0,
    ):
        self.path = path
        self.poll_interval = poll_interval
        self.xlsx_timestamp_col = xlsx_timestamp_col if xlsx_timestamp_col is not None else 0
        self._last_mtime: Optional[float] = None
        self._last_row: Optional[dict] = None

    def _read_last_row(self) -> Optional[dict]:
        """
        Read the last valid data row from the .xlsx file.
        Returns {col_index: value} where values are already Python native types.
        """
        if not os.path.exists(self.path):
            log.warning(f"Excel file not found: {self.path}")
            return None

        try:
            mtime = os.path.getmtime(self.path)
            if self._last_mtime == mtime and self._last_row is not None:
                return self._last_row

            try:
                import openpyxl
            except ImportError:
                log.error("openpyxl is not installed. Run: pip install openpyxl")
                return None

            # data_only=True evaluates cached formula results instead of returning formula strings
            wb = openpyxl.load_workbook(self.path, data_only=True, read_only=True)
            ws = wb.active
            if ws is None:
                log.warning(f"Excel file has no active sheet: {self.path}")
                wb.close()
                return None

            # Collect all rows as tuples of raw values
            all_rows = list(ws.iter_rows(values_only=True))
            wb.close()

            if not all_rows:
                log.warning(f"Excel file is empty: {self.path}")
                return None

            # ── Smart header detection ─────────────────────────────────────
            # Skip rows until we find one whose first cell looks like a timestamp
            data_rows = []
            for row in all_rows:
                if not row or row[0] is None:
                    continue
                first = str(row[0]).strip()
                # Check if first cell is a datetime object or a parseable timestamp string
                if isinstance(row[0], datetime):
                    data_rows.append(row)
                elif parse_csv_timestamp(first) is not None:
                    data_rows.append(row)
                elif data_rows:
                    # Already collecting data rows; this might be a footer
                    if _is_footer_row(first) or _is_formula(row[0]):
                        continue  # skip footer/formula rows
                    # Might be a continuation; try to include
                    data_rows.append(row)

            if not data_rows:
                log.warning(f"Excel: no valid data rows found in {self.path}")
                return None

            # Use the last data row
            last_row = data_rows[-1]
            result = {i: v for i, v in enumerate(last_row) if v is not None}

            self._last_mtime = mtime
            self._last_row = result
            return result

        except Exception as e:
            log.error(f"Excel read error ({self.path}): {e}")
            return None

    def get_latest_values(self, parameters: list[dict]) -> list[dict]:
        """Map Excel column positions to parameter values."""
        row = self._read_last_row()

        csv_ts = None
        if row and self.xlsx_timestamp_col >= 0:
            ts_raw = row.get(self.xlsx_timestamp_col)
            if isinstance(ts_raw, datetime):
                csv_ts = ts_raw
            elif ts_raw is not None:
                csv_ts = parse_csv_timestamp(str(ts_raw))

        if not row:
            log.warning(f"Excel watcher: no data available from {self.path}")

        return _map_row_to_results(row, parameters, csv_ts)


# ─── Daily filename renderer ──────────────────────────────────────────────────

def render_daily_csv_filename(pattern: str, target_date: date) -> str:
    """
    Render UltrON's daily file date tokens for a target date.

    Supported tokens:
      {YYYYMMDD}          → 20260624
      {YYYY-MM-DD}        → 2026-06-24
      {DD-MM-YYYY}        → 24-06-2026
      {DDMMYYYY}          → 24062026
      {DD.MM.YYYY}        → 24.06.2026   ← for daily Excel reports
      {date}              → 20260624

    Example patterns:
      "{YYYYMMDD}.csv"
      "{DD-MM-YYYY} Daily Report.csv"
      "{DD.MM.YYYY} Daily Rep..xlsx"
    """
    token_values = {
        "{YYYYMMDD}":   target_date.strftime("%Y%m%d"),
        "{YYYY-MM-DD}": target_date.strftime("%Y-%m-%d"),
        "{DD-MM-YYYY}": target_date.strftime("%d-%m-%Y"),
        "{DDMMYYYY}":   target_date.strftime("%d%m%Y"),
        "{DD.MM.YYYY}": target_date.strftime("%d.%m.%Y"),
        "{date}":       target_date.strftime("%Y%m%d"),
    }
    filename = pattern or "{YYYYMMDD}.csv"
    for token, value in token_values.items():
        filename = filename.replace(token, value)
    return filename


# ─── Daily CSV Watcher ────────────────────────────────────────────────────────

class DailyCSVWatcher(CSVWatcher):
    """
    Resolves a date-patterned CSV file in a folder each poll.
    Today's file is preferred; yesterday is used as a midnight rollover fallback.
    """

    def __init__(
        self,
        folder: str,
        filename_pattern: str = "{YYYYMMDD}.csv",
        delimiter: str = ",",
        poll_interval: int = 60,
        csv_timestamp_col: Optional[int] = 0,
    ):
        super().__init__("", delimiter, poll_interval, csv_timestamp_col)
        self.folder = folder
        self.filename_pattern = filename_pattern or "{YYYYMMDD}.csv"

    def resolve_path(self, now: Optional[datetime] = None) -> str:
        now = now or datetime.now()
        folder = Path(self.folder)
        today_path = folder / render_daily_csv_filename(self.filename_pattern, now.date())
        if today_path.exists():
            return str(today_path)

        yesterday = now.date() - timedelta(days=1)
        yesterday_path = folder / render_daily_csv_filename(self.filename_pattern, yesterday)
        if yesterday_path.exists():
            log.warning(f"Daily CSV: today's file missing, using yesterday's: {yesterday_path}")
            return str(yesterday_path)

        return str(today_path)

    def _read_last_row(self) -> Optional[dict]:
        resolved_path = self.resolve_path()
        if resolved_path != self.path:
            self.path = resolved_path
            self._last_mtime = None
            self._last_row = None
        return super()._read_last_row()


# ─── Daily Excel Watcher ──────────────────────────────────────────────────────

class DailyExcelWatcher(ExcelWatcher):
    """
    Resolves a date-patterned .xlsx file in a folder each poll.
    Today's file is preferred; yesterday is used as a midnight rollover fallback.

    Example:
        folder  = r"C:\\Users\\sunsh\\OneDrive\\Desktop"
        pattern = "{DD.MM.YYYY} Daily Rep..xlsx"
        → resolves to "24.06.2026 Daily Rep..xlsx" for today 2026-06-24
    """

    def __init__(
        self,
        folder: str,
        filename_pattern: str = "{DD.MM.YYYY} Daily Rep..xlsx",
        poll_interval: int = 60,
        xlsx_timestamp_col: Optional[int] = 0,
    ):
        super().__init__("", poll_interval, xlsx_timestamp_col)
        self.folder = folder
        self.filename_pattern = filename_pattern or "{DD.MM.YYYY} Daily Rep..xlsx"

    def resolve_path(self, now: Optional[datetime] = None) -> str:
        now = now or datetime.now()
        folder = Path(self.folder)
        today_path = folder / render_daily_csv_filename(self.filename_pattern, now.date())
        if today_path.exists():
            return str(today_path)

        yesterday = now.date() - timedelta(days=1)
        yesterday_path = folder / render_daily_csv_filename(self.filename_pattern, yesterday)
        if yesterday_path.exists():
            log.warning(f"Daily Excel: today's file missing, using yesterday's: {yesterday_path}")
            return str(yesterday_path)

        log.warning(f"Daily Excel: no file found for today or yesterday: {today_path}")
        return str(today_path)

    def _read_last_row(self) -> Optional[dict]:
        resolved_path = self.resolve_path()
        if resolved_path != self.path:
            self.path = resolved_path
            self._last_mtime = None
            self._last_row = None
        return super()._read_last_row()


# ─── Smart Watcher (auto CSV / Excel) ────────────────────────────────────────

class SmartWatcher:
    """
    Single watcher that auto-detects whether to use CSVWatcher or ExcelWatcher
    based on the file extension (.csv → CSVWatcher, .xlsx/.xls → ExcelWatcher).
    """

    def __init__(
        self,
        path: str,
        delimiter: str = ",",
        poll_interval: int = 60,
        timestamp_col: Optional[int] = 0,
    ):
        ext = Path(path).suffix.lower()
        if ext in (".xlsx", ".xls"):
            self._watcher = ExcelWatcher(path, poll_interval, timestamp_col)
        else:
            self._watcher = CSVWatcher(path, delimiter, poll_interval, timestamp_col)

    def get_latest_values(self, parameters: list[dict]) -> list[dict]:
        return self._watcher.get_latest_values(parameters)


class DailySmartWatcher:
    """
    Single watcher that auto-detects whether to use DailyCSVWatcher or DailyExcelWatcher
    based on the filename_pattern extension.

    Example patterns:
      "{YYYYMMDD}.csv"                   → DailyCSVWatcher
      "{DD.MM.YYYY} Daily Rep..xlsx"     → DailyExcelWatcher
    """

    def __init__(
        self,
        folder: str,
        filename_pattern: str = "{YYYYMMDD}.csv",
        delimiter: str = ",",
        poll_interval: int = 60,
        timestamp_col: Optional[int] = 0,
    ):
        ext = Path(filename_pattern).suffix.lower()
        if ext in (".xlsx", ".xls"):
            self._watcher = DailyExcelWatcher(folder, filename_pattern, poll_interval, timestamp_col)
            log.info(f"DailySmartWatcher → Excel mode | folder={folder} | pattern={filename_pattern}")
        else:
            self._watcher = DailyCSVWatcher(folder, filename_pattern, delimiter, poll_interval, timestamp_col)
            log.info(f"DailySmartWatcher → CSV mode | folder={folder} | pattern={filename_pattern}")

    def resolve_path(self, now=None) -> str:
        return self._watcher.resolve_path(now)

    def get_latest_values(self, parameters: list[dict]) -> list[dict]:
        return self._watcher.get_latest_values(parameters)
