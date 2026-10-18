"""Deterministic per-case rule evaluation over canonical events.

Every case in scope ends `compliant`, `non_compliant`, or `not_evaluable` (with a reason); never a silent false.
The `ev` relation must expose case_id, activity, event_time_utc, resource, case_attributes, source_row_number, excluded.
"""

from nora_worker.dataset import lit


def _scope_sql(rule: dict) -> tuple[str, str]:
    """Returns (in-scope predicate, missing-attribute predicate) over the per-case `c` relation."""
    scope = rule.get("scope") or {}
    terms, missing = [], []
    for attr, values in scope.items():
        v = f"json_extract_string(c.case_attributes, {lit('$.' + attr)})"
        missing.append(f"{v} IS NULL")
        terms.append(f"{v} IN ({', '.join(lit(x) for x in values) or 'NULL'})")
    eff_from, eff_to = rule.get("effectiveFrom"), rule.get("effectiveTo")
    if eff_from:
        terms.append(f"c.case_start >= CAST({lit(eff_from)} AS TIMESTAMPTZ)")
    if eff_to:
        terms.append(f"c.case_start < CAST({lit(eff_to)} AS TIMESTAMPTZ) + INTERVAL 1 DAY")
    return (" AND ".join(terms) or "true"), (" OR ".join(missing) or "false")


def rule_sql(rule: dict) -> str:
    """SELECT case_id, status, reason for every in-scope case."""
    p = rule["params"]
    t = p["type"]
    a = lambda x: lit(x)  # noqa: E731
    first = lambda act: f"min(event_time_utc) FILTER (WHERE activity = {a(act)})"  # noqa: E731
    if t == "required_activity":
        body = f"CASE WHEN count(*) FILTER (WHERE activity = {a(p['activity'])}) > 0 THEN 'compliant' ELSE 'non_compliant' END AS status, CASE WHEN count(*) FILTER (WHERE activity = {a(p['activity'])}) > 0 THEN NULL ELSE 'aktivitas wajib tidak muncul' END AS reason"
    elif t == "forbidden_activity":
        body = f"CASE WHEN count(*) FILTER (WHERE activity = {a(p['activity'])}) > 0 THEN 'non_compliant' ELSE 'compliant' END AS status, CASE WHEN count(*) FILTER (WHERE activity = {a(p['activity'])}) > 0 THEN 'aktivitas terlarang muncul' END AS reason"
    elif t == "ordering":
        b, af = first(p["before"]), first(p["after"])
        body = f"""CASE WHEN {af} IS NULL THEN 'compliant'
                        WHEN {b} IS NULL OR {b} > {af} THEN 'non_compliant' ELSE 'compliant' END AS status,
                   CASE WHEN {af} IS NOT NULL AND {b} IS NULL THEN 'aktivitas pendahulu tidak muncul'
                        WHEN {af} IS NOT NULL AND {b} > {af} THEN 'urutan terbalik' END AS reason"""
    elif t == "separation_of_duties":
        ra = f"list_distinct(list(resource) FILTER (WHERE activity = {a(p['activityA'])} AND resource IS NOT NULL))"
        rb = f"list_distinct(list(resource) FILTER (WHERE activity = {a(p['activityB'])} AND resource IS NOT NULL))"
        has = lambda act: f"count(*) FILTER (WHERE activity = {a(act)}) > 0"  # noqa: E731
        nores = f"count(*) FILTER (WHERE activity IN ({a(p['activityA'])}, {a(p['activityB'])}) AND resource IS NULL) > 0"
        body = f"""CASE WHEN NOT ({has(p['activityA'])} AND {has(p['activityB'])}) THEN 'compliant'
                        WHEN {nores} THEN 'not_evaluable'
                        WHEN len(list_intersect({ra}, {rb})) > 0 THEN 'non_compliant' ELSE 'compliant' END AS status,
                   CASE WHEN {has(p['activityA'])} AND {has(p['activityB'])} AND {nores} THEN 'resource tidak tersedia'
                        WHEN {has(p['activityA'])} AND {has(p['activityB'])} AND len(list_intersect({ra}, {rb})) > 0 THEN 'resource sama mengerjakan kedua aktivitas' END AS reason"""
    elif t == "sla_duration":
        limit = float(p["maxHours"]) * 3600
        if p.get("fromActivity") or p.get("toActivity"):
            start = first(p["fromActivity"]) if p.get("fromActivity") else "min(event_time_utc)"
            end_act = p.get("toActivity")
            # DuckDB cannot nest aggregates in FILTER; compute the start per case first.
            return f"""
              WITH s AS (SELECT case_id, {start} AS t0 FROM ev WHERE NOT excluded GROUP BY case_id),
              e AS (SELECT ev.case_id, s.t0, {('min(ev.event_time_utc) FILTER (WHERE ev.activity = ' + a(end_act) + ' AND ev.event_time_utc >= s.t0)') if end_act else 'max(ev.event_time_utc)'} AS t1
                    FROM ev JOIN s USING (case_id) WHERE NOT ev.excluded GROUP BY ev.case_id, s.t0)
              SELECT case_id,
                CASE WHEN t0 IS NULL THEN 'not_evaluable' WHEN t1 IS NULL THEN 'not_evaluable'
                     WHEN epoch(t1) - epoch(t0) > {limit} THEN 'non_compliant' ELSE 'compliant' END AS status,
                CASE WHEN t0 IS NULL THEN 'aktivitas awal SLA tidak muncul' WHEN t1 IS NULL THEN 'aktivitas akhir SLA belum terjadi'
                     WHEN epoch(t1) - epoch(t0) > {limit} THEN 'melebihi ' || {lit(str(p['maxHours']))} || ' jam' END AS reason,
                epoch(t1) - epoch(t0) AS measured_seconds
              FROM e"""
        body = f"""CASE WHEN epoch(max(event_time_utc)) - epoch(min(event_time_utc)) > {limit} THEN 'non_compliant' ELSE 'compliant' END AS status,
                   CASE WHEN epoch(max(event_time_utc)) - epoch(min(event_time_utc)) > {limit} THEN 'melebihi ' || {lit(str(p['maxHours']))} || ' jam' END AS reason"""
    else:
        raise ValueError(f"unknown rule type {t}")
    return f"SELECT case_id, {body}, NULL::DOUBLE AS measured_seconds FROM ev WHERE NOT excluded GROUP BY case_id"


