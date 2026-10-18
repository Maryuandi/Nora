import gzip
import json
from pathlib import Path

from nora_worker.analysis import END, START, run_process_analysis
from nora_worker.dataset import build_dataset
from nora_worker.ingest import ingest_file

CSV = (
    "case,activity,timestamp,branch\n"
    "A,Create,2026-01-01 00:00,J\nA,Approve,2026-01-01 10:00,J\nA,Pay,2026-01-02 00:00,J\n"
    "B,Create,2026-01-02 00:00,B\nB,Approve,2026-01-02 02:00,B\nB,Approve,2026-01-02 04:00,B\nB,Pay,2026-01-03 04:00,B\n"
    "C,Create,2026-02-01 00:00,J\nC,Pay,2026-02-01 06:00,J\n"
)
CONFIG = {"columns": {"caseId": "case", "activity": "activity", "timestamp": "timestamp", "caseAttributes": ["branch"], "eventAttributes": [], "objectRefs": []},
          "timestampFormat": "auto", "timezone": "UTC", "labelMap": {}, "repairRules": []}


def _events(tmp_path: Path) -> Path:
    src = tmp_path / "log.csv"
    src.write_text(CSV)
    (tmp_path / "i").mkdir()
    _, staging = ingest_file(src, tmp_path / "i", 2**31)
    (tmp_path / "b").mkdir()
    _, events, _ = build_dataset(staging, tmp_path / "b", {"config": CONFIG, "sourceId": "s", "projectPeriod": {"start": "2026-01-01", "end": "2026-12-31"},
                                                            "datasetVersionId": "d", "projectId": "p", "snapshotId": "sn", "mappingVersionId": "m", "processBoundary": None})
    return events


def _run(tmp_path: Path, name: str, filt: dict, boundary=None):
    wd = tmp_path / name
    wd.mkdir()
    return run_process_analysis(EVENTS[0], wd, {"filter": filt, "boundary": boundary, "caseAttributeKeys": ["branch"]})


EVENTS: list[Path] = []  # built once per module


def setup_module(module):
    import tempfile

    EVENTS.append(_events(Path(tempfile.mkdtemp())))


def edge(result, f, t):
    return next(e for e in result["edges"] if e["from"] == f and e["to"] == t)


def test_edges_counts_and_waits(tmp_path):
    r, files, _ = _run(tmp_path, "a", {"completion": "all"})
    e = edge(r, "Create", "Approve")
    assert e["count"] == 2 and e["caseCount"] == 2 and e["medianSeconds"] == 6 * 3600
    loop = edge(r, "Approve", "Approve")
    assert loop["count"] == 1
    assert edge(r, START, "Create")["count"] == 3 and edge(r, "Pay", END)["count"] == 3
    assert r["coverage"]["cases"] == 3 and r["startSource"] == "observed"
    assert abs(sum(x["contributionShare"] for x in r["edges"]) - 1) < 1e-9
    assert r["variants"][0]["caseCount"] == 1 and len(r["variants"]) == 3


def test_drilldown_rows_match_aggregate_counts(tmp_path):
    r, files, _ = _run(tmp_path, "b", {"completion": "all"})
    rows = [json.loads(l) for l in gzip.open(files["caseRows"], "rt")]
    cases = {x[1] for x in rows if x[0] == "e" and x[2] == "Create" and x[3] == "Approve"}
    assert len(cases) == edge(r, "Create", "Approve")["caseCount"]
    node_cases = {x[1] for x in rows if x[0] == "n" and x[2] == "Approve"}
    assert len(node_cases) == next(n for n in r["nodes"] if n["id"] == "Approve")["caseCount"]


def test_filters(tmp_path):
    r, _, _ = _run(tmp_path, "c", {"period": {"from": "2026-01-01", "to": "2026-01-31"}, "attribute": {"key": "branch", "values": ["J"]}, "completion": "all"})
    assert r["coverage"]["cases"] == 1 and r["coverage"]["datasetCases"] == 3
    assert {v["value"] for v in r["attributeValues"]["branch"]} == {"J", "B"}


def test_zero_cases_reason(tmp_path):
    r, _, _ = _run(tmp_path, "d", {"attribute": {"key": "branch", "values": ["X"]}, "completion": "all"})
    assert not r["mapAvailable"] and "0 kasus" in r["unavailableReason"]


def test_boundary_marks_start(tmp_path):
    r, _, w = _run(tmp_path, "e", {"completion": "complete"}, {"startActivities": ["Create"], "endActivities": ["Pay"]})
    assert r["startSource"] == "context" and next(n for n in r["nodes"] if n["id"] == "Create")["boundaryStart"]
    assert r["coverage"]["cases"] == 3 and not w
