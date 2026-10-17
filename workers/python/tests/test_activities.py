import asyncio

import pm4py
import pytest
from temporalio.exceptions import ApplicationError

from nora_worker.activities import python_ping


def test_ping_returns_result():
    result = asyncio.run(python_ping({"message": "hi"}))
    assert result["message"] == "hi"
    assert result["handledBy"] == "python"
    assert result["pm4pyVersion"] == pm4py.__version__


@pytest.mark.parametrize("payload", [{}, {"message": "a" * 201}])
def test_invalid_payload_is_non_retryable(payload):
    with pytest.raises(ApplicationError) as exc:
        asyncio.run(python_ping(payload))
    assert exc.value.non_retryable is True
