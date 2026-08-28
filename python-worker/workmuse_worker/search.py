from __future__ import annotations

import json
import math
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any


class ContentIndex:
    def __init__(self, state_directory: Path) -> None:
        state_directory.mkdir(parents=True, exist_ok=True)
        self._database = state_directory / "content-index.sqlite3"
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS resources (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    path TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    checksum TEXT NOT NULL,
                    metadata_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS blocks (
                    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    resource_id TEXT NOT NULL,
                    block_id TEXT NOT NULL,
                    block_type TEXT NOT NULL,
                    text TEXT NOT NULL,
                    location_json TEXT NOT NULL,
                    metadata_json TEXT NOT NULL,
                    UNIQUE(resource_id, block_id),
                    FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
                    text,
                    content='blocks',
                    content_rowid='row_id',
                    tokenize='unicode61'
                );
                CREATE TABLE IF NOT EXISTS embeddings (
                    resource_id TEXT NOT NULL,
                    block_id TEXT NOT NULL,
                    model TEXT NOT NULL,
                    vector_json TEXT NOT NULL,
                    PRIMARY KEY(resource_id, block_id, model),
                    FOREIGN KEY(resource_id, block_id) REFERENCES blocks(resource_id, block_id) ON DELETE CASCADE
                );
                CREATE TRIGGER IF NOT EXISTS blocks_ai AFTER INSERT ON blocks BEGIN
                    INSERT INTO blocks_fts(rowid, text) VALUES (new.row_id, new.text);
                END;
                CREATE TRIGGER IF NOT EXISTS blocks_ad AFTER DELETE ON blocks BEGIN
                    INSERT INTO blocks_fts(blocks_fts, rowid, text) VALUES ('delete', old.row_id, old.text);
                END;
                CREATE TRIGGER IF NOT EXISTS blocks_au AFTER UPDATE ON blocks BEGIN
                    INSERT INTO blocks_fts(blocks_fts, rowid, text) VALUES ('delete', old.row_id, old.text);
                    INSERT INTO blocks_fts(rowid, text) VALUES (new.row_id, new.text);
                END;
                """
            )

    def upsert(self, content: dict[str, Any]) -> dict[str, Any]:
        resource = content["resource"]
        resource_id = str(resource["id"])
        blocks = [block for block in content.get("blocks", []) if isinstance(block, dict) and block.get("text")]
        with self._connect() as connection:
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute(
                """
                INSERT INTO resources(id, title, path, mime_type, checksum, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title, path=excluded.path, mime_type=excluded.mime_type,
                    checksum=excluded.checksum, metadata_json=excluded.metadata_json
                """,
                (
                    resource_id,
                    content.get("title"),
                    resource["path"],
                    resource["mimeType"],
                    resource["checksum"],
                    json.dumps(content.get("metadata", {}), ensure_ascii=False),
                ),
            )
            connection.execute("DELETE FROM blocks WHERE resource_id = ?", (resource_id,))
            connection.executemany(
                """
                INSERT INTO blocks(resource_id, block_id, block_type, text, location_json, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        resource_id,
                        str(block["id"]),
                        str(block.get("type", "paragraph")),
                        str(block["text"]),
                        json.dumps(block.get("location", {"kind": "resource"}), ensure_ascii=False),
                        json.dumps(block.get("metadata", {}), ensure_ascii=False),
                    )
                    for block in blocks
                ],
            )
        return {"resourceId": resource_id, "indexedBlocks": len(blocks)}

    def upsert_embeddings(
        self, resource_id: str, model: str, block_ids: list[str], vectors: list[list[float]]
    ) -> int:
        if len(block_ids) != len(vectors):
            raise ValueError("Block and embedding counts differ")
        with self._connect() as connection:
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("DELETE FROM embeddings WHERE resource_id = ? AND model = ?", (resource_id, model))
            connection.executemany(
                "INSERT INTO embeddings(resource_id, block_id, model, vector_json) VALUES (?, ?, ?, ?)",
                [
                    (resource_id, block_id, model, json.dumps(vector, separators=(",", ":")))
                    for block_id, vector in zip(block_ids, vectors, strict=True)
                ],
            )
        return len(vectors)

    def search(self, query: str, *, limit: int = 20, resource_ids: list[str] | None = None) -> list[dict[str, Any]]:
        query = query.strip()
        if not query:
            return []
        limit = max(1, min(limit, 100))
        resource_filter, resource_values = _resource_filter(resource_ids)
        phrase = f'"{query.replace(chr(34), chr(34) * 2)}"'
        sql = f"""
            SELECT b.*, r.title, r.path, bm25(blocks_fts) AS rank
            FROM blocks_fts
            JOIN blocks b ON b.row_id = blocks_fts.rowid
            JOIN resources r ON r.id = b.resource_id
            WHERE blocks_fts MATCH ? {resource_filter}
            ORDER BY rank
            LIMIT ?
        """
        try:
            with self._connect() as connection:
                rows = connection.execute(sql, (phrase, *resource_values, limit)).fetchall()
        except sqlite3.OperationalError:
            rows = []

        if not rows:
            like_sql = f"""
                SELECT b.*, r.title, r.path, 1000.0 AS rank
                FROM blocks b JOIN resources r ON r.id = b.resource_id
                WHERE b.text LIKE ? ESCAPE '\\' {resource_filter}
                ORDER BY length(b.text)
                LIMIT ?
            """
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            with self._connect() as connection:
                rows = connection.execute(like_sql, (f"%{escaped}%", *resource_values, limit)).fetchall()
        return [_search_result(row) for row in rows]

    def context(
        self,
        query: str,
        *,
        max_characters: int = 12_000,
        resource_ids: list[str] | None = None,
        query_vector: list[float] | None = None,
        embedding_model: str | None = None,
    ) -> dict[str, Any]:
        candidates = self.hybrid_search(
            query,
            query_vector=query_vector,
            embedding_model=embedding_model,
            limit=50,
            resource_ids=resource_ids,
        )
        selected = []
        used = 0
        for candidate in candidates:
            text = candidate["text"]
            if selected and used + len(text) > max_characters:
                continue
            selected.append(candidate)
            used += len(text)
            if used >= max_characters:
                break
        return {
            "query": query,
            "blocks": selected,
            "characterCount": used,
            "citations": [item["evidence"] for item in selected],
        }

    def hybrid_search(
        self,
        query: str,
        *,
        query_vector: list[float] | None = None,
        embedding_model: str | None = None,
        limit: int = 20,
        resource_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        lexical = self.search(query, limit=max(limit, 50), resource_ids=resource_ids)
        if not query_vector or not embedding_model:
            return lexical[:limit]
        semantic = self._vector_search(query_vector, embedding_model, max(limit, 50), resource_ids)
        fused: dict[tuple[str, str], dict[str, Any]] = {}
        scores: dict[tuple[str, str], float] = {}
        for ranking in (lexical, semantic):
            for rank, item in enumerate(ranking, start=1):
                key = (item["resourceId"], item["blockId"])
                fused[key] = item
                scores[key] = scores.get(key, 0.0) + 1.0 / (60 + rank)
        ordered = sorted(fused, key=lambda key: scores[key], reverse=True)[:limit]
        return [{**fused[key], "score": round(scores[key], 6)} for key in ordered]

    def _vector_search(
        self,
        query_vector: list[float],
        model: str,
        limit: int,
        resource_ids: list[str] | None,
    ) -> list[dict[str, Any]]:
        resource_filter, resource_values = _resource_filter(resource_ids)
        sql = f"""
            SELECT b.*, r.title, r.path, e.vector_json
            FROM embeddings e
            JOIN blocks b ON b.resource_id = e.resource_id AND b.block_id = e.block_id
            JOIN resources r ON r.id = b.resource_id
            WHERE e.model = ? {resource_filter}
        """
        with self._connect() as connection:
            rows = connection.execute(sql, (model, *resource_values)).fetchall()
        scored = []
        for row in rows:
            vector = json.loads(row["vector_json"])
            similarity = _cosine(query_vector, vector)
            item = _search_result(row)
            item["score"] = similarity
            scored.append(item)
        return sorted(scored, key=lambda item: item["score"], reverse=True)[:limit]

    def stats(self) -> dict[str, int]:
        with self._connect() as connection:
            resources = connection.execute("SELECT count(*) FROM resources").fetchone()[0]
            blocks = connection.execute("SELECT count(*) FROM blocks").fetchone()[0]
        return {"resources": resources, "blocks": blocks}

    def remove(self, resource_id: str) -> bool:
        with self._connect() as connection:
            connection.execute("PRAGMA foreign_keys=ON")
            cursor = connection.execute("DELETE FROM resources WHERE id = ?", (resource_id,))
        return cursor.rowcount > 0

    def rebuild(self, artifact_roots: list[Path]) -> dict[str, Any]:
        indexed_resources = 0
        indexed_blocks = 0
        failures = []
        for root in artifact_roots:
            if not root.exists():
                continue
            for artifact in root.rglob("content.v1.json"):
                try:
                    content = json.loads(artifact.read_text(encoding="utf-8"))
                    if content.get("schema") != "workmuse.content.v1":
                        continue
                    result = self.upsert(content)
                    indexed_resources += 1
                    indexed_blocks += result["indexedBlocks"]
                except Exception as error:
                    failures.append({"path": str(artifact), "error": str(error)})
        return {
            "indexedResources": indexed_resources,
            "indexedBlocks": indexed_blocks,
            "failures": failures,
        }

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


def _resource_filter(resource_ids: list[str] | None) -> tuple[str, list[str]]:
    if not resource_ids:
        return "", []
    values = [value for value in resource_ids if isinstance(value, str) and value]
    if not values:
        return "", []
    placeholders = ",".join("?" for _ in values)
    return f"AND b.resource_id IN ({placeholders})", values


def _search_result(row: sqlite3.Row) -> dict[str, Any]:
    location = json.loads(row["location_json"])
    return {
        "resourceId": row["resource_id"],
        "blockId": row["block_id"],
        "type": row["block_type"],
        "text": row["text"],
        "title": row["title"],
        "path": row["path"],
        "location": location,
        "score": round(-float(row["rank"]), 6) if "rank" in row.keys() else 0.0,
        "evidence": {
            "resourceId": row["resource_id"],
            "blockId": row["block_id"],
            "location": location,
        },
    }


def _cosine(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        return -1.0
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    return dot / (left_norm * right_norm) if left_norm and right_norm else -1.0
