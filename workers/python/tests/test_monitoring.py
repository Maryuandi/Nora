import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from nora_worker.dataset import build_dataset
from nora_worker.ingest import ingest_file
from nora_worker.monitoring import run_monitoring

CFG = {
    "bottleneck": {"topK": 3, "minP90Seconds": 24 * 3600, "minSupportCases": 5},
    "rework": {"minCaseShare": 0.1, "minSupportCases": 5},
    "rules": {"minNonCompliantShare": 0.05, "minSupportCases": 3},
    "conformance": {"minFitness": 0.95, "minSupportCases": 3},
    "backlog": {"minSupportCases": 1000},
    "trend": {"minRelativeIncrease": 0.2, "minCasesPerWindow": 20},
    "smallSampleCases": 100,
}
BOUNDARY = {"startActivities": ["Create PO"], "endActivities": ["Pay Invoice"]}
BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x"><process id="p">
<startEvent id="s"/><task id="t1" name="Create PO"/><task id="t2" name="Approve PO"/><task id="t3" name="Receive Goods"/><task id="t4" name="Pay Invoice"/><endEvent id="e"/>
<sequenceFlow id="f1" sourceRef="s" targetRef="t1"/><sequenceFlow id="f2" sourceRef="t1" targetRef="t2"/><sequenceFlow id="f3" sourceRef="t2" targetRef="t3"/>
<sequenceFlow id="f4" sourceRef="t3" targetRef="t4"/><sequenceFlow id="f5" sourceRef="t4" targetRef="e"/></process></definitions>"""


def _csv(cases=40) -> str:
    rows = ["case_id,activity,timestamp,user"]
    base = datetime(2026, 1, 5, 1)
    for i in range(1, cases + 1):
        t = base + timedelta(hours=i)
        seq = [("Create PO", 0, "ana"), ("Approve PO", 2 + (i % 10) * 6, "bob")]
        if i % 4 == 0:
            seq += [("Request Change", 1, "ana"), ("Approve PO", 3, "bob")]
        seq += [("Receive Goods", 24, "cici"), ("Pay Invoice", 48 + (i % 5) * 24, "bob" if i % 7 == 0 else "dedi")]
        for a, h, u in seq:
            t += timedelta(hours=h)
            rows.append(f"PO-{i:04d},{a},{t:%Y-%m-%d %H:%M},{u}")
    return "\n".join(rows) + "\n"


@pytest.fixture(scope="module")
def events():
    d = Path(tempfile.mkdtemp())
    (d / "log.csv").write_text(_csv())
    (d / "i").mkdir()
    _, staging = ingest_file(d / "log.csv", d / "i", 2**31)
    (d / "b").mkdir()
    cfg = {"columns": {"caseId": "case_id", "activity": "activity", "timestamp": "timestamp", "resource": "user", "caseAttributes": [], "eventAttributes": [], "objectRefs": []},
           "timestampFormat": "auto", "timezone": "UTC", "labelMap": {}, "repairRules": []}
    _, ev, _ = build_dataset(staging, d / "b", {"config": cfg, "sourceId": "s", "projectPeriod": {"start": "2026-01-01", "end": "2026-12-31"}, "datasetVersionId": "d",
                                                 "projectId": "p", "snapshotId": "sn", "mappingVersionId": "m", "processBoundary": None})
    (d / "m.bpmn").write_text(BPMN)
    return ev, d / "m.bpmn"


def run(tmp_path, events, **over):
    ev, bpmn_path = events
    inp = {"filter": {"completion": "all"}, "boundary": BOUNDARY, "rework": None, "rules": [], "bpmn": None, "bpmnUnavailableReason": None, "config": CFG, **over}
    if inp.get("bpmn"):
        inp["_bpmnPath"] = str(bpmn_path)
    wd = tmp_path / "w"
    wd.mkdir()
    return run_monitoring(ev, wd, inp)


def m(result, key):
    return next(x for x in result["metrics"] if x["key"] == key)


def test_metrics(tmp_path, events):
    r, _ = run(tmp_path, events)
    assert m(r, "cases_started")["value"] == 40 and m(r, "cases_completed")["value"] == 40 and m(r, "cases_open")["value"] == 0
    assert m(r, "case_duration_median")["value"] > 0 and m(r, "case_duration_median")["smallSample"]
    assert not m(r, "rework_case_share")["available"] and "rework" in m(r, "rework_case_share")["reason"]


def test_metrics_without_boundary(tmp_path, events):
    r, _ = run(tmp_path, events, boundary=None)
    assert not m(r, "cases_completed")["available"] and m(r, "case_duration_median")["population"]["basis"].startswith("semua kasus")


def test_bottleneck_severity_formula(tmp_path, events):
    r, rows = run(tmp_path, events)
    b = [f for f in r["findings"] if f["type"] == "bottleneck_indication"]
    assert b and all(f["title"].startswith("Indikasi bottleneck") for f in b)
    top = next(t for t in r["transitions"] if t["from"] == b[0]["subject"]["from"] and t["to"] == b[0]["subject"]["to"])
    expect = round(100 * (0.4 * top["contributionShare"] + 0.3 * top["affectedCaseShare"] + 0.3 * min(1, max(0, (top["p90Seconds"] - 86400) / 86400))))
    assert b[0]["severityScore"] == expect
    idx = r["findings"].index(b[0])
    supported = [x for x in rows if x[0] == idx]
    assert len(supported) == top["caseCount"] and supported[0][5] >= supported[-1][5]


def test_rework(tmp_path, events):
    rw = {"rules": [{"type": "repeated_activity", "activity": "Approve PO", "minOccurrences": 2}, {"type": "return_transition", "from": "Request Change", "to": "Approve PO"}]}
    r, rows = run(tmp_path, events, rework=rw)
    assert r["rework"]["caseCount"] == 10 and abs(r["rework"]["caseShare"] - 0.25) < 1e-9
    f = next(f for f in r["findings"] if f["type"] == "high_rework")
    assert len([x for x in rows if x[0] == r["findings"].index(f)]) == 10


def test_rule_finding(tmp_path, events):
    rule = {"id": "11111111-1111-4111-8111-111111111111", "key": "sod", "version": 1,
            "payload": {"name": "SoD", "params": {"type": "separation_of_duties", "activityA": "Approve PO", "activityB": "Pay Invoice"}, "scope": {}}}
    r, rows = run(tmp_path, events, rules=[rule])
    res = r["rules"][0]
    assert res["nonCompliant"] == 5 and res["compliant"] == 35
    f = next(f for f in r["findings"] if f["type"] == "rule_non_compliance")
    assert len([x for x in rows if x[0] == r["findings"].index(f)]) == 5


def test_conformance(tmp_path, events):
    bpmn = {"objectKey": "x", "modelId": "22222222-2222-4222-8222-222222222222", "mappingId": "33333333-3333-4333-8333-333333333333", "mappingVersion": 1,
            "tasks": [{"id": "t1", "name": "Create PO"}, {"id": "t2", "name": "Approve PO"}, {"id": "t3", "name": "Receive Goods"}, {"id": "t4", "name": "Pay Invoice"}],
            "mapping": {"t1": ["Create PO"], "t2": ["Approve PO"], "t3": ["Receive Goods"], "t4": ["Pay Invoice"]}}
    r, _ = run(tmp_path, events, bpmn=bpmn, config={**CFG, "conformance": {"minFitness": 0.99, "minSupportCases": 3}})
    c = r["conformance"]
    assert c["status"] == "available" and 0 < c["fitness"] < 1
    assert any(x["kind"] == "not_in_model" and x["activity"] == "Request Change" for x in c["mismatches"])
    assert any(f["type"] == "bpmn_deviation" for f in r["findings"])


def test_no_finding_is_valid(tmp_path, events):
    strict = {**CFG, "bottleneck": {"topK": 3, "minP90Seconds": 10**9, "minSupportCases": 5}}
    r, rows = run(tmp_path, events, config=strict)
    assert not r["findings"] and not rows and r["transitions"]
