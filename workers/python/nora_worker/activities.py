import jsonschema
import pm4py
from temporalio import activity
from temporalio.exceptions import ApplicationError

from nora_worker.contracts import load_schema


@activity.defn(name="pythonPing")
async def python_ping(payload: dict) -> dict:
    try:
        jsonschema.validate(payload, load_schema("PingRequest"))
    except jsonschema.ValidationError as e:
        raise ApplicationError(
            f"Invalid PingRequest: {e.message}", non_retryable=True
        ) from e
    return {
        "message": payload["message"],
        "pm4pyVersion": pm4py.__version__,
        "handledBy": "python",
    }
