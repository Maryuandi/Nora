"""F02 activities. Inputs are validated against the exported Zod contracts; object keys must sit in the project prefix."""

import shutil
import tempfile
from pathlib import Path

import jsonschema
from temporalio import activity
from temporalio.exceptions import ApplicationError

from nora_worker import storage
from nora_worker.contracts import load_schema
from nora_worker.bpmn import validate_bpmn
from nora_worker.dataset import build_dataset, connect, lit, preview_mapping
from nora_worker.ingest import ingest_file
from nora_worker.rules import evaluate_rule, summarize


def _validate(payload: dict, schema: str) -> None:
    try:
        jsonschema.validate(payload, load_schema(schema))
    except jsonschema.ValidationError as e:
        raise ApplicationError(f"Invalid {schema}: {e.message}", type="ContractMismatch", non_retryable=True) from e


class _Workdir:
    def __enter__(self) -> Path:
        self.path = Path(tempfile.mkdtemp(prefix="nora-"))
        return self.path

    def __exit__(self, *exc):
        shutil.rmtree(self.path, ignore_errors=True)


@activity.defn(name="ingestSnapshot")
def ingest_snapshot(payload: dict) -> dict:
    _validate(payload, "IngestSnapshotInput")
    pid = payload["projectId"]
    for k in ("rawKey", "stagingKey", "reportKey"):
        storage.assert_project_key(pid, payload[k])
    with _Workdir() as wd:
        raw = storage.download(pid, payload["rawKey"], wd / "source")
        report, staging = ingest_file(raw, wd, payload["maxBytes"])
        if staging is not None:
            storage.upload(pid, payload["stagingKey"], staging)
        storage.put_json(pid, payload["reportKey"], report)
    return {"status": report["status"]}


@activity.defn(name="previewMapping")
def preview_mapping_activity(payload: dict) -> dict:
    _validate(payload, "PreviewMappingInput")
    pid = payload["projectId"]
    with _Workdir() as wd:
        staging = storage.download(pid, payload["stagingKey"], wd / "staging.parquet")
        try:
            return preview_mapping(staging, wd, payload["config"], payload["limit"])
        except ValueError as e:
            raise ApplicationError(str(e), type="InvalidMapping", non_retryable=True) from e


@activity.defn(name="buildDataset")
def build_dataset_activity(payload: dict) -> dict:
    _validate(payload, "BuildDatasetInput")
    pid = payload["projectId"]
    for k in ("stagingKey", "eventsKey", "casesKey", "reportKey"):
        storage.assert_project_key(pid, payload[k])
    with _Workdir() as wd:
        staging = storage.download(pid, payload["stagingKey"], wd / "staging.parquet")
        try:
            report, events, cases = build_dataset(staging, wd, payload)
        except ValueError as e:
            raise ApplicationError(str(e), type="InvalidMapping", non_retryable=True) from e
        storage.upload(pid, payload["eventsKey"], events)
        storage.upload(pid, payload["casesKey"], cases)
        storage.put_json(pid, payload["reportKey"], report)
    return {"qualityStatus": report["qualityStatus"]}


@activity.defn(name="validateBpmn")
def validate_bpmn_activity(payload: dict) -> dict:
    _validate(payload, "ValidateBpmnInput")
    with _Workdir() as wd:
        path = storage.download(payload["projectId"], payload["objectKey"], wd / "model.bpmn")
        return validate_bpmn(path)


@activity.defn(name="previewRule")
def preview_rule_activity(payload: dict) -> dict:
    _validate(payload, "PreviewRuleInput")
    with _Workdir() as wd:
        events = storage.download(payload["projectId"], payload["eventsKey"], wd / "events.parquet")
        con = connect(wd, "UTC")
        con.execute(f"CREATE TEMP VIEW ev AS SELECT * FROM read_parquet({lit(events.as_posix())})")
        rows = evaluate_rule(con, payload["rule"], payload["maxCases"])
        con.close()
        return summarize(rows)
