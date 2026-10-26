"""Measured metrics, bottleneck/rework/rule/BPMN results, and code-templated findings for one analysis run.

The population is rebuilt with the same filter as the process map. Findings are indications, never causes;
titles come from templates here, not from a language model. Nothing is reported when the data cannot support it.
"""

import datetime as dt
from pathlib import Path

from nora_worker.analysis import build_population
from nora_worker.dataset import lit
from nora_worker.rules import evaluate_rule

METRIC_VERSION = 1


def _label(score: int) -> str:
    return "tinggi" if score >= 70 else "sedang" if score >= 40 else "rendah"


def _fmt_hours(s: float | None) -> str:
    if s is None:
        return "–"
    h = s / 3600
    return f"{h / 24:.1f} hari" if h >= 48 else f"{h:.1f} jam"


def run_monitoring(events: Path, workdir: Path, inp: dict) -> tuple[dict, list[list]]:
    """Returns (monitoring result, finding-case rows [finding_index, case_uid, case_id, rank, metric, value])."""
    cfg = inp["config"]
    boundary = inp.get("boundary")
    con, warnings, ds_events, _, ds_cases, n_cases, n_events = build_population(events, workdir, inp)
    small = n_cases < cfg["smallSampleCases"]
    ends = (boundary or {}).get("endActivities") or []
    pstart, pend, ds_end = con.execute(
        "SELECT strftime(min(start_time), '%Y-%m-%dT%H:%M:%SZ'), strftime(max(end_time), '%Y-%m-%dT%H:%M:%SZ'), (SELECT max(event_time_utc) FROM ev) FROM fc"
    ).fetchone()
    con.execute(f"ALTER TABLE fc ADD COLUMN completed BOOLEAN; UPDATE fc SET completed = {('last_activity IN (' + ', '.join(lit(e) for e in ends) + ')') if ends else 'NULL'}")
    population = {"cases": n_cases, "events": n_events, "periodStart": pstart, "periodEnd": pend}
    metrics: list[dict] = []

    def metric(key, value, unit, *, available=True, reason=None, basis=None, cases=None):
        metrics.append({"key": key, "version": METRIC_VERSION, "value": value if available else None, "unit": unit, "available": available, "reason": reason,
                        "smallSample": (cases if cases is not None else n_cases) < cfg["smallSampleCases"], "population": {**population, "cases": cases if cases is not None else n_cases, "basis": basis}})

    no_boundary = "Batas proses belum ditetapkan pada paket konteks."
    metric("cases_started", n_cases, "cases")
    metric("data_coverage", (n_cases / ds_cases) if ds_cases else None, "ratio", available=ds_cases > 0, reason=None if ds_cases else "Dataset kosong")
    if ends:
        done, open_ = con.execute("SELECT count(*) FILTER (WHERE completed), count(*) FILTER (WHERE NOT completed) FROM fc").fetchone()
        metric("cases_completed", done, "cases")
        metric("cases_open", open_, "cases")
        age = con.execute("SELECT median(epoch(?::TIMESTAMPTZ) - epoch(start_time)) FROM fc WHERE NOT completed", [ds_end]).fetchone()[0] if open_ else None
        metric("open_case_age_median", age, "seconds", available=open_ > 0, reason=None if open_ else "Tidak ada kasus terbuka", cases=open_, basis="kasus terbuka per event terakhir dataset")
        dur_where, basis, dcases = "completed", "kasus selesai", done
    else:
        for k in ("cases_completed", "cases_open"):
            metric(k, None, "cases", available=False, reason=no_boundary)
        metric("open_case_age_median", None, "seconds", available=False, reason=no_boundary)
        dur_where, basis, dcases = "true", "semua kasus (batas proses tidak ada)", n_cases
    med, p90, mean = con.execute(f"SELECT median(duration_s), quantile_cont(duration_s, 0.9), avg(duration_s) FROM fc WHERE {dur_where}").fetchone()
    for k, v in (("case_duration_median", med), ("case_duration_p90", p90), ("case_duration_mean", mean)):
        metric(k, v, "seconds", available=dcases > 0, reason=None if dcases else "Tidak ada kasus untuk dihitung", basis=basis, cases=dcases)

    # Weekly trend; every point is a stored series value, not a recomputation in the browser.
    trend = [{"bucket": str(b), "started": s, "completed": c, "medianDurationSeconds": m} for b, s, c, m in con.execute(
        f"""SELECT CAST(date_trunc('week', start_time) AS DATE) AS b, count(*), {'count(*) FILTER (WHERE completed)' if ends else 'NULL'},
                   median(duration_s) FILTER (WHERE {dur_where}) FROM fc GROUP BY 1 ORDER BY 1""").fetchall()]

    # ------------------------------------------------------------ bottlenecks
    b = cfg["bottleneck"]
    rows = con.execute(
        """SELECT from_activity, to_activity, count(*), count(DISTINCT case_uid), median(wait_s), quantile_cont(wait_s, 0.9), sum(wait_s)
           FROM steps GROUP BY 1, 2 ORDER BY 7 DESC, 1, 2"""
    ).fetchall()
    total_wait = sum(r[6] or 0 for r in rows) or 0.0
    threshold = float(b["minP90Seconds"])
    transitions = []
    for rank, (f, t, occ, k, m, p, s) in enumerate(rows, start=1):
        share = (s or 0) / total_wait if total_wait else 0.0
        affected = k / n_cases if n_cases else 0.0
        excess = min(1.0, max(0.0, (p - threshold) / threshold)) if threshold > 0 else (1.0 if p > 0 else 0.0)
        severity = round(100 * (0.40 * share + 0.30 * affected + 0.30 * excess))
        is_b = rank <= b["topK"] and p >= threshold and k >= b["minSupportCases"]
        transitions.append({"from": f, "to": t, "rank": rank, "occurrences": occ, "caseCount": k, "medianSeconds": m, "p90Seconds": p, "totalSeconds": s,
                            "contributionShare": share, "affectedCaseShare": affected, "delayExcess": excess, "severity": severity, "isBottleneck": is_b})

    findings: list[dict] = []
    finding_rows: list[list] = []

    def add_finding(f: dict, case_sql: str, params: list, metric_name: str):
        idx = len(findings)
        findings.append(f)
        for rank, (uid, cid, val) in enumerate(con.execute(case_sql, params).fetchall(), start=1):
            finding_rows.append([idx, uid, cid, rank, metric_name, val])

    for tr in transitions:
        if not tr["isBottleneck"]:
            continue
        add_finding({
            "type": "bottleneck_indication",
            "title": f"Indikasi bottleneck pada transisi {tr['from']} → {tr['to']}",
            "metricKey": "transition_wait", "metricVersion": METRIC_VERSION,
            "metrics": {k: tr[k] for k in ("occurrences", "caseCount", "medianSeconds", "p90Seconds", "totalSeconds", "contributionShare", "affectedCaseShare", "delayExcess", "rank")},
            "population": {**population, "smallSample": small},
            "thresholds": {"topK": b["topK"], "minP90Seconds": threshold, "minSupportCases": b["minSupportCases"]},
            "severityScore": tr["severity"], "severityLabel": _label(tr["severity"]),
            "subject": {"from": tr["from"], "to": tr["to"]},
            "summary": f"{tr['caseCount']} kasus melewati transisi ini; P90 tunggu {_fmt_hours(tr['p90Seconds'])} dan menyumbang {tr['contributionShare']:.0%} dari total waktu tunggu.",
        }, """SELECT s.case_uid, any_value(fc.case_id), max(s.wait_s) FROM steps s JOIN fc USING (case_uid)
               WHERE s.from_activity = ? AND s.to_activity = ? GROUP BY s.case_uid ORDER BY 3 DESC, 1""", [tr["from"], tr["to"]], "wait_seconds")

    # ------------------------------------------------------------ rework
    rw = inp.get("rework")
    rework: dict = {"available": False, "reason": "Definisi rework belum ditetapkan pada paket konteks.", "caseCount": 0, "caseShare": None, "avgRepetitions": None,
                    "medianWithSeconds": None, "medianWithoutSeconds": None, "byRule": []}
    if rw and rw.get("rules"):
        con.execute("CREATE TEMP TABLE rw (case_uid VARCHAR, rule_index INT, repetitions INT)")
        unsupported = []
        for i, r in enumerate(rw["rules"]):
            if r["type"] == "repeated_activity":
                con.execute(f"INSERT INTO rw SELECT case_uid, {i}, count(*) - 1 FROM fev WHERE activity = ? GROUP BY case_uid HAVING count(*) >= ?", [r["activity"], r["minOccurrences"]])
            elif r["type"] == "return_transition":
                con.execute(f"INSERT INTO rw SELECT case_uid, {i}, count(*) FROM steps WHERE from_activity = ? AND to_activity = ? GROUP BY case_uid", [r["from"], r["to"]])
            elif r["type"] == "sequence_pattern":
                pat = chr(31).join(r["sequence"])
                con.execute(f"""INSERT INTO rw SELECT case_uid, {i}, (len(s) - len(replace(s, ?, ''))) // len(?) FROM (SELECT case_uid, chr(31) || array_to_string(seq, chr(31)) || chr(31) AS s FROM fc)
                                WHERE contains(s, ?)""", [chr(31) + pat + chr(31), chr(31) + pat + chr(31), chr(31) + pat + chr(31)])
            else:
                unsupported.append(r["type"])
        con.execute("CREATE TEMP TABLE rwc AS SELECT case_uid, sum(repetitions) AS reps FROM rw GROUP BY case_uid")
        k, avg_reps = con.execute("SELECT count(*), avg(reps) FROM rwc").fetchone()
        with_med, without_med = con.execute(
            f"SELECT median(duration_s) FILTER (WHERE case_uid IN (SELECT case_uid FROM rwc)), median(duration_s) FILTER (WHERE case_uid NOT IN (SELECT case_uid FROM rwc)) FROM fc WHERE {dur_where}"
        ).fetchone()
        by_rule = [{"index": i, "rule": r, "cases": con.execute("SELECT count(DISTINCT case_uid) FROM rw WHERE rule_index = ?", [i]).fetchone()[0]} for i, r in enumerate(rw["rules"])]
        share = k / n_cases if n_cases else 0.0
        rework = {"available": True, "reason": ("Kategori semantik belum tersedia (butuh hasil Jev terkonfirmasi); aturan tersebut tidak dihitung." if unsupported else None),
                  "caseCount": k, "caseShare": share, "avgRepetitions": avg_reps, "medianWithSeconds": with_med, "medianWithoutSeconds": without_med, "byRule": by_rule,
                  "comparisonNote": "Perbandingan durasi bersifat deskriptif, bukan hubungan sebab-akibat."}
        metric("rework_case_share", share, "ratio", cases=n_cases)
        metric("rework_repetitions", avg_reps, "count", available=k > 0, reason=None if k else "Tidak ada kasus rework", cases=k)
        rc = cfg["rework"]
        if share >= rc["minCaseShare"] and k >= rc["minSupportCases"]:
            extra = ((with_med or 0) - (without_med or 0)) / without_med if without_med else 0.0
            score = round(100 * (0.5 * min(1.0, share) + 0.5 * min(1.0, max(0.0, extra))))
            add_finding({
                "type": "high_rework", "title": "Indikasi rework tinggi",
                "metricKey": "rework_case_share", "metricVersion": METRIC_VERSION,
                "metrics": {"caseCount": k, "caseShare": share, "avgRepetitions": avg_reps, "medianWithSeconds": with_med, "medianWithoutSeconds": without_med, "relativeAdditionalDuration": extra},
                "population": {**population, "smallSample": small}, "thresholds": rc, "severityScore": score, "severityLabel": _label(score),
                "subject": {"rules": rw["rules"]},
                "summary": f"{k} kasus ({share:.0%}) memenuhi definisi rework dengan rata-rata {avg_reps:.1f} pengulangan.",
            }, f"""SELECT r.case_uid, fc.case_id, r.reps FROM rwc r JOIN fc USING (case_uid) ORDER BY r.reps DESC, fc.duration_s DESC, r.case_uid""", [], "repetitions")
    else:
        metric("rework_case_share", None, "ratio", available=False, reason=rework["reason"])
        metric("rework_repetitions", None, "count", available=False, reason=rework["reason"])

    # ------------------------------------------------------------ rules
    rule_results = []
    total_ok = total_bad = 0
    for r in inp.get("rules") or []:
        res = evaluate_rule(con, r["payload"], source="fev")  # same filtered population as the map
        ok = sum(1 for x in res if x[1] == "compliant")
        bad = [x for x in res if x[1] == "non_compliant"]
        ne = sum(1 for x in res if x[1] == "not_evaluable")
        reasons: dict[str, int] = {}
        for _, _, why in res:
            if why:
                reasons[why] = reasons.get(why, 0) + 1
        total_ok += ok
        total_bad += len(bad)
        rule_results.append({"ruleId": r["id"], "key": r["key"], "version": r["version"], "name": r["payload"]["name"], "compliant": ok, "nonCompliant": len(bad), "notEvaluable": ne,
                             "compliance": ok / (ok + len(bad)) if ok + len(bad) else None, "reasons": [{"reason": k_, "count": v} for k_, v in sorted(reasons.items(), key=lambda kv: -kv[1])]})
        rcfg = cfg["rules"]
        evaluable = ok + len(bad)
        if bad and evaluable and len(bad) / evaluable >= rcfg["minNonCompliantShare"] and len(bad) >= rcfg["minSupportCases"]:
            score = round(100 * len(bad) / evaluable)
            con.execute("CREATE OR REPLACE TEMP TABLE bad_cases (case_id VARCHAR)")  # the evaluator reports case_id
            con.executemany("INSERT INTO bad_cases VALUES (?)", [[x[0]] for x in bad])
            add_finding({
                "type": "rule_non_compliance", "title": f"Indikasi ketidakpatuhan aturan: {r['payload']['name']}",
                "metricKey": "rule_compliance", "metricVersion": METRIC_VERSION,
                "metrics": {"compliant": ok, "nonCompliant": len(bad), "notEvaluable": ne, "nonCompliantShare": len(bad) / evaluable},
                "population": {**population, "smallSample": small}, "thresholds": rcfg, "severityScore": score, "severityLabel": _label(score),
                "subject": {"ruleId": r["id"], "ruleKey": r["key"], "ruleVersion": r["version"]},
                "summary": f"{len(bad)} dari {evaluable} kasus yang dapat dievaluasi tidak patuh; {ne} kasus tidak dapat dievaluasi.",
            }, "SELECT fc.case_uid, fc.case_id, fc.duration_s FROM bad_cases b JOIN fc ON fc.case_id = b.case_id ORDER BY fc.duration_s DESC, fc.case_uid", [], "case_duration_seconds")
    if inp.get("rules"):
        metric("rule_compliance", total_ok / (total_ok + total_bad) if total_ok + total_bad else None, "ratio", available=total_ok + total_bad > 0,
               reason=None if total_ok + total_bad else "Tidak ada kasus yang dapat dievaluasi", basis="semua aturan aktif")
    else:
        metric("rule_compliance", None, "ratio", available=False, reason="Belum ada aturan aktif pada paket konteks.")

    # ------------------------------------------------------------ BPMN conformance
    conformance = {"status": "unavailable", "reason": inp.get("bpmnUnavailableReason") or "BPMN tidak tersedia pada paket konteks.", "fitness": None, "variants": [], "mismatches": []}
    bpmn = inp.get("bpmn")
    if bpmn and inp.get("_bpmnPath"):
        try:
            conformance = _conformance(con, Path(inp["_bpmnPath"]), bpmn)
        except Exception as e:  # PM4Py raises many types; the run continues and the section reports why
            conformance = {"status": "failed", "reason": f"Token replay gagal: {str(e)[:200]}", "fitness": None, "variants": [], "mismatches": []}
    if conformance["status"] == "available":
        metric("bpmn_fitness", conformance["fitness"], "ratio", basis="token-based replay per varian")
        cc = cfg["conformance"]
        unfit = [v for v in conformance["variants"] if not v["fit"]]
        unfit_cases = sum(v["caseCount"] for v in unfit)
        if conformance["fitness"] < cc["minFitness"] and unfit_cases >= cc["minSupportCases"]:
            score = round(100 * (1 - conformance["fitness"]))
            con.execute("CREATE OR REPLACE TEMP TABLE unfit (variant_hash VARCHAR, fitness DOUBLE)")
            con.executemany("INSERT INTO unfit VALUES (?, ?)", [[v["hash"], v["fitness"]] for v in unfit])
            add_finding({
                "type": "bpmn_deviation", "title": "Indikasi deviasi dari model BPMN",
                "metricKey": "bpmn_fitness", "metricVersion": METRIC_VERSION,
                "metrics": {"fitness": conformance["fitness"], "unfitCases": unfit_cases, "unfitVariants": len(unfit)},
                "population": {**population, "smallSample": small}, "thresholds": cc, "severityScore": score, "severityLabel": _label(score),
                "subject": {"modelId": bpmn["modelId"], "mappingId": bpmn["mappingId"], "mappingVersion": bpmn["mappingVersion"]},
                "summary": f"Fitness keseluruhan {conformance['fitness']:.2f}; {unfit_cases} kasus pada {len(unfit)} varian tidak sesuai model.",
            }, "SELECT fc.case_uid, fc.case_id, u.fitness FROM fc JOIN unfit u USING (variant_hash) ORDER BY u.fitness, fc.case_uid", [], "variant_fitness")
    else:
        metric("bpmn_fitness", None, "ratio", available=False, reason=conformance["reason"])

    # ------------------------------------------------------------ backlog and trend
    if ends:
        open_cnt = con.execute("SELECT count(*) FROM fc WHERE NOT completed").fetchone()[0]
        p90_done = p90
        if open_cnt and p90_done:
            aged = con.execute("SELECT count(*) FROM fc WHERE NOT completed AND epoch(?::TIMESTAMPTZ) - epoch(start_time) > ?", [ds_end, p90_done]).fetchone()[0]
            if aged >= cfg["backlog"]["minSupportCases"]:
                score = round(100 * min(1.0, aged / max(open_cnt, 1)))
                add_finding({
                    "type": "aging_backlog", "title": "Indikasi backlog kasus terbuka yang menua",
                    "metricKey": "open_case_age_median", "metricVersion": METRIC_VERSION,
                    "metrics": {"agedCases": aged, "openCases": open_cnt, "ageThresholdSeconds": p90_done},
                    "population": {**population, "smallSample": small}, "thresholds": {**cfg["backlog"], "ageThreshold": "P90 durasi kasus selesai"},
                    "severityScore": score, "severityLabel": _label(score), "subject": {},
                    "summary": f"{aged} dari {open_cnt} kasus terbuka berumur melebihi P90 durasi kasus selesai ({_fmt_hours(p90_done)}).",
                }, "SELECT case_uid, case_id, epoch(?::TIMESTAMPTZ) - epoch(start_time) AS age FROM fc WHERE NOT completed AND epoch(?::TIMESTAMPTZ) - epoch(start_time) > ? ORDER BY age DESC, case_uid",
                    [ds_end, ds_end, p90_done], "age_seconds")
    tcfg = cfg["trend"]
    weeks = [t for t in trend if t["medianDurationSeconds"] is not None]
    if len(weeks) >= 8:
        recent, prior = weeks[-4:], weeks[-8:-4]
        rn, pn = sum(t["started"] for t in recent), sum(t["started"] for t in prior)
        rmed = sorted(t["medianDurationSeconds"] for t in recent)[len(recent) // 2]
        pmed = sorted(t["medianDurationSeconds"] for t in prior)[len(prior) // 2]
        if rn >= tcfg["minCasesPerWindow"] and pn >= tcfg["minCasesPerWindow"] and pmed and (rmed - pmed) / pmed >= tcfg["minRelativeIncrease"]:
            change = (rmed - pmed) / pmed
            score = round(100 * min(1.0, change))
            add_finding({
                "type": "worsening_trend", "title": "Indikasi tren durasi kasus memburuk",
                "metricKey": "case_duration_median", "metricVersion": METRIC_VERSION,
                "metrics": {"recentMedianSeconds": rmed, "priorMedianSeconds": pmed, "relativeChange": change, "recentCases": rn, "priorCases": pn},
                "population": {**population, "smallSample": small}, "thresholds": tcfg, "severityScore": score, "severityLabel": _label(score), "subject": {"windowWeeks": 4},
                "summary": f"Median durasi 4 minggu terakhir {_fmt_hours(rmed)} dibanding {_fmt_hours(pmed)} pada 4 minggu sebelumnya.",
            }, "SELECT case_uid, case_id, duration_s FROM fc WHERE start_time >= CAST(? AS DATE) ORDER BY duration_s DESC, case_uid", [recent[0]["bucket"]], "case_duration_seconds")

    con.close()
    result = {
        "metrics": metrics, "trend": trend, "transitions": transitions, "rework": rework, "rules": rule_results, "conformance": conformance,
        "findings": findings, "population": population, "warnings": warnings, "config": cfg, "datasetEvents": ds_events,
    }
    return result, finding_rows


def _conformance(con, path: Path, bpmn: dict) -> dict:
    import pm4py
    from pm4py.algo.conformance.tokenreplay import algorithm as tr
    from pm4py.objects.log.obj import Event, EventLog, Trace

    net, im, fm = pm4py.convert_to_petri_net(pm4py.read_bpmn(str(path)))
    task_name = {t["id"]: t["name"] for t in bpmn["tasks"]}
    act_to_task: dict[str, str] = {}
    for task_id, acts in sorted(bpmn["mapping"].items()):
        for a in acts:
            act_to_task.setdefault(a, task_name.get(task_id, task_id))
    variants = con.execute("SELECT variant_hash, any_value(seq), count(*) FROM fc GROUP BY 1 ORDER BY 3 DESC, 1").fetchall()
    base = dt.datetime(2000, 1, 1)
    log = EventLog([Trace([Event({"concept:name": act_to_task.get(a, f"__unmapped__{a}"), "time:timestamp": base + dt.timedelta(seconds=i)}) for i, a in enumerate(seq)],
                         attributes={"concept:name": h}) for h, seq, _ in variants])
    diag = tr.apply(log, net, im, fm, parameters={"show_progress_bar": False})
    out, mism, total, weighted = [], {}, 0, 0.0
    for (h, seq, n), d in zip(variants, diag):
        not_in_model = sorted({a for a in seq if a not in act_to_task})
        fit = bool(d["trace_is_fit"]) and not not_in_model
        out.append({"hash": h, "caseCount": n, "fitness": float(d["trace_fitness"]), "fit": fit, "problems": sorted({t.label for t in d["transitions_with_problems"] if t.label}),
                    "notInModel": not_in_model, "missingTokens": d["missing_tokens"], "remainingTokens": d["remaining_tokens"]})
        total += n
        weighted += float(d["trace_fitness"]) * n
        for lbl in out[-1]["problems"]:
            mism.setdefault(("model_mismatch", lbl), 0)
            mism[("model_mismatch", lbl)] += n
        for a in not_in_model:
            mism.setdefault(("not_in_model", a), 0)
            mism[("not_in_model", a)] += n
    return {
        "status": "available", "reason": None, "fitness": weighted / total if total else None,
        "modelId": bpmn["modelId"], "mappingId": bpmn["mappingId"], "mappingVersion": bpmn["mappingVersion"],
        "variants": out[:200], "mismatches": [{"kind": k, "activity": a, "cases": c} for (k, a), c in sorted(mism.items(), key=lambda kv: -kv[1])][:30],
    }