def evaluate_rule(con, rule: dict, max_cases: int | None = None) -> list[tuple[str, str, str | None]]:
    """Returns (case_id, status, reason) for every in-scope case; `ev` must already exist on `con`."""
    in_scope, missing = _scope_sql(rule)
    con.execute(
        """CREATE OR REPLACE TEMP VIEW case_info AS
           SELECT case_id, any_value(case_attributes) AS case_attributes, min(event_time_utc) AS case_start
           FROM ev WHERE NOT excluded AND case_id IS NOT NULL GROUP BY case_id"""
    )
    limit = f"LIMIT {int(max_cases)}" if max_cases else ""
    sql = f"""
      WITH c AS (SELECT * FROM case_info ORDER BY case_id {limit}),
      r AS ({rule_sql(rule)})
      SELECT c.case_id,
        CASE WHEN {missing} THEN 'not_evaluable' ELSE r.status END,
        CASE WHEN {missing} THEN 'atribut scope tidak tersedia' ELSE r.reason END
      FROM c JOIN r USING (case_id)
      WHERE ({missing}) OR ({in_scope})
      ORDER BY c.case_id"""
    return con.execute(sql).fetchall()


def summarize(rows: list[tuple[str, str, str | None]], samples: int = 20) -> dict:
    counts = {"compliant": 0, "non_compliant": 0, "not_evaluable": 0}
    reasons: dict[str, int] = {}
    for _, status, reason in rows:
        counts[status] += 1
        if reason:
            reasons[reason] = reasons.get(reason, 0) + 1
    sample_rows = [r for r in rows if r[1] != "compliant"][:samples] or rows[:samples]
    return {
        "evaluatedCases": len(rows),
        "compliant": counts["compliant"],
        "nonCompliant": counts["non_compliant"],
        "notEvaluable": counts["not_evaluable"],
        "reasons": [{"reason": k, "count": v} for k, v in sorted(reasons.items(), key=lambda kv: -kv[1])],
        "samples": [{"caseId": c, "status": s, "reason": r} for c, s, r in sample_rows],
    }
