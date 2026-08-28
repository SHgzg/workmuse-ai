from __future__ import annotations

import argparse
import asyncio
import json
import os
import platform
import signal
import sys
import time
import uuid
from pathlib import Path
from typing import Any

from . import __version__
from .tools import TOOLS, probe_tool, resolve_tool, sanitized_environment
from .understanding import understand_resource
from .jobs import JobStore
from .search import ContentIndex
from .ai import answer_question, embed_texts
from .runtime import inspect_runtime

PROTOCOL_VERSION = 1
MAX_CAPTURE_BYTES = 10 * 1024 * 1024


class WorkerServer:
    def __init__(
        self,
        max_concurrency: int,
        allowed_roots: tuple[Path, ...] = (),
        state_directory: Path | None = None,
    ) -> None:
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._max_concurrency = max_concurrency
        self._jobs: dict[str, asyncio.Task[None]] = {}
        self._processes: dict[str, asyncio.subprocess.Process] = {}
        self._write_lock = asyncio.Lock()
        self._stopping = False
        self._allowed_roots = tuple(root.resolve() for root in allowed_roots)
        self._job_store = JobStore(state_directory) if state_directory else None
        self._content_index = ContentIndex(state_directory) if state_directory else None

    async def serve(self) -> None:
        while not self._stopping:
            line = await asyncio.to_thread(sys.stdin.readline)
            if not line:
                break
            try:
                request = json.loads(line)
                self._validate_request(request)
                job_id = request["id"]
                if self._job_store and request["method"] in {"resources.understand", "tools.run"}:
                    self._job_store.create(job_id, request["method"], request.get("params", {}))
                task = asyncio.create_task(self._dispatch(request))
                self._jobs[job_id] = task
                task.add_done_callback(lambda _task, key=job_id: self._jobs.pop(key, None))
            except Exception as error:
                request_id = request.get("id", "unknown") if isinstance(request, dict) else "unknown"
                await self._error(request_id, "invalid_request", str(error))

        await self._cancel_all()

    def _validate_request(self, request: Any) -> None:
        if not isinstance(request, dict):
            raise ValueError("Request must be an object")
        if request.get("version") != PROTOCOL_VERSION:
            raise ValueError("Unsupported protocol version")
        if not isinstance(request.get("id"), str) or not request["id"]:
            raise ValueError("Request id is required")
        if not isinstance(request.get("method"), str):
            raise ValueError("Request method is required")
        if not isinstance(request.get("params", {}), dict):
            raise ValueError("Request params must be an object")

    async def _dispatch(self, request: dict[str, Any]) -> None:
        job_id = request["id"]
        method = request["method"]
        params = request.get("params", {})
        try:
            if self._job_store and method in {"resources.understand", "tools.run"}:
                self._job_store.running(job_id)
            if method == "system.health":
                result = {
                    "status": "ok",
                    "protocolVersion": PROTOCOL_VERSION,
                    "workerVersion": __version__,
                    "pythonVersion": platform.python_version(),
                    "platform": platform.platform(),
                    "activeJobs": max(0, len(self._jobs) - 1),
                    "maxConcurrency": self._max_concurrency,
                    "index": self._content_index.stats() if self._content_index else None,
                }
            elif method == "system.shutdown":
                self._stopping = True
                result = {"stopping": True}
            elif method == "tools.list":
                result = await asyncio.gather(*(probe_tool(tool_id) for tool_id in TOOLS))
            elif method == "runtime.inspect":
                result = inspect_runtime()
            elif method == "tools.probe":
                result = await probe_tool(self._required_string(params, "toolId"))
            elif method == "tools.run":
                result = await self._run_tool(job_id, params)
            elif method == "jobs.get":
                if not self._job_store:
                    raise ValueError("Persistent job storage is disabled")
                result = self._job_store.get(self._required_string(params, "jobId"))
            elif method == "jobs.list":
                if not self._job_store:
                    raise ValueError("Persistent job storage is disabled")
                limit = params.get("limit", 100)
                result = self._job_store.list(limit if isinstance(limit, int) else 100)
            elif method == "jobs.retry":
                if not self._job_store:
                    raise ValueError("Persistent job storage is disabled")
                original = self._job_store.get(self._required_string(params, "jobId"))
                if not original or original["method"] not in {"resources.understand", "tools.run"}:
                    raise ValueError("Job is not retryable")
                retry_id = str(uuid.uuid4())
                retry_request = {
                    "version": PROTOCOL_VERSION,
                    "id": retry_id,
                    "method": original["method"],
                    "params": original["params"],
                }
                self._job_store.create(retry_id, original["method"], original["params"])
                retry_task = asyncio.create_task(self._dispatch(retry_request))
                self._jobs[retry_id] = retry_task
                retry_task.add_done_callback(lambda _task, key=retry_id: self._jobs.pop(key, None))
                result = {"jobId": retry_id}
            elif method == "search.query":
                if not self._content_index:
                    raise ValueError("Content index is disabled")
                resource_ids = params.get("resourceIds")
                query = self._required_string(params, "query")
                embedding = await embed_texts([query], allow_cloud=params.get("allowCloud") is True)
                result = self._content_index.hybrid_search(
                    query,
                    query_vector=embedding[1][0] if embedding else None,
                    embedding_model=embedding[0] if embedding else None,
                    limit=params.get("limit", 20) if isinstance(params.get("limit", 20), int) else 20,
                    resource_ids=resource_ids if isinstance(resource_ids, list) else None,
                )
            elif method == "search.context":
                if not self._content_index:
                    raise ValueError("Content index is disabled")
                resource_ids = params.get("resourceIds")
                max_characters = params.get("maxCharacters", 12_000)
                query = self._required_string(params, "query")
                embedding = await embed_texts([query], allow_cloud=params.get("allowCloud") is True)
                result = self._content_index.context(
                    query,
                    max_characters=max_characters if isinstance(max_characters, int) else 12_000,
                    resource_ids=resource_ids if isinstance(resource_ids, list) else None,
                    query_vector=embedding[1][0] if embedding else None,
                    embedding_model=embedding[0] if embedding else None,
                )
            elif method == "index.rebuild":
                if not self._content_index:
                    raise ValueError("Content index is disabled")
                result = self._content_index.rebuild(list(self._allowed_roots))
            elif method == "index.remove":
                if not self._content_index:
                    raise ValueError("Content index is disabled")
                result = {"removed": self._content_index.remove(self._required_string(params, "resourceId"))}
            elif method == "questions.answer":
                if not self._content_index:
                    raise ValueError("Content index is disabled")
                resource_ids = params.get("resourceIds")
                question = self._required_string(params, "question")
                embedding = await embed_texts([question], allow_cloud=params.get("allowCloud") is True)
                context = self._content_index.context(
                    question,
                    max_characters=params.get("maxCharacters", 12_000)
                    if isinstance(params.get("maxCharacters", 12_000), int) else 12_000,
                    resource_ids=resource_ids if isinstance(resource_ids, list) else None,
                    query_vector=embedding[1][0] if embedding else None,
                    embedding_model=embedding[0] if embedding else None,
                )
                result = await answer_question(context, allow_cloud=params.get("allowCloud") is True)
            elif method == "resources.understand":
                async with self._semaphore:
                    result = await understand_resource(
                        Path(self._required_string(params, "path")),
                        Path(self._required_string(params, "outputDirectory")),
                        self._allowed_roots,
                        lambda event, data: self._event(job_id, event, data),
                        language=params.get("language") if isinstance(params.get("language"), str) else None,
                        allow_cloud=params.get("allowCloud") is True,
                    )
                if self._content_index:
                    result["index"] = self._content_index.upsert(result["content"])
                    blocks = result["content"].get("blocks", [])
                    try:
                        embedding = await embed_texts(
                            [str(block.get("text", "")) for block in blocks],
                            allow_cloud=params.get("allowCloud") is True,
                        )
                        if embedding:
                            result["index"]["indexedEmbeddings"] = self._content_index.upsert_embeddings(
                                result["content"]["resource"]["id"],
                                embedding[0],
                                [str(block["id"]) for block in blocks],
                                embedding[1],
                            )
                    except Exception as error:
                        result["content"]["warnings"].append({
                            "code": "embedding_failed",
                            "message": str(error),
                        })
            elif method == "task.cancel":
                result = await self._cancel(self._required_string(params, "jobId"))
            else:
                raise ValueError(f"Unknown method: {method}")
            if self._job_store and method in {"resources.understand", "tools.run"}:
                self._job_store.succeeded(job_id, result)
            await self._result(job_id, result)
        except asyncio.CancelledError:
            if self._job_store:
                self._job_store.cancelled(job_id)
            await self._error(job_id, "cancelled", "Task was cancelled")
        except FileNotFoundError as error:
            if self._job_store:
                self._job_store.failed(job_id, "tool_unavailable", str(error))
            await self._error(job_id, "tool_unavailable", str(error))
        except asyncio.TimeoutError:
            if self._job_store:
                self._job_store.failed(job_id, "timeout", "Tool execution timed out")
            await self._error(job_id, "timeout", "Tool execution timed out")
        except Exception as error:
            if self._job_store:
                self._job_store.failed(job_id, "execution_error", str(error))
            await self._error(job_id, "execution_error", str(error))

    async def _run_tool(self, job_id: str, params: dict[str, Any]) -> dict[str, Any]:
        tool_id = self._required_string(params, "toolId")
        args = params.get("args", [])
        if not isinstance(args, list) or not all(isinstance(arg, str) for arg in args):
            raise ValueError("args must be an array of strings")

        cwd_value = params.get("cwd")
        cwd = Path(cwd_value).resolve() if isinstance(cwd_value, str) else Path.cwd().resolve()
        if not cwd.is_dir():
            raise ValueError("cwd must be an existing directory")
        if self._allowed_roots and not any(self._is_relative_to(cwd, root) for root in self._allowed_roots):
            raise PermissionError("cwd is outside the configured roots")

        timeout = params.get("timeoutSeconds", 300)
        if not isinstance(timeout, (int, float)) or timeout <= 0 or timeout > 3600:
            raise ValueError("timeoutSeconds must be between 0 and 3600")

        _definition, executable = resolve_tool(tool_id)
        started = time.monotonic()
        async with self._semaphore:
            await self._event(job_id, "started", {"toolId": tool_id})
            process = await asyncio.create_subprocess_exec(
                executable,
                *args,
                cwd=str(cwd),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                creationflags=self._creation_flags(),
                start_new_session=os.name != "nt",
                env=sanitized_environment(),
            )
            self._processes[job_id] = process
            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=float(timeout))
            except (asyncio.TimeoutError, asyncio.CancelledError):
                await self._terminate_process(process)
                raise
            finally:
                self._processes.pop(job_id, None)

        return {
            "toolId": tool_id,
            "exitCode": process.returncode,
            "stdout": self._decode(stdout),
            "stderr": self._decode(stderr),
            "durationMs": round((time.monotonic() - started) * 1000),
        }

    async def _cancel(self, job_id: str) -> dict[str, bool]:
        process = self._processes.get(job_id)
        if process:
            await self._terminate_process(process)
        task = self._jobs.get(job_id)
        if task and not task.done():
            task.cancel()
            return {"cancelled": True}
        return {"cancelled": False}

    async def _cancel_all(self) -> None:
        current = asyncio.current_task()
        for process in list(self._processes.values()):
            await self._terminate_process(process)
        for task in list(self._jobs.values()):
            if task is not current and not task.done():
                task.cancel()

    async def _terminate_process(self, process: asyncio.subprocess.Process) -> None:
        if process.returncode is not None:
            return
        if os.name == "nt":
            process.terminate()
        else:
            os.killpg(process.pid, signal.SIGTERM)
        try:
            await asyncio.wait_for(process.wait(), timeout=3)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()

    async def _send(self, message: dict[str, Any]) -> None:
        async with self._write_lock:
            sys.stdout.write(json.dumps(message, ensure_ascii=False, separators=(",", ":")) + "\n")
            sys.stdout.flush()

    async def _result(self, job_id: str, result: Any) -> None:
        await self._send({"version": PROTOCOL_VERSION, "id": job_id, "type": "result", "result": result})

    async def _error(self, job_id: str, code: str, message: str) -> None:
        await self._send({
            "version": PROTOCOL_VERSION,
            "id": job_id,
            "type": "error",
            "error": {"code": code, "message": message},
        })

    async def _event(self, job_id: str, event: str, data: Any) -> None:
        await self._send({"version": PROTOCOL_VERSION, "id": job_id, "type": "event", "event": event, "data": data})

    @staticmethod
    def _required_string(params: dict[str, Any], name: str) -> str:
        value = params.get(name)
        if not isinstance(value, str) or not value:
            raise ValueError(f"{name} is required")
        return value

    @staticmethod
    def _decode(value: bytes) -> str:
        return value[:MAX_CAPTURE_BYTES].decode("utf-8", errors="replace")

    @staticmethod
    def _creation_flags() -> int:
        return 0x00000200 if os.name == "nt" else 0  # CREATE_NEW_PROCESS_GROUP

    @staticmethod
    def _is_relative_to(path: Path, root: Path) -> bool:
        try:
            path.relative_to(root)
            return True
        except ValueError:
            return False


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="strict", newline="\n")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="WorkMuse JSONL worker")
    parser.add_argument("--max-concurrency", type=int, default=2)
    parser.add_argument("--allowed-root", action="append", default=[])
    parser.add_argument("--state-directory")
    args = parser.parse_args()
    if args.max_concurrency < 1 or args.max_concurrency > 16:
        parser.error("--max-concurrency must be between 1 and 16")
    asyncio.run(WorkerServer(
        args.max_concurrency,
        tuple(Path(root) for root in args.allowed_root),
        Path(args.state_directory) if args.state_directory else None,
    ).serve())


if __name__ == "__main__":
    main()
