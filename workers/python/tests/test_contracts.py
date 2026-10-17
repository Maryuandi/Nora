import pytest

from nora_worker.contracts import load_schema


def test_missing_schema_points_to_export_command():
    with pytest.raises(FileNotFoundError, match="pnpm contracts:export"):
        load_schema("Missing")
