"""Mapping preview and DatasetVersion build over staging Parquet with DuckDB (disk-backed, bounded memory).

Canonical times are UTC. Nothing is dropped silently: defects become quality flags, and only repair rules
set `excluded`. Event order is (case_id, event_time_utc, source_row_number, event_uid).
"""

from pathlib import Path

import duckdb

from nora_worker.ingest import ROW_COL

ALGORITHM_VERSION = "canonical-v1"
SAMPLES = 10

SEVERITY = {
    "required_missing": "high",
    "timestamp_invalid": "high",
    "start_after_completion": "high",
    "duplicate": "medium",
    "equal_timestamp": "medium",
    "unmapped_activity": "medium",
    "incomplete_case": "info",
    "outside_project_period": "info",
}
EVENT_CHECKS = ["required_missing", "timestamp_invalid", "start_after_completion", "duplicate", "equal_timestamp", "unmapped_activity", "outside_project_period"]


def q(name: str) -> str:
    """Quote an identifier."""
    return '"' + name.replace('"', '""') + '"'


def lit(value: str) -> str:
    """Quote a string literal."""
    return "'" + value.replace("'", "''") + "'"


def connect(workdir: Path, timezone: str) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(str(workdir / "work.duckdb"))
    con.execute(f"SET memory_limit='2GB'; SET temp_directory={lit((workdir / 'spill').as_posix())}; SET preserve_insertion_order=false")
    # Timestamps without an explicit offset are read in the source time zone.
    con.execute(f"SET TimeZone={lit(timezone)}")
    return con


def _ts(col: str | None, fmt: str) -> str:
    if not col:
        return "CAST(NULL AS TIMESTAMPTZ)"
    v = f"NULLIF(trim({q(col)}), '')"
    if fmt == "auto":
        return f"TRY_CAST({v} AS TIMESTAMPTZ)"
    return f"CAST(try_strptime({v}, {lit(fmt)}) AS TIMESTAMPTZ)"


def _text(col: str | None) -> str:
    return f"NULLIF(trim({q(col)}), '')" if col else "CAST(NULL AS VARCHAR)"


def mapped_sql(config: dict, source_id: str, staging: str) -> str:
    """One row per staged record with raw and typed canonical fields (before quality flags)."""
    c = config["columns"]
    fmt = config.get("timestampFormat") or "auto"
    case_attrs = c.get("caseAttributes") or []
    event_attrs = c.get("eventAttributes") or []
    objs = c.get("objectRefs") or []

    def obj(cols):
        return "json_object(" + ", ".join(f"{lit(a)}, {q(a)}" for a in cols) + ")" if cols else "'{}'"

    disc = _text(config.get("discriminator"))
    return f"""
      SELECT
        {ROW_COL} AS source_row_number,
        {_text(c['caseId'])} AS case_id,
        {_text(c['activity'])} AS activity_raw,
        {_text(c['timestamp'])} AS timestamp_raw,
        {_ts(c['timestamp'], fmt)} AS event_time,
        {_ts(c.get('startTimestamp'), fmt)} AS start_time,
        {_text(c.get('resource'))} AS resource,
        {_text(c.get('lifecycle'))} AS lifecycle,
        {_text(c.get('eventId'))} AS original_event_id,
        CAST({obj(case_attrs)} AS VARCHAR) AS case_attributes,
        CAST({obj(event_attrs)} AS VARCHAR) AS event_attributes,
        {'list_filter([' + ', '.join(_text(o) for o in objs) + '], x -> x IS NOT NULL)' if objs else 'CAST([] AS VARCHAR[])'} AS object_refs,
        CASE WHEN {_text(c.get('eventId'))} IS NOT NULL
             THEN sha256({lit(source_id)} || '|' || {_text(c.get('eventId'))})
             ELSE sha256({lit(source_id)} || '|' || coalesce({q(c['caseId'])}, '') || '|' || coalesce({q(c['activity'])}, '') || '|' || coalesce({q(c['timestamp'])}, '') || '|' || coalesce({disc}, ''))
        END AS fingerprint
      FROM read_parquet({lit(staging)})
    """


def _label_table(con, config: dict) -> None:
    con.execute("CREATE OR REPLACE TEMP TABLE label_map (raw VARCHAR, canonical VARCHAR)")
    items = list((config.get("labelMap") or {}).items())
    if items:
        con.executemany("INSERT INTO label_map VALUES (?, ?)", items)


