import gzip
import zipfile
from pathlib import Path

import duckdb
import pytest

from nora_worker.dataset import build_dataset, preview_mapping
from nora_worker.ingest import ingest_file

CSV = (
    "case;activity;timestamp;user\n"
    "C1;Create;2024-01-01 08:00;ana\n"
    "C1;Approve;2024-01-01 10:00;bob\n"
    "C1;Pay;2024-01-02 09:00;ana\n"
    "C2;Create;2024-01-03 08:00;ana\n"
    "C2;Approve;bad;bob\n"
)

XES = """<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace><string key="concept:name" value="T1"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T08:00:00+07:00"/><string key="org:resource" value="r1"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-01T09:00:00+07:00"/></event>
  </trace>
</log>"""

CONFIG = {
    "columns": {"caseId": "case", "activity": "activity", "timestamp": "timestamp", "resource": "user", "caseAttributes": [], "eventAttributes": [], "objectRefs": []},
    "timestampFormat": "auto", "timezone": "Asia/Jakarta", "labelMap": {}, "repairRules": [],
}


def _build(tmp_path: Path, staging: Path, config: dict, name: str = "b"):
    wd = tmp_path / name
    wd.mkdir()
    inp = {"config": config, "sourceId": "s1", "projectPeriod": {"start": "2024-01-01", "end": "2024-12-31"}, "datasetVersionId": "d", "projectId": "p",
           "snapshotId": "sn", "mappingVersionId": "m", "processBoundary": None}
    return build_dataset(staging, wd, inp)


def _ingest(tmp_path: Path, name: str, data: bytes):
    src = tmp_path / name
    src.write_bytes(data)
    wd = tmp_path / f"w-{name}"
    wd.mkdir()
    return ingest_file(src, wd, 2**31)


def test_csv_ingest_detects_delimiter_and_rows(tmp_path):
    report, staging = _ingest(tmp_path, "log.txt", CSV.encode())
    assert report["status"] == "ready_for_mapping"
    assert report["format"] == "csv" and report["delimiter"] == ";"
    assert report["rowCount"] == 5 and report["columns"] == ["case", "activity", "timestamp", "user"]
    assert report["suggestedMapping"]["caseId"] == "case"
    assert staging is not None


def test_cp1252_needs_review(tmp_path):
    report, _ = _ingest(tmp_path, "log.csv", "case,activity,timestamp\nC1,Café,2024-01-01\n".encode("cp1252"))
    assert report["status"] == "needs_review" and report["encoding"] == "cp1252"


def test_content_not_extension_decides_format(tmp_path):
    report, _ = _ingest(tmp_path, "log.csv", XES.encode())
    assert report["format"] == "xes"
    assert report["suggestedMapping"] == {"caseId": "case:concept:name", "activity": "concept:name", "timestamp": "time:timestamp", "resource": "org:resource"}


def test_xes_gz_and_zip(tmp_path):
    assert _ingest(tmp_path, "a.xes.gz", gzip.compress(XES.encode()))[0]["format"] == "xes.gz"
    zpath = tmp_path / "z.zip"
    with zipfile.ZipFile(zpath, "w") as z:
        z.writestr("log.csv", CSV)
    assert _ingest(tmp_path, "b.zip", zpath.read_bytes())[0]["format"] == "zip/csv"


def test_zip_with_two_files_rejected(tmp_path):
    zpath = tmp_path / "z.zip"
    with zipfile.ZipFile(zpath, "w") as z:
        z.writestr("a.csv", CSV)
        z.writestr("b.csv", CSV)
    report, staging = _ingest(tmp_path, "c.zip", zpath.read_bytes())
    assert report["status"] == "failed" and report["errorCode"] == "archive_members" and staging is None


def test_xxe_rejected(tmp_path):
    evil = '<?xml version="1.0"?><!DOCTYPE log [<!ENTITY x SYSTEM "file:///etc/passwd">]><log>&x;</log>'
    report, _ = _ingest(tmp_path, "e.xes", evil.encode())
    assert report["errorCode"] == "xml_doctype"


def test_binary_rejected(tmp_path):
    assert _ingest(tmp_path, "x.csv", b"\x00\x01\x02" * 100)[0]["errorCode"] == "unsupported_format"


def test_preview_converts_to_utc(tmp_path):
    _, staging = _ingest(tmp_path, "log.csv", CSV.encode())
    wd = tmp_path / "p"
    wd.mkdir()
    res = preview_mapping(staging, wd, CONFIG, 50)
    assert res["events"][0]["timeUtc"] == "2024-01-01T01:00:00.000Z"
    assert res["events"][4]["issues"]
    assert res["totalRows"] == 5


def test_build_flags_invalid_and_blocks_publish(tmp_path):
    _, staging = _ingest(tmp_path, "log.csv", CSV.encode())
    report, events, cases = _build(tmp_path, staging, CONFIG)
    assert report["qualityStatus"] == "not_ready"
    assert [f["check"] for f in report["findings"]] == ["timestamp_invalid"]
    assert report["findings"][0]["samples"][0]["row"] == 5


def test_repair_rule_excludes_without_deleting(tmp_path):
    _, staging = _ingest(tmp_path, "log.csv", CSV.encode())
    cfg = {**CONFIG, "repairRules": [{"type": "exclude_invalid", "checks": ["timestamp_invalid"]}]}
    report, events, _ = _build(tmp_path, staging, cfg)
    assert report["qualityStatus"] == "ready_with_notes"
    assert report["eventCount"] == 5 and report["excludedEventCount"] == 1
    rows = duckdb.sql(f"SELECT source_row_number, excluded FROM '{events.as_posix()}' ORDER BY row_index").fetchall()
    assert (5, True) in rows


def test_same_input_same_event_uids(tmp_path):
    _, staging = _ingest(tmp_path, "log.csv", CSV.encode())
    _, e1, _ = _build(tmp_path, staging, CONFIG, "x")
    _, e2, _ = _build(tmp_path, staging, CONFIG, "y")
    q = "SELECT list(event_uid ORDER BY row_index) FROM '{}'"
    assert duckdb.sql(q.format(e1.as_posix())).fetchone() == duckdb.sql(q.format(e2.as_posix())).fetchone()


def test_label_map_and_unmapped(tmp_path):
    _, staging = _ingest(tmp_path, "log.csv", CSV.encode())
    cfg = {**CONFIG, "labelMap": {"Create": "Buat PO"}, "requireLabelMap": True}
    report, _, _ = _build(tmp_path, staging, cfg)
    assert any(l["label"] == "Buat PO" for l in report["activityLabels"])
    assert any(f["check"] == "unmapped_activity" for f in report["findings"])


def test_missing_mapping_column_is_rejected(tmp_path):
    _, staging = _ingest(tmp_path, "log.csv", CSV.encode())
    bad = {**CONFIG, "columns": {**CONFIG["columns"], "caseId": "nope"}}
    with pytest.raises(ValueError):
        _build(tmp_path, staging, bad)
