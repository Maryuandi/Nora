from pathlib import Path

import duckdb
import pytest

from nora_worker.bpmn import validate_bpmn
from nora_worker.rules import evaluate_rule, summarize

EVENTS = [
    # case, activity, hour, resource, attrs
    ("A", "Create", 0, "ana", '{"Cabang":"Jakarta"}'),
    ("A", "Approve", 2, "bob", '{"Cabang":"Jakarta"}'),
    ("A", "Pay", 30, "ana", '{"Cabang":"Jakarta"}'),
    ("B", "Create", 0, "ana", '{"Cabang":"Bandung"}'),
    ("B", "Pay", 5, "ana", '{"Cabang":"Bandung"}'),
    ("C", "Create", 0, "cici", '{"Cabang":"Jakarta"}'),
    ("C", "Approve", 1, "cici", '{"Cabang":"Jakarta"}'),
    ("D", "Create", 0, None, '{}'),
    ("D", "Approve", 1, None, '{}'),
]


@pytest.fixture
def con():
    c = duckdb.connect()
    c.execute("SET TimeZone='UTC'")
    c.execute("CREATE TABLE raw (case_id VARCHAR, activity VARCHAR, h INT, resource VARCHAR, case_attributes VARCHAR)")
    c.executemany("INSERT INTO raw VALUES (?, ?, ?, ?, ?)", EVENTS)
    c.execute("""CREATE VIEW ev AS SELECT case_id, activity, TIMESTAMPTZ '2026-01-01 00:00:00+00' + h * INTERVAL 1 HOUR AS event_time_utc,
                 resource, case_attributes, row_number() OVER () AS source_row_number, false AS excluded FROM raw""")
    return c


def statuses(rows):
    return {c: s for c, s, _ in rows}


def rule(params, **kw):
    return {"name": "r", "params": params, "scope": {}, **kw}


def test_required_and_forbidden(con):
    assert statuses(evaluate_rule(con, rule({"type": "required_activity", "activity": "Approve"}))) == {"A": "compliant", "B": "non_compliant", "C": "compliant", "D": "compliant"}
    assert statuses(evaluate_rule(con, rule({"type": "forbidden_activity", "activity": "Pay"})))["A"] == "non_compliant"


def test_ordering(con):
    s = statuses(evaluate_rule(con, rule({"type": "ordering", "before": "Approve", "after": "Pay"})))
    assert s["A"] == "compliant" and s["B"] == "non_compliant" and s["C"] == "compliant"


def test_sla_between_activities(con):
    rows = evaluate_rule(con, rule({"type": "sla_duration", "fromActivity": "Create", "toActivity": "Pay", "maxHours": 24}))
    s = statuses(rows)
    assert s["A"] == "non_compliant" and s["B"] == "compliant" and s["C"] == "not_evaluable"


def test_separation_of_duties_needs_resource(con):
    s = statuses(evaluate_rule(con, rule({"type": "separation_of_duties", "activityA": "Create", "activityB": "Approve"})))
    assert s["C"] == "non_compliant" and s["A"] == "compliant" and s["D"] == "not_evaluable"


def test_scope_filters_and_flags_missing_attribute(con):
    rows = evaluate_rule(con, rule({"type": "required_activity", "activity": "Approve"}, scope={"Cabang": ["Jakarta"]}))
    s = statuses(rows)
    assert "B" not in s and s["D"] == "not_evaluable"
    summary = summarize(rows)
    assert summary["notEvaluable"] == 1 and summary["evaluatedCases"] == 3


BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x">
  <process id="p" isExecutable="false">
    <startEvent id="s"/>
    <task id="t1" name="Create PO"/>
    <task id="t2" name="Approve PO"/>
    <endEvent id="e"/>
    <sequenceFlow id="f1" sourceRef="s" targetRef="t1"/>
    <sequenceFlow id="f2" sourceRef="t1" targetRef="t2"/>
    <sequenceFlow id="f3" sourceRef="t2" targetRef="e"/>
  </process>
</definitions>"""


def test_bpmn_valid(tmp_path: Path):
    p = tmp_path / "m.bpmn"
    p.write_text(BPMN)
    r = validate_bpmn(p)
    assert r["valid"] and [t["name"] for t in r["tasks"]] == ["Create PO", "Approve PO"] and r["pm4py"]["transitions"] >= 2


def test_bpmn_xxe_rejected(tmp_path: Path):
    p = tmp_path / "m.bpmn"
    p.write_text('<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><definitions>&x;</definitions>')
    r = validate_bpmn(p)
    assert not r["valid"] and not r["readable"] and "XXE" in r["error"]


def test_bpmn_not_bpmn(tmp_path: Path):
    p = tmp_path / "m.bpmn"
    p.write_text("<root/>")
    assert validate_bpmn(p)["error"].startswith("Bukan dokumen BPMN")
