"""
UltrON — CSV File Watcher Service
Reads the latest row from a CSV file for poll-based ingestion.
Supports header-row CSVs and headerless (positional) CSVs.
"""

import csv
import os
from pathlib import Path
from typing import Optional
from datetime import date, datetime, timedelta
from app.core.logger import get_logger

log = get_logger("ultron.csv_watcher")


def parse_csv_timestamp(raw_str: str) -> Optional[datetime]:
    if not raw_str:
        return None
    raw_str = raw_str.strip()
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


class CSVWatcher:
    """
    Reads the last (most recent) row from a CSV file.
    Uses column position (register_address) to map values to parameters.
    """

    def __init__(self, path: str, delimiter: str = ",", poll_interval: int = 60, csv_timestamp_col: Optional[int] = None):
        self.path = path
        self.delimiter = delimiter
        self.poll_interval = poll_interval
        self.csv_timestamp_col = csv_timestamp_col
        self._last_mtime: Optional[float] = None
        self._last_row: Optional[dict] = None   # col_index → str_value

    def _read_last_row(self) -> Optional[dict]:
        """
        Read the last data row from the CSV. Returns {col_index: value_str}.
        Handles both header and headerless CSV formats.
        """
        if not os.path.exists(self.path):
            log.warning(f"CSV file not found: {self.path}")
            return None

        try:
            mtime = os.path.getmtime(self.path)
            # Use cached row if file hasn't changed
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
                    data_rows = rows[1:]   # skip header row

            if not data_rows:
                return None

            # Use the last row (most recent reading)
            last_row = data_rows[-1]
            result = {i: v.strip() for i, v in enumerate(last_row)}

            self._last_mtime = mtime
            self._last_row = result
            return result

        except Exception as e:
            log.error(f"CSV read error ({self.path}): {e}")
            return None

    def get_latest_values(self, parameters: list[dict]) -> list[dict]:
        """
        Map CSV column positions to parameter values.
        Uses parameter['register_address'] as the column index (0-based).
        """
        row = self._read_last_row()
        
        # Parse timestamp if csv_timestamp_col is specified
        csv_ts = None
        if row and self.csv_timestamp_col is not None and self.csv_timestamp_col >= 0:
            raw_ts = row.get(self.csv_timestamp_col)
            if raw_ts:
                csv_ts = parse_csv_timestamp(raw_ts)

        results = []

        for p in parameters:
            col_idx = p.get("register_address", 0)
            raw_str = row.get(col_idx) if row else None

            # Parse numeric value — handle common sentinel values
            raw_val: Optional[float] = None
            if raw_str not in (None, "", "N/A", "NA", "---", "null", "NULL", "nan"):
                try:
                    raw_val = float(raw_str.replace(",", ""))  # handle thousands separator
                except (ValueError, TypeError):
                    log.debug(f"CSV non-numeric value at col {col_idx}: '{raw_str}'")

            quality = "U" if raw_val is not None else "U"
            value: Optional[float] = None

            if raw_val is not None:
                sf = p.get("scale_factor", 1.0) or 1.0
                off = p.get("offset", 0.0) or 0.0
                value = (raw_val * sf) + off

            results.append({
                "parameter_id": p["id"],
                "value": value,
                "raw_value": raw_val,
                "quality": quality,
                "timestamp": csv_ts,
            })

        if not row:
            log.warning(f"CSV watcher: no data available from {self.path}")

        return results


def render_daily_csv_filename(pattern: str, target_date: date) -> str:
    """
    Render UltrON's daily CSV date tokens for a target date.
    Supported tokens are literal, e.g. {YYYYMMDD}.csv or data_{DD-MM-YYYY}.csv.
    """
    token_values = {
        "{YYYYMMDD}": target_date.strftime("%Y%m%d"),
        "{YYYY-MM-DD}": target_date.strftime("%Y-%m-%d"),
        "{DD-MM-YYYY}": target_date.strftime("%d-%m-%Y"),
        "{DDMMYYYY}": target_date.strftime("%d%m%Y"),
        "{date}": target_date.strftime("%Y%m%d"),
    }
    filename = pattern or "{YYYYMMDD}.csv"
    for token, value in token_values.items():
        filename = filename.replace(token, value)
    return filename


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
            log.warning(f"Daily CSV today's file missing, using yesterday fallback: {yesterday_path}")
            return str(yesterday_path)

        return str(today_path)

    def _read_last_row(self) -> Optional[dict]:
        resolved_path = self.resolve_path()
        if resolved_path != self.path:
            self.path = resolved_path
            self._last_mtime = None
            self._last_row = None
        return super()._read_last_row()
