from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .tools import resolve_tool

SCHEMA = "workmuse.content.v1"
TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".rst", ".csv", ".tsv", ".json", ".yaml", ".yml", ".log"}
DOCUMENT_EXTENSIONS = {".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".html", ".htm", ".epub"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"}


@dataclass(frozen=True)
class Resource:
    id: str
    path: Path
    file_name: str
    mime_type: str
    kind: str
    size: int
    checksum: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "path": str(self.path),
            "fileName": self.file_name,
            "mimeType": self.mime_type,
            "kind": self.kind,
            "size": self.size,
            "checksum": self.checksum,
        }


def inspect_resource(path: Path, allowed_roots: tuple[Path, ...]) -> Resource:
    resolved = path.resolve(strict=True)
    if not resolved.is_file():
        raise ValueError("Resource path must be a file")
    if allowed_roots and not any(_is_relative_to(resolved, root) for root in allowed_roots):
        raise PermissionError("Resource path is outside the configured roots")

    checksum = hashlib.sha256()
    with resolved.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            checksum.update(chunk)
    digest = checksum.hexdigest()
    mime_type = mimetypes.guess_type(resolved.name)[0] or "application/octet-stream"
    return Resource(
        id=f"sha256:{digest}",
        path=resolved,
        file_name=resolved.name,
        mime_type=mime_type,
        kind=classify_resource(resolved, mime_type),
        size=resolved.stat().st_size,
        checksum=digest,
    )


def classify_resource(path: Path, mime_type: str) -> str:
    extension = path.suffix.lower()
    if extension in TEXT_EXTENSIONS or mime_type.startswith("text/"):
        return "text"
    if extension in DOCUMENT_EXTENSIONS:
        return "document"
    if extension in IMAGE_EXTENSIONS or mime_type.startswith("image/"):
        return "image"
    if extension in AUDIO_EXTENSIONS or mime_type.startswith("audio/"):
        return "audio"
    if extension in VIDEO_EXTENSIONS or mime_type.startswith("video/"):
        return "video"
    return "unknown"


def understand_text(resource: Resource) -> dict[str, Any]:
    raw = resource.path.read_bytes()
    text, encoding = decode_text(raw)
    blocks: list[dict[str, Any]] = []

    for index, match in enumerate(re.finditer(r"\S(?:.*?\S)?(?=\r?\n\s*\r?\n|\Z)", text, re.DOTALL)):
        value = match.group(0).strip()
        if not value:
            continue
        first_line = value.splitlines()[0]
        block_type = "heading" if _looks_like_heading(first_line, value) else "paragraph"
        blocks.extend(_split_text_block(
            value,
            block_type=block_type,
            start=match.start(),
            id_offset=len(blocks),
        ))

    return normalized_content(
        resource,
        blocks,
        metadata={"encoding": encoding, "characterCount": len(text)},
        provenance=[provenance("text-decode", "workmuse.text")],
    )


def normalized_content(
    resource: Resource,
    blocks: list[dict[str, Any]],
    *,
    metadata: dict[str, Any] | None = None,
    provenance: list[dict[str, Any]] | None = None,
    warnings: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "resource": resource.as_dict(),
        "title": resource.path.stem,
        "blocks": blocks,
        "metadata": metadata or {},
        "semantics": {"entities": [], "claims": [], "actionItems": []},
        "provenance": provenance or [],
        "warnings": warnings or [],
    }


def provenance(stage: str, adapter: str, version: str | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {
        "stage": stage,
        "adapter": adapter,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    if version:
        result["version"] = version
    return result


def persist_content(content: dict[str, Any], output_directory: Path) -> Path:
    output_directory.mkdir(parents=True, exist_ok=True)
    artifact = output_directory / "content.v1.json"
    descriptor, temporary_name = tempfile.mkstemp(prefix=".content-", suffix=".json", dir=output_directory)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(content, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(artifact)
    finally:
        temporary.unlink(missing_ok=True)
    return artifact


def decode_text(raw: bytes) -> tuple[str, str]:
    for encoding in ("utf-8-sig", "utf-8", "utf-16", "gb18030"):
        try:
            return raw.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace"), "utf-8-replace"


def chunk_content(content: dict[str, Any], max_characters: int = 4_000, overlap: int = 200) -> dict[str, Any]:
    chunked = []
    for block in content.get("blocks", []):
        text = str(block.get("text", ""))
        if len(text) <= max_characters:
            chunked.append(block)
            continue
        step = max_characters - overlap
        for offset in range(0, len(text), step):
            value = text[offset:offset + max_characters]
            if not value:
                continue
            location = dict(block.get("location", {"kind": "resource"}))
            if location.get("kind") == "text":
                base = int(location.get("start", 0))
                location["start"] = base + offset
                location["end"] = base + offset + len(value)
            chunked.append({
                **block,
                "id": f"{block['id']}-chunk-{len(chunked) + 1}",
                "text": value,
                "location": location,
                "metadata": {**block.get("metadata", {}), "parentBlockId": block["id"]},
            })
            if offset + max_characters >= len(text):
                break
    content["blocks"] = chunked
    return content


def _split_text_block(text: str, *, block_type: str, start: int, id_offset: int) -> list[dict[str, Any]]:
    if len(text) <= 4_000:
        return [{
            "id": f"block-{id_offset + 1}",
            "type": block_type,
            "text": text,
            "location": {"kind": "text", "start": start, "end": start + len(text)},
        }]
    temporary = {"blocks": [{
        "id": f"block-{id_offset + 1}",
        "type": block_type,
        "text": text,
        "location": {"kind": "text", "start": start, "end": start + len(text)},
    }]}
    return chunk_content(temporary)["blocks"]


def _looks_like_heading(first_line: str, value: str) -> bool:
    return (
        first_line.startswith("#")
        or ("\n" not in value and len(first_line) <= 80 and not first_line.endswith(("。", ".", "！", "!", "？", "?")))
    )


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False
