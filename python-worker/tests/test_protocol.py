from __future__ import annotations

import asyncio
import json
import sys
import tempfile
import unittest
from pathlib import Path


class ProtocolTests(unittest.IsolatedAsyncioTestCase):
    async def test_resource_understanding_over_jsonl(self) -> None:
        worker_entry = Path(__file__).parents[1] / "worker.py"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "note.txt"
            source.write_text("核心目标\n\n完成多模态资料理解。", encoding="utf-8")
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                str(worker_entry),
                "--allowed-root",
                str(root),
                "--state-directory",
                str(root / "state"),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            assert process.stdin is not None
            assert process.stdout is not None
            request = {
                "version": 1,
                "id": "understand-1",
                "method": "resources.understand",
                "params": {"path": str(source), "outputDirectory": str(root / "artifacts")},
            }
            process.stdin.write((json.dumps(request) + "\n").encode())
            await process.stdin.drain()

            messages = []
            while True:
                line = await asyncio.wait_for(process.stdout.readline(), timeout=5)
                message = json.loads(line)
                messages.append(message)
                if message["type"] in {"result", "error"}:
                    break

            self.assertEqual(messages[-1]["type"], "result")
            self.assertEqual(messages[-1]["result"]["content"]["schema"], "workmuse.content.v1")
            self.assertGreaterEqual(len([item for item in messages if item["type"] == "event"]), 2)

            job_request = {
                "version": 1,
                "id": "job-get-1",
                "method": "jobs.get",
                "params": {"jobId": "understand-1"},
            }
            process.stdin.write((json.dumps(job_request) + "\n").encode())
            await process.stdin.drain()
            job_message = json.loads(await asyncio.wait_for(process.stdout.readline(), timeout=5))
            self.assertEqual(job_message["result"]["status"], "succeeded")
            self.assertEqual(job_message["result"]["method"], "resources.understand")

            shutdown = {"version": 1, "id": "shutdown-1", "method": "system.shutdown", "params": {}}
            process.stdin.write((json.dumps(shutdown) + "\n").encode())
            await process.stdin.drain()
            await asyncio.wait_for(process.stdout.readline(), timeout=5)
            process.stdin.close()
            await asyncio.wait_for(process.wait(), timeout=5)
            self.assertEqual(process.returncode, 0)
