import json
from pathlib import Path

SCHEMAS_DIR = Path(__file__).resolve().parents[3] / "packages/contracts/schemas"


def load_schema(name: str) -> dict:
    path = SCHEMAS_DIR / f"{name}.json"
    if not path.is_file():
        raise FileNotFoundError(
            f"JSON Schema {name} not found at {path}; run pnpm contracts:export"
        )
    return json.loads(path.read_text())
