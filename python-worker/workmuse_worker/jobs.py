from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class JobStore:
    def __init__(self, state_directory: Path) -> None:
        state_directory.mkdir(parents=True, exist_ok=True)
        self._database = state_directory / "jobs.sqlite3"
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    method TEXT NOT NULL,
                    status TEXT NOT NULL,
                    params_json TEXT NOT NULL,
                    result_json TEXT,
                    error_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            now = _now()
            connection.execute(
                "UPDATE jobs SET status = 'interrupted', updated_at = ? WHERE status IN ('queued', 'running')",
                (now,),
            )

    def create(self, job_id: str, method: str, params: dict[str, Any]) -> None:
        now = _now()
        with self._connect() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO jobs VALUES (?, ?, 'queued', ?, NULL, NULL, ?, ?)",
                (job_id, method, json.dumps(params, ensure_ascii=False), now, now),
            )

    def running(self, job_id: str) -> None:
        self._update(job_id, "running")

    def succeeded(self, job_id: str, result: Any) -> None:
        self._update(job_id, "succeeded", result=result)

    def failed(self, job_id: str, code: str, message: str) -> None:
        self._update(job_id, "failed", error={"code": code, "message": message})

    def cancelled(self, job_id: str) -> None:
        self._update(job_id, "cancelled")

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return _row(row) if row else None

    def list(self, limit: int = 100) -> list[dict[str, Any]]:
        limit = max(1, min(limit, 500))
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [_row(row) for row in rows]

    def _update(self, job_id: str, status: str, *, result: Any = None, error: Any = None) -> None:
        with self._connect() as connection:
            connection.execute(
                "UPDATE jobs SET status = ?, result_json = ?, error_json = ?, updated_at = ? WHERE id = ?",
                (
                    status,
                    json.dumps(result, ensure_ascii=False) if result is not None else None,
                    json.dumps(error, ensure_ascii=False) if error is not None else None,
                    _now(),
                    job_id,
                ),
            )

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self._database, timeout=10)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()


def _row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "method": row["method"],
        "status": row["status"],
        "params": json.loads(row["params_json"]),
        "result": json.loads(row["result_json"]) if row["result_json"] else None,
        "error": json.loads(row["error_json"]) if row["error_json"] else None,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
