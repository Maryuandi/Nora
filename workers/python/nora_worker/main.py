import asyncio
import os

from temporalio.client import Client
from temporalio.worker import Worker

from nora_worker.activities import python_ping
from nora_worker.contracts import load_schema


async def main() -> None:
    load_schema("PingRequest")  # fail fast if contracts were not exported
    client = await Client.connect(os.environ.get("TEMPORAL_ADDRESS", "localhost:7233"))
    worker = Worker(client, task_queue="nora-python", activities=[python_ping])
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
