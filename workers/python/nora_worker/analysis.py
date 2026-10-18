"""Process map from canonical events: direct-follows edges on completion timestamps, variants, and a case index.

Events are ordered by (event_time_utc, source_row_number, event_uid), which is the dataset's row_index order.
Only events with excluded = false take part. Waits are measured between consecutive completion timestamps.
"""

import gzip
import json
from pathlib import Path

from nora_worker.dataset import connect, lit

START, END = "__start", "__end"


def _case_filter(f: dict, boundary: dict | None) -> tuple[str, list[str]]:
    terms, warnings = [], []
    period = f.get("period") or {}
    if period.get("from"):
        terms.append(f"c.start_time >= CAST({lit(period['from'])} AS DATE)")
    if period.get("to"):
        terms.append(f"c.start_time < CAST({lit(period['to'])} AS DATE) + INTERVAL 1 DAY")
    attr = f.get("attribute")
    if attr:
        terms.append(f"json_extract_string(c.case_attributes, {lit('$.' + attr['key'])}) IN ({', '.join(lit(v) for v in attr['values'])})")
    for a in f.get("activityPresent") or []:
        terms.append(f"list_contains(c.seq, {lit(a)})")
    for a in f.get("activityAbsent") or []:
        terms.append(f"NOT list_contains(c.seq, {lit(a)})")
    if f.get("variants"):
        terms.append(f"c.variant_hash IN ({', '.join(lit(v) for v in f['variants'])})")
    d = f.get("duration") or {}
    if d.get("minSeconds") is not None:
        terms.append(f"c.duration_s >= {float(d['minSeconds'])}")
    if d.get("maxSeconds") is not None:
        terms.append(f"c.duration_s <= {float(d['maxSeconds'])}")
    completion = f.get("completion") or "all"
    if completion != "all":
        ends = (boundary or {}).get("endActivities") or []
        if not ends:
            warnings.append("Filter status penyelesaian diabaikan: batas proses tidak tersedia.")
        else:
            cond = f"c.last_activity IN ({', '.join(lit(e) for e in ends)})"
            terms.append(cond if completion == "complete" else f"NOT ({cond})")
    if f.get("objectRef"):
        terms.append(f"list_contains(c.objs, {lit(f['objectRef'])})")
    return (" AND ".join(terms) or "true"), warnings


