"""Snapshot ingest: detect format from content, decode, parse in chunks, write staging Parquet.

Every source value is kept as text; typing happens later under a versioned mapping. Each staged row
carries `__row`, the 1-based record number in the source file (header excluded; for XES the event order).
"""

import codecs
import csv
import gzip
import io
import re
import shutil
import zipfile
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.csv as pacsv
import pyarrow.parquet as pq
from lxml import etree

ROW_COL = "__row"
PREVIEW_ROWS = 50
MAX_ERROR_SAMPLES = 50
MAX_CELL = 200
CHUNK = 1 << 20


class InvalidFile(Exception):
    """A non-retryable problem with the uploaded file itself."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


# ---------------------------------------------------------------- format detection


def _sniff_kind(head: bytes) -> str:
    if head.startswith(b"PK\x03\x04"):
        return "zip"
    if head.startswith(b"\x1f\x8b"):
        return "gzip"
    if b"\x00" in head[:8192] and not head.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        raise InvalidFile("unsupported_format", "File biner tidak dikenali; gunakan CSV, XES, XES.GZ, atau ZIP.")
    text = head.lstrip(codecs.BOM_UTF8).lstrip()
    if text.startswith(b"<"):
        if b"<log" not in head[:65536]:
            raise InvalidFile("unsupported_format", "File XML bukan event log XES (elemen <log> tidak ditemukan).")
        return "xes"
    return "csv"


def _read_head(path: Path, n: int = 65536) -> bytes:
    with open(path, "rb") as f:
        return f.read(n)


def _copy_limited(src, dest: Path, max_bytes: int) -> int:
    total = 0
    with open(dest, "wb") as out:
        while chunk := src.read(CHUNK):
            total += len(chunk)
            if total > max_bytes:
                raise InvalidFile("too_large", "Hasil ekstraksi melebihi batas 2 GiB.")
            out.write(chunk)
    return total


def _unpack(path: Path, workdir: Path, max_bytes: int) -> tuple[str, Path]:
    """Returns (format label, path of the CSV/XES text to parse)."""
    kind = _sniff_kind(_read_head(path))
    if kind == "zip":
        try:
            zf = zipfile.ZipFile(path)
        except zipfile.BadZipFile as e:
            raise InvalidFile("corrupt_archive", "Arsip ZIP rusak.") from e
        members = [m for m in zf.infolist() if not m.is_dir() and not m.filename.startswith("__MACOSX/") and not Path(m.filename).name.startswith(".")]
        if len(members) != 1:
            raise InvalidFile("archive_members", f"ZIP harus berisi tepat satu file CSV/XES; ditemukan {len(members)}.")
        if members[0].file_size > max_bytes:
            raise InvalidFile("too_large", "Isi arsip melebihi batas 2 GiB.")
        inner = workdir / "extracted"
        try:
            with zf.open(members[0]) as src:
                _copy_limited(src, inner, max_bytes)
        except (zipfile.BadZipFile, EOFError, OSError) as e:
            raise InvalidFile("corrupt_archive", "Arsip ZIP rusak atau terenkripsi.") from e
        inner_kind = _sniff_kind(_read_head(inner))
        if inner_kind not in ("csv", "xes"):
            raise InvalidFile("unsupported_format", "Isi ZIP harus CSV atau XES.")
        return f"zip/{inner_kind}", inner
    if kind == "gzip":
        inner = workdir / "gunzipped"
        try:
            with gzip.open(path, "rb") as src:
                _copy_limited(src, inner, max_bytes)
        except (OSError, EOFError) as e:
            raise InvalidFile("corrupt_archive", "File GZIP rusak.") from e
        if _sniff_kind(_read_head(inner)) != "xes":
            raise InvalidFile("unsupported_format", "File GZIP hanya didukung untuk XES (.xes.gz).")
        return "xes.gz", inner
    return kind, path


# ---------------------------------------------------------------- CSV


def _transcode(path: Path, workdir: Path) -> tuple[str, Path]:
    """Strict UTF-8 first; otherwise cp1252 (latin-1 for bytes cp1252 leaves undefined), re-encoded to UTF-8."""
    dec = codecs.getincrementaldecoder("utf-8-sig")()
    try:
        with open(path, "rb") as f:
            while chunk := f.read(CHUNK):
                dec.decode(chunk)
            dec.decode(b"", final=True)
        return "utf-8", path
    except UnicodeDecodeError:
        pass
    for enc in ("cp1252", "latin-1"):
        out = workdir / f"transcoded-{enc}.csv"
        try:
            with open(path, "r", encoding=enc, newline="") as src, open(out, "w", encoding="utf-8", newline="") as dst:
                shutil.copyfileobj(src, dst, CHUNK)
            return enc, out
        except UnicodeDecodeError:
            continue
    raise InvalidFile("encoding", "Encoding file tidak dikenali.")


def _sniff_delimiter(sample: str) -> str:
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        counts = {d: sample.splitlines()[0].count(d) if sample else 0 for d in ",;\t|"}
        return max(counts, key=counts.get) if any(counts.values()) else ","


def _clean_header(names: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    out = []
    for i, raw in enumerate(names):
        name = (raw or "").strip().lstrip("﻿") or f"kolom_{i + 1}"
        if name == ROW_COL:
            name = f"{name}_src"
        base = name
        n = seen.get(base, 0)
        if n:
            name = f"{base}_{n + 1}"
        seen[base] = n + 1
        out.append(name)
    return out


def _parse_csv(path: Path, workdir: Path, report: dict) -> Path:
    encoding, text_path = _transcode(path, workdir)
    report["encoding"] = encoding
    if encoding != "utf-8":
        report["reviewReasons"].append(f"Encoding terdeteksi {encoding}, bukan UTF-8. Periksa karakter khusus pada preview sebelum menyetujui.")
    with open(text_path, "r", encoding="utf-8-sig", newline="") as f:
        sample = f.read(65536)
    if not sample.strip():
        raise InvalidFile("empty", "File kosong.")
    delimiter = _sniff_delimiter(sample)
    report["delimiter"] = delimiter
    header = next(csv.reader(io.StringIO(sample), delimiter=delimiter), [])
    columns = _clean_header(header)
    if len(columns) < 2:
        raise InvalidFile("schema", "CSV harus memiliki header dan minimal dua kolom.")
    report["columns"] = columns

    errors = report["errorSamples"]

    def on_invalid(row):
        report["invalidRowCount"] += 1
        if len(errors) < MAX_ERROR_SAMPLES:
            errors.append({"row": row.number, "message": f"Jumlah kolom {row.actual_columns}, seharusnya {row.expected_columns}"})
        return "skip"

    reader = pacsv.open_csv(
        text_path,
        read_options=pacsv.ReadOptions(column_names=columns, skip_rows=1, block_size=8 << 20, encoding="utf8"),
        parse_options=pacsv.ParseOptions(delimiter=delimiter, newlines_in_values=True, invalid_row_handler=on_invalid),
        convert_options=pacsv.ConvertOptions(column_types={c: pa.string() for c in columns}, strings_can_be_null=True, quoted_strings_can_be_null=False),
    )
    schema = pa.schema([pa.field(ROW_COL, pa.int64())] + [pa.field(c, pa.string()) for c in columns])
    out = workdir / "staging.parquet"
    row = 0
    with pq.ParquetWriter(out, schema, compression="zstd") as writer:
        try:
            for batch in reader:
                n = batch.num_rows
                if not n:
                    continue
                rows = pa.array(range(row + 1, row + n + 1), pa.int64())
                writer.write_batch(pa.RecordBatch.from_arrays([rows] + [batch.column(c) for c in columns], schema=schema))
                row += n
        except pa.ArrowInvalid as e:
            raise InvalidFile("parse", f"CSV tidak dapat dibaca setelah baris {row}: {str(e)[:200]}") from e
    report["rowCount"] = row
    return out


# ---------------------------------------------------------------- XES


def _local(tag) -> str:
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def _parse_xes(path: Path, workdir: Path, report: dict) -> Path:
    head = _read_head(path, 1 << 16)
    if re.search(rb"<!DOCTYPE|<!ENTITY", head, re.I):
        raise InvalidFile("xml_doctype", "XES dengan DOCTYPE/ENTITY ditolak demi keamanan (XXE).")
    report["encoding"] = "utf-8"
    parts = workdir / "xes-parts"
    parts.mkdir()
    rows: list[dict] = []
    part = 0
    row = 0
    case_attrs: dict = {}
    event: dict | None = None
    depth_trace = False
    depth = 0  # nested list/container attributes are skipped

    def flush():
        nonlocal rows, part
        if rows:
            cols = sorted({k for r in rows for k in r})
            table = pa.table({c: pa.array([r.get(c) for r in rows], pa.int64() if c == ROW_COL else pa.string()) for c in cols})
            pq.write_table(table, parts / f"part-{part:05d}.parquet")
            part += 1
            rows = []

    try:
        ctx = etree.iterparse(str(path), events=("start", "end"), resolve_entities=False, no_network=True, huge_tree=True, load_dtd=False)
        for ev, el in ctx:
            name = _local(el.tag)
            if ev == "start":
                if name == "trace":
                    depth_trace, case_attrs = True, {}
                elif name == "event" and depth_trace:
                    event = {}
                elif name in ("list", "container"):
                    depth += 1
                continue
            # end
            if name in ("list", "container"):
                depth -= 1
            elif name in ("string", "date", "int", "float", "boolean", "id") and depth == 0:
                key, value = el.get("key"), el.get("value")
                if key is not None:
                    if event is not None:
                        event[key] = value
                    elif depth_trace:
                        case_attrs[f"case:{key}"] = value
            elif name == "event" and event is not None:
                row += 1
                rows.append({ROW_COL: row, **case_attrs, **event})
                event = None
                if len(rows) >= 50_000:
                    flush()
            elif name == "trace":
                depth_trace = False
            if name in ("event", "trace"):
                el.clear()
    except etree.XMLSyntaxError as e:
        raise InvalidFile("parse", f"XES tidak valid: {str(e)[:200]}") from e
    flush()
    if row == 0:
        raise InvalidFile("empty", "XES tidak memuat event.")
    out = workdir / "staging.parquet"
    con = duckdb.connect()
    con.execute(f"COPY (SELECT * FROM read_parquet('{(parts / '*.parquet').as_posix()}', union_by_name=true) ORDER BY {ROW_COL}) TO '{out.as_posix()}' (FORMAT parquet, COMPRESSION zstd)")
    con.close()
    report["columns"] = [c for c in pq.read_schema(out).names if c != ROW_COL]
    report["rowCount"] = row
    return out


# ---------------------------------------------------------------- suggestions and entry point

_XES_DEFAULTS = {
    "caseId": "case:concept:name",
    "activity": "concept:name",
    "timestamp": "time:timestamp",
    "resource": "org:resource",
    "lifecycle": "lifecycle:transition",
    "eventId": "identity:id",
}

_CSV_HINTS = {
    "caseId": ("case_id", "caseid", "case", "case id", "case:concept:name", "id kasus", "kasus"),
    "activity": ("activity", "aktivitas", "activity_name", "event", "concept:name", "task"),
    "timestamp": ("timestamp", "complete_timestamp", "end_time", "time", "waktu", "time:timestamp", "completed", "date"),
    "startTimestamp": ("start_timestamp", "start_time", "start", "waktu_mulai"),
    "resource": ("resource", "user", "org:resource", "pelaksana", "actor"),
    "eventId": ("event_id", "eventid", "id_event"),
    "lifecycle": ("lifecycle", "lifecycle:transition"),
}


def suggest_mapping(columns: list[str], fmt: str) -> dict:
    if fmt.endswith("xes"):
        return {k: v for k, v in _XES_DEFAULTS.items() if v in columns}
    lower = {c.lower().strip(): c for c in columns}
    out = {}
    for field, hints in _CSV_HINTS.items():
        for h in hints:
            if h in lower and lower[h] not in out.values():
                out[field] = lower[h]
                break
    return out


def _preview(staging: Path, columns: list[str]) -> list[dict]:
    table = pq.ParquetFile(staging).iter_batches(batch_size=PREVIEW_ROWS)
    first = next(table, None)
    if first is None:
        return []
    out = []
    for r in first.to_pylist()[:PREVIEW_ROWS]:
        item = {"__row": str(r[ROW_COL])}
        for c in columns:
            v = r.get(c)
            item[c] = None if v is None else str(v)[:MAX_CELL]
        out.append(item)
    return out


def empty_report() -> dict:
    return {
        "status": "failed", "format": None, "encoding": None, "delimiter": None, "rowCount": 0, "columns": [],
        "preview": [], "errorSamples": [], "invalidRowCount": 0, "reviewReasons": [], "suggestedMapping": {},
        "errorCode": None, "errorMessage": None,
    }


def ingest_file(path: Path, workdir: Path, max_bytes: int) -> tuple[dict, Path | None]:
    """Returns (IngestReport, staging parquet path or None when the file is rejected)."""
    report = empty_report()
    try:
        if path.stat().st_size > max_bytes:
            raise InvalidFile("too_large", "File melebihi batas 2 GiB.")
        fmt, text = _unpack(path, workdir, max_bytes)
        report["format"] = fmt
        staging = _parse_xes(text, workdir, report) if fmt.endswith("xes") or fmt == "xes.gz" else _parse_csv(text, workdir, report)
        if report["rowCount"] == 0:
            raise InvalidFile("empty", "File tidak memuat baris data.")
        report["preview"] = _preview(staging, report["columns"])
        report["suggestedMapping"] = suggest_mapping(report["columns"], fmt)
        if report["invalidRowCount"]:
            report["reviewReasons"].append(f"{report['invalidRowCount']} baris dilewati karena jumlah kolom tidak sesuai.")
        report["status"] = "needs_review" if report["reviewReasons"] else "ready_for_mapping"
        return report, staging
    except InvalidFile as e:
        report["status"], report["errorCode"], report["errorMessage"] = "failed", e.code, str(e)
        return report, None
