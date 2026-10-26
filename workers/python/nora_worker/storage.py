"""Object storage access. Every call names the project and refuses keys outside projects/{projectId}/."""

import json
import os
import re
from pathlib import Path

import boto3
from botocore.config import Config
from temporalio.exceptions import ApplicationError

_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
_client = None


def assert_project_key(project_id: str, key: str) -> None:
    if not _UUID.match(project_id) or not key.startswith(f"projects/{project_id}/") or ".." in key:
        raise ApplicationError(f"object key outside project prefix: {key}", type="ProjectKeyViolation", non_retryable=True)


def _s3():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=os.environ.get("S3_ENDPOINT"),
            aws_access_key_id=os.environ.get("S3_ACCESS_KEY"),
            aws_secret_access_key=os.environ.get("S3_SECRET_KEY"),
            region_name=os.environ.get("S3_REGION", "us-east-1"),
            config=Config(s3={"addressing_style": "path"}, retries={"max_attempts": 3}),
        )
    return _client


def _bucket() -> str:
    return os.environ.get("S3_BUCKET", "nora")


def download(project_id: str, key: str, dest: Path) -> Path:
    assert_project_key(project_id, key)
    _s3().download_file(_bucket(), key, str(dest))
    return dest


def upload(project_id: str, key: str, src: Path, content_type: str = "application/octet-stream") -> None:
    assert_project_key(project_id, key)
    _s3().upload_file(str(src), _bucket(), key, ExtraArgs={"ContentType": content_type})


def put_json(project_id: str, key: str, value) -> None:
    assert_project_key(project_id, key)
    _s3().put_object(Bucket=_bucket(), Key=key, Body=json.dumps(value, default=str).encode(), ContentType="application/json")


def get_json(project_id: str, key: str):
    assert_project_key(project_id, key)
    return json.loads(_s3().get_object(Bucket=_bucket(), Key=key)["Body"].read())