def _validate_columns(con, staging: str, config: dict) -> None:
    present = {r[0] for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet({lit(staging)})").fetchall()}
    c = config["columns"]
    wanted = [c["caseId"], c["activity"], c["timestamp"]] + [c.get(k) for k in ("startTimestamp", "resource", "eventId", "lifecycle")]
    wanted += (c.get("caseAttributes") or []) + (c.get("eventAttributes") or []) + (c.get("objectRefs") or []) + [config.get("discriminator")]
    missing = sorted({w for w in wanted if w and w not in present})
    if missing:
        raise ValueError(f"kolom tidak ada di snapshot: {', '.join(missing)}")


# ---------------------------------------------------------------- preview


def preview_mapping(staging: Path, workdir: Path, config: dict, limit: int) -> dict:
    con = connect(workdir, config["timezone"])
    src = staging.as_posix()
    _validate_columns(con, src, config)
    _label_table(con, config)
    con.execute(f"CREATE TEMP VIEW m AS {mapped_sql(config, 'preview', src)}")
    rows = con.execute(
        f"""SELECT m.source_row_number, m.case_id, m.activity_raw, coalesce(l.canonical, m.activity_raw),
                   strftime(m.event_time AT TIME ZONE 'UTC', '%Y-%m-%dT%H:%M:%S.%gZ'),
                   strftime(m.start_time AT TIME ZONE 'UTC', '%Y-%m-%dT%H:%M:%S.%gZ'),
                   m.resource, m.timestamp_raw
            FROM m LEFT JOIN label_map l ON l.raw = m.activity_raw ORDER BY m.source_row_number LIMIT {int(limit)}"""
    ).fetchall()
    events = []
    for row, case, raw, act, t, st, res, traw in rows:
        issues = []
        if case is None:
            issues.append("case ID kosong")
        if raw is None:
            issues.append("aktivitas kosong")
        if t is None:
            issues.append("waktu kosong" if traw is None else f"waktu tidak terbaca: {traw[:40]}")
        events.append({"row": row, "caseId": case, "activityRaw": raw, "activity": act, "timeUtc": t, "startTimeUtc": st, "resource": res, "issues": issues})
    values = con.execute(f"SELECT activity_raw, count(*) FROM m WHERE activity_raw IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 1000").fetchall()
    total, parsed = con.execute("SELECT count(*), count(event_time) FROM m").fetchone()
    con.close()
    return {
        "events": events,
        "activityValues": [{"raw": v, "count": n} for v, n in values],
        "totalRows": total,
        "parsedTimestampShare": (parsed / total) if total else 0.0,
    }


# ---------------------------------------------------------------- build


def build_dataset(staging: Path, workdir: Path, inp: dict) -> tuple[dict, Path, Path]:
    """Returns (BuildDatasetReport, events parquet, cases parquet)."""
    config = inp["config"]
    con = connect(workdir, config["timezone"])
    src = staging.as_posix()
    _validate_columns(con, src, config)
    _label_table(con, config)
    label_map_size = len(config.get("labelMap") or {})
    require_map = bool(config.get("requireLabelMap")) and label_map_size > 0
    repair = {chk for r in config.get("repairRules") or [] for chk in r.get("checks", [])}
    period_start, period_end = inp["projectPeriod"]["start"], inp["projectPeriod"]["end"]

    con.execute(f"CREATE TEMP TABLE m AS {mapped_sql(config, inp['sourceId'], src)}")
    con.execute(
        f"""
        CREATE TEMP TABLE e AS
        WITH base AS (
          SELECT m.*, coalesce(l.canonical, m.activity_raw) AS activity, l.raw IS NOT NULL AS label_mapped,
                 row_number() OVER (PARTITION BY fingerprint ORDER BY source_row_number) AS ordinal,
                 count(*) OVER (PARTITION BY fingerprint) AS fp_count
          FROM m LEFT JOIN label_map l ON l.raw = m.activity_raw
        ), flagged AS (
          SELECT *,
            (case_id IS NULL OR activity_raw IS NULL OR timestamp_raw IS NULL) AS f_required_missing,
            (timestamp_raw IS NOT NULL AND (event_time IS NULL OR year(event_time AT TIME ZONE 'UTC') < 1970
               OR event_time > now() + INTERVAL 1 DAY)) AS f_timestamp_invalid,
            (start_time IS NOT NULL AND event_time IS NOT NULL AND start_time > event_time) AS f_start_after_completion,
            (fp_count > 1) AS f_duplicate,
            ({'activity_raw IS NOT NULL AND NOT label_mapped' if require_map else 'false'}) AS f_unmapped_activity,
            (event_time IS NOT NULL AND (event_time < CAST({lit(period_start)} AS DATE)
               OR event_time >= CAST({lit(period_end)} AS DATE) + INTERVAL 1 DAY)) AS f_outside_project_period
          FROM base
        )
        SELECT *, count(DISTINCT activity) FILTER (WHERE event_time IS NOT NULL)
                    OVER (PARTITION BY case_id, event_time) > 1 AND case_id IS NOT NULL AS f_equal_timestamp
        FROM flagged
        """
    )
    exclude_terms = [f"f_{chk}" for chk in sorted(repair)] or ["false"]
    con.execute(f"ALTER TABLE e ADD COLUMN excluded BOOLEAN; UPDATE e SET excluded = {' OR '.join(exclude_terms)}")

    # Incomplete cases need the F03 process boundary; without it the check is not evaluated.
    boundary = inp.get("processBoundary")
    con.execute("CREATE TEMP TABLE incomplete (case_id VARCHAR)")
    if boundary and (boundary.get("startActivities") or boundary.get("endActivities")):
        starts = boundary.get("startActivities") or []
        ends = boundary.get("endActivities") or []
        con.execute(
            f"""INSERT INTO incomplete
                SELECT case_id FROM (
                  SELECT case_id, arg_min(activity, (event_time, source_row_number)) AS first_act, arg_max(activity, (event_time, source_row_number)) AS last_act
                  FROM e WHERE NOT excluded AND case_id IS NOT NULL AND event_time IS NOT NULL GROUP BY case_id)
                WHERE {('first_act NOT IN (' + ', '.join(lit(s) for s in starts) + ')') if starts else 'false'}
                   OR {('last_act NOT IN (' + ', '.join(lit(s) for s in ends) + ')') if ends else 'false'}"""
        )
    con.execute("ALTER TABLE e ADD COLUMN f_incomplete_case BOOLEAN; UPDATE e SET f_incomplete_case = case_id IN (SELECT case_id FROM incomplete)")

    total_events, total_cases = con.execute("SELECT count(*), count(DISTINCT case_id) FROM e").fetchone()
    findings = []
    for chk in EVENT_CHECKS + ["incomplete_case"]:
        col = f"f_{chk}"
        n_ev, n_case, n_excl = con.execute(f"SELECT count(*), count(DISTINCT case_id), count(*) FILTER (WHERE excluded) FROM e WHERE {col}").fetchone()
        if not n_ev:
            continue
        samples = con.execute(
            f"""SELECT source_row_number, original_event_id, case_id, activity_raw,
                       CASE WHEN {col} AND '{chk}' IN ('timestamp_invalid', 'required_missing') THEN timestamp_raw
                            WHEN '{chk}' = 'duplicate' THEN 'kemunculan ke-' || ordinal ELSE NULL END
                FROM e WHERE {col} ORDER BY source_row_number LIMIT {SAMPLES}"""
        ).fetchall()
        findings.append({
            "check": chk,
            "severity": SEVERITY[chk],
            "eventCount": n_ev,
            "caseCount": n_case,
            "eventShare": n_ev / total_events if total_events else 0.0,
            "caseShare": n_case / total_cases if total_cases else 0.0,
            "excludedEventCount": n_excl,
            "samples": [{"row": r, "eventId": eid, "caseId": cid, "activity": act, "detail": d} for r, eid, cid, act, d in samples],
        })

    flag_list = "list_filter([" + ", ".join(f"CASE WHEN f_{chk} THEN '{chk}' END" for chk in EVENT_CHECKS + ["incomplete_case"]) + "], x -> x IS NOT NULL)"
    dataset_id, project_id = inp["datasetVersionId"], inp["projectId"]
    events_path, cases_path = workdir / "events.parquet", workdir / "cases.parquet"
    con.execute(
        f"""CREATE TEMP TABLE out AS
            SELECT
              sha256(fingerprint || ':' || ordinal) AS event_uid,
              {lit(project_id)} AS project_id,
              {lit(dataset_id)} AS dataset_version_id,
              case_id, substr(sha256(coalesce(case_id, '')), 1, 16) AS case_uid,
              activity, activity_raw,
              event_time AS event_time_utc, start_time AS start_time_utc,
              resource, lifecycle, case_attributes, event_attributes, object_refs,
              {lit(inp['snapshotId'])} AS snapshot_id,
              source_row_number, original_event_id,
              {lit(inp['mappingVersionId'])} AS mapping_version_id,
              {flag_list} AS quality_flags,
              excluded, ordinal
            FROM e"""
    )
    con.execute("SET TimeZone='UTC'")
    con.execute(
        f"""COPY (
              SELECT *, row_number() OVER (ORDER BY case_id NULLS LAST, event_time_utc NULLS LAST, source_row_number, event_uid) - 1 AS row_index
              FROM out ORDER BY row_index
            ) TO {lit(events_path.as_posix())} (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 50000)"""
    )
    con.execute(
        f"""COPY (
              SELECT case_uid, case_id, count(*) AS event_count,
                     count(*) FILTER (WHERE NOT excluded) AS included_event_count,
                     min(row_index) AS row_start, max(row_index) AS row_end,
                     min(event_time_utc) FILTER (WHERE NOT excluded) AS start_time_utc,
                     max(event_time_utc) FILTER (WHERE NOT excluded) AS end_time_utc
              FROM read_parquet({lit(events_path.as_posix())}) WHERE case_id IS NOT NULL
              GROUP BY case_uid, case_id ORDER BY min(row_index)
            ) TO {lit(cases_path.as_posix())} (FORMAT parquet, COMPRESSION zstd)"""
    )

    excluded = con.execute("SELECT count(*) FROM e WHERE excluded").fetchone()[0]
    labels = con.execute("SELECT activity, count(*) FROM e WHERE NOT excluded AND activity IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1").fetchall()
    pstart, pend = con.execute("SELECT strftime(min(event_time_utc), '%Y-%m-%dT%H:%M:%S.%gZ'), strftime(max(event_time_utc), '%Y-%m-%dT%H:%M:%S.%gZ') FROM out WHERE NOT excluded").fetchone()
    included_cases = con.execute("SELECT count(DISTINCT case_id) FROM e WHERE NOT excluded AND case_id IS NOT NULL").fetchone()[0]
    equal_ts_cases = next((f["caseCount"] for f in findings if f["check"] == "equal_timestamp"), 0)
    has_start = con.execute("SELECT count(start_time) FROM e WHERE NOT excluded").fetchone()[0] > 0
    has_resource = con.execute("SELECT count(resource) FROM e WHERE NOT excluded").fetchone()[0] > 0
    con.close()

    blocking = any(f["severity"] == "high" and f["eventCount"] > f["excludedEventCount"] for f in findings)
    quality = "not_ready" if blocking or included_cases == 0 else ("ready_with_notes" if findings or excluded else "ready")
    ambiguity = equal_ts_cases / total_cases if total_cases else 0.0

    def cap(available: bool, level: str, reason: str) -> dict:
        return {"available": available, "level": level, "reason": reason}

    capabilities = {
        "processDiscovery": cap(included_cases > 0, "warning" if ambiguity > 0.10 else ("ok" if included_cases else "unavailable"),
                                f"Urutan ambigu (waktu sama) pada {ambiguity:.0%} kasus; peta diberi peringatan." if ambiguity > 0.10 else "Tersedia."),
        "serviceTime": cap(has_start, "ok" if has_start else "unavailable", "Tersedia dari waktu mulai." if has_start else "Tanpa start timestamp, service time tidak dihitung; hanya waiting time."),
        "resourceAnalysis": cap(has_resource, "ok" if has_resource else "unavailable", "Tersedia." if has_resource else "Tanpa kolom resource, analisis resource dan separation of duties tidak tersedia."),
        "processBoundary": cap(bool(boundary), "ok" if boundary else "unavailable", "Batas proses dari context package." if boundary else "Batas proses belum ditetapkan (F03); completion dan backlog terbatas."),
        "comparison": cap(included_cases >= 100, "ok" if included_cases >= 100 else "warning", "Tersedia." if included_cases >= 100 else f"Hanya {included_cases} kasus (< 100); perbandingan diberi batasan sampel kecil."),
    }
    report = {
        "eventCount": total_events,
        "caseCount": total_cases,
        "excludedEventCount": excluded,
        "activityLabels": [{"label": a, "count": n} for a, n in labels],
        "periodStart": pstart,
        "periodEnd": pend,
        "findings": findings,
        "qualityStatus": quality,
        "capabilities": capabilities,
    }
    return report, events_path, cases_path