def run_process_analysis(events: Path, workdir: Path, inp: dict) -> tuple[dict, dict[str, Path], list[str]]:
    con = connect(workdir, "UTC")
    boundary = inp.get("boundary")
    con.execute(f"CREATE TEMP VIEW raw AS SELECT * FROM read_parquet({lit(events.as_posix())})")
    ds_events, ds_excluded = con.execute("SELECT count(*) FILTER (WHERE NOT excluded), count(*) FILTER (WHERE excluded) FROM raw").fetchone()
    con.execute("CREATE TEMP TABLE ev AS SELECT * FROM raw WHERE NOT excluded AND case_id IS NOT NULL AND event_time_utc IS NOT NULL")
    con.execute(
        """CREATE TEMP TABLE c AS
           SELECT case_uid, any_value(case_id) AS case_id, any_value(case_attributes) AS case_attributes,
                  min(event_time_utc) AS start_time, max(event_time_utc) AS end_time,
                  epoch(max(event_time_utc)) - epoch(min(event_time_utc)) AS duration_s,
                  count(*) AS event_count, list(activity ORDER BY row_index) AS seq,
                  flatten(list(object_refs)) AS objs, min(row_index) AS row_start, max(row_index) AS row_end
           FROM ev GROUP BY case_uid"""
    )
    con.execute("ALTER TABLE c ADD COLUMN first_activity VARCHAR; ALTER TABLE c ADD COLUMN last_activity VARCHAR; ALTER TABLE c ADD COLUMN variant_hash VARCHAR")
    con.execute("UPDATE c SET first_activity = seq[1], last_activity = seq[len(seq)], variant_hash = substr(sha256(array_to_string(seq, chr(31))), 1, 16)")
    ds_cases = con.execute("SELECT count(*) FROM c").fetchone()[0]

    where, warnings = _case_filter(inp["filter"], boundary)
    con.execute(f"CREATE TEMP TABLE fc AS SELECT * FROM c WHERE {where}")
    con.execute("CREATE TEMP TABLE fev AS SELECT ev.* FROM ev JOIN fc USING (case_uid)")
    n_cases, n_events = con.execute("SELECT count(*), (SELECT count(*) FROM fev) FROM fc").fetchone()

    con.execute(
        """CREATE TEMP TABLE steps AS
           SELECT case_uid, activity AS from_activity,
                  lead(activity) OVER w AS to_activity,
                  epoch(lead(event_time_utc) OVER w) - epoch(event_time_utc) AS wait_s
           FROM fev WINDOW w AS (PARTITION BY case_uid ORDER BY row_index)"""
    )
    con.execute("DELETE FROM steps WHERE to_activity IS NULL")

    starts = set((boundary or {}).get("startActivities") or [])
    ends = set((boundary or {}).get("endActivities") or [])
    node_rows = con.execute(
        f"""SELECT activity, count(*) AS events, count(DISTINCT case_uid) AS cases,
                   (SELECT count(*) FROM fc WHERE first_activity = fev.activity) AS starts,
                   (SELECT count(*) FROM fc WHERE last_activity = fev.activity) AS ends,
                   median(epoch(event_time_utc) - epoch(start_time_utc)) FILTER (WHERE start_time_utc IS NOT NULL AND start_time_utc <= event_time_utc) AS service
            FROM fev GROUP BY activity ORDER BY events DESC, activity"""
    ).fetchall()
    has_start_time = con.execute("SELECT count(*) > 0 FROM fev WHERE start_time_utc IS NOT NULL").fetchone()[0]
    nodes = [{
        "id": a, "label": a, "eventCount": e, "caseCount": k, "caseShare": (k / n_cases) if n_cases else 0.0,
        "startCount": s, "endCount": t, "boundaryStart": a in starts, "boundaryEnd": a in ends,
        "serviceMedianSeconds": float(sv) if sv is not None else None,
    } for a, e, k, s, t, sv in node_rows]

    edge_rows = con.execute(
        """SELECT from_activity, to_activity, count(*), count(DISTINCT case_uid), median(wait_s), quantile_cont(wait_s, 0.9), sum(wait_s)
           FROM steps GROUP BY 1, 2 ORDER BY 7 DESC, 1, 2"""
    ).fetchall()
    total_wait = sum(r[6] or 0 for r in edge_rows) or 0.0
    edges = [{
        "id": f"{f}→{t}", "from": f, "to": t, "count": n, "caseCount": k, "medianSeconds": float(m or 0), "p90Seconds": float(p or 0),
        "totalSeconds": float(s or 0), "contributionShare": (float(s or 0) / total_wait) if total_wait else 0.0,
    } for f, t, n, k, m, p, s in edge_rows]

    # Start/end markers: from the context boundary when present, otherwise observed first/last activities.
    start_source = "context" if starts else "observed"
    if nodes:
        nodes = [{"id": START, "label": "Mulai", "eventCount": 0, "caseCount": n_cases, "caseShare": 1.0, "startCount": 0, "endCount": 0, "boundaryStart": False, "boundaryEnd": False, "serviceMedianSeconds": None}] + nodes + \
                [{"id": END, "label": "Selesai", "eventCount": 0, "caseCount": n_cases, "caseShare": 1.0, "startCount": 0, "endCount": 0, "boundaryStart": False, "boundaryEnd": False, "serviceMedianSeconds": None}]
        for n in nodes[1:-1]:
            if n["startCount"]:
                edges.append({"id": f"{START}→{n['id']}", "from": START, "to": n["id"], "count": n["startCount"], "caseCount": n["startCount"], "medianSeconds": 0.0, "p90Seconds": 0.0, "totalSeconds": 0.0, "contributionShare": 0.0})
            if n["endCount"]:
                edges.append({"id": f"{n['id']}→{END}", "from": n["id"], "to": END, "count": n["endCount"], "caseCount": n["endCount"], "medianSeconds": 0.0, "p90Seconds": 0.0, "totalSeconds": 0.0, "contributionShare": 0.0})

    variants = con.execute(
        """SELECT variant_hash, any_value(seq), count(*) AS n, median(duration_s) FROM fc GROUP BY variant_hash ORDER BY n DESC, variant_hash"""
    ).fetchall()
    cum, var_out = 0, []
    for h, seq, n, med in variants:
        cum += n
        var_out.append({"hash": h, "sequence": list(seq), "caseCount": n, "share": n / n_cases if n_cases else 0.0, "cumulativeShare": cum / n_cases if n_cases else 0.0, "medianDurationSeconds": float(med or 0)})

    dur = con.execute("SELECT median(duration_s), quantile_cont(duration_s, 0.9), avg(duration_s) FROM fc").fetchone()
    pstart, pend = con.execute("SELECT strftime(min(event_time_utc), '%Y-%m-%dT%H:%M:%SZ'), strftime(max(event_time_utc), '%Y-%m-%dT%H:%M:%SZ') FROM fev").fetchone()

    attr_values = {}
    for key in inp.get("caseAttributeKeys") or []:
        rows = con.execute(
            f"SELECT v, count(*) FROM (SELECT json_extract_string(case_attributes, {lit('$.' + key)}) AS v FROM c) WHERE v IS NOT NULL GROUP BY v ORDER BY 2 DESC, 1 LIMIT 50"
        ).fetchall()
        attr_values[key] = [{"value": v, "count": n} for v, n in rows]

    multi = con.execute("SELECT count(*) FROM fc WHERE event_count > 1").fetchone()[0]
    map_available, reason = True, None
    if n_cases == 0:
        map_available, reason = False, "Filter menghasilkan 0 kasus. Longgarkan periode atau atribut."
    elif multi == 0:
        map_available, reason = False, "Semua kasus hanya memiliki satu event, sehingga tidak ada transisi untuk dipetakan. Periksa mapping case ID pada Persiapan."

    result = {
        "nodes": nodes if map_available else [],
        "edges": edges if map_available else [],
        "coverage": {"datasetCases": ds_cases, "datasetEvents": ds_events, "cases": n_cases, "events": n_events, "excludedEvents": ds_excluded, "periodStart": pstart, "periodEnd": pend},
        "startSource": start_source,
        "mapAvailable": map_available,
        "unavailableReason": reason,
        "hasStartTime": bool(has_start_time),
        "attributeValues": attr_values,
        "variants": var_out[:500],
        "caseDuration": {"medianSeconds": dur[0], "p90Seconds": dur[1], "meanSeconds": dur[2]},
    }

    files = {"variants": workdir / "variants.parquet", "caseIndex": workdir / "case-index.parquet", "caseRows": workdir / "case-rows.ndjson.gz"}
    con.execute(f"COPY (SELECT variant_hash, seq, count(*) AS case_count, median(duration_s) AS median_duration_s FROM fc GROUP BY 1, 2 ORDER BY 3 DESC) TO {lit(files['variants'].as_posix())} (FORMAT parquet)")
    con.execute(f"COPY (SELECT case_uid, case_id, start_time, end_time, duration_s, event_count, first_activity, last_activity, variant_hash, row_start, row_end FROM fc ORDER BY case_uid) TO {lit(files['caseIndex'].as_posix())} (FORMAT parquet)")
    with gzip.open(files["caseRows"], "wt", encoding="utf-8") as out:
        for r in con.execute("SELECT case_uid, case_id, strftime(start_time, '%Y-%m-%dT%H:%M:%S.%gZ'), strftime(end_time, '%Y-%m-%dT%H:%M:%S.%gZ'), duration_s, event_count, first_activity, last_activity, variant_hash, row_start, row_end FROM fc ORDER BY case_uid").fetchall():
            out.write(json.dumps(["c", *r]) + "\n")
        for r in con.execute("SELECT case_uid, from_activity, to_activity, count(*), sum(wait_s), max(wait_s) FROM steps GROUP BY 1, 2, 3 ORDER BY 1, 2, 3").fetchall():
            out.write(json.dumps(["e", *r]) + "\n")
        for r in con.execute("SELECT case_uid, activity, count(*) FROM fev GROUP BY 1, 2 ORDER BY 1, 2").fetchall():
            out.write(json.dumps(["n", *r]) + "\n")
    con.close()
    return result, files, warnings
