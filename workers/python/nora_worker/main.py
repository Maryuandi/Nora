import asyncio
import os
from concurrent.futures import ThreadPoolExecutor

from temporalio.client import Client
from temporalio.worker import Worker

from nora_worker.activities import python_ping
from nora_worker.contracts import load_schema
from nora_worker.data_activities import build_dataset_activity, ingest_snapshot, preview_mapping_activity, preview_rule_activity, run_process_analysis_activity, validate_bpmn_activity


async def main() -> None:
    load_schema("PingRequest")  # fail fast if contracts were not exported
    client = await Client.connect(os.environ.get("TEMPORAL_ADDRESS", "localhost:7233"), namespace=os.environ.get("TEMPORAL_NAMESPACE", "default"))
    worker = Worker(
        client,
        task_queue=os.environ.get("TASK_QUEUE_PYTHON", "nora-python"),
        activities=[python_ping, ingest_snapshot, preview_mapping_activity, build_dataset_activity, validate_bpmn_activity, preview_rule_activity, run_process_analysis_activity],
        # File parsing and DuckDB work are blocking; run them on threads, not the event loop.
        activity_executor=ThreadPoolExecutor(max_workers=int(os.environ.get("NORA_PY_ACTIVITY_THREADS", "4"))),
    )
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
