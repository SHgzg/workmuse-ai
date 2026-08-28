from __future__ import annotations

import asyncio
import base64
import json
import mimetypes
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from .content import provenance


@dataclass(frozen=True)
class ModelConfig:
    base_url: str
    model: str
    api_key: str | None = None
    timeout_seconds: int = 120

    @classmethod
    def from_environment(cls) -> "ModelConfig | None":
        base_url = os.environ.get("WORKMUSE_AI_BASE_URL", "").strip().rstrip("/")
        model = os.environ.get("WORKMUSE_AI_MODEL", "").strip()
        if not base_url or not model:
            return None
        return cls(base_url, model, os.environ.get("WORKMUSE_AI_API_KEY"))

    @property
    def is_local(self) -> bool:
        host = urllib.parse.urlparse(self.base_url).hostname
        return host in {"localhost", "127.0.0.1", "::1"}


async def embed_texts(texts: list[str], *, allow_cloud: bool) -> tuple[str, list[list[float]]] | None:
    model = os.environ.get("WORKMUSE_EMBEDDING_MODEL", "").strip()
    base_url = os.environ.get("WORKMUSE_AI_BASE_URL", "").strip().rstrip("/")
    if not model or not base_url or not texts:
        return None
    config = ModelConfig(base_url, model, os.environ.get("WORKMUSE_AI_API_KEY"))
    if not config.is_local and not allow_cloud:
        return None
    vectors: list[list[float]] = []
    for offset in range(0, len(texts), 64):
        batch = texts[offset:offset + 64]
        vectors.extend(await asyncio.to_thread(_request_embeddings, config, batch))
    if len(vectors) != len(texts):
        raise ValueError("Embedding provider returned an unexpected vector count")
    return model, vectors


async def transcribe_file(path: str, *, allow_cloud: bool, language: str | None = None) -> dict[str, Any] | None:
    model = os.environ.get("WORKMUSE_TRANSCRIPTION_MODEL", "").strip()
    base_url = os.environ.get("WORKMUSE_AI_BASE_URL", "").strip().rstrip("/")
    if not model or not base_url:
        return None
    config = ModelConfig(base_url, model, os.environ.get("WORKMUSE_AI_API_KEY"), timeout_seconds=1800)
    if not config.is_local and not allow_cloud:
        return None
    return await asyncio.to_thread(_request_transcription, config, path, language)


async def enrich_content(content: dict[str, Any], *, allow_cloud: bool) -> dict[str, Any]:
    config = ModelConfig.from_environment()
    if config is None:
        content["warnings"].append({
            "code": "semantic_model_unconfigured",
            "message": "Structural extraction succeeded; no semantic model is configured.",
        })
        return content
    if not config.is_local and not allow_cloud:
        content["warnings"].append({
            "code": "cloud_processing_denied",
            "message": "Semantic enrichment was skipped because cloud processing is disabled.",
        })
        return content

    raw = await asyncio.to_thread(_request_semantics, config, content)
    content["semantics"] = normalize_semantics(raw, content)
    content["provenance"].append(provenance("semantic-enrichment", f"openai-compatible:{config.model}"))
    return content


async def answer_question(context: dict[str, Any], *, allow_cloud: bool) -> dict[str, Any]:
    config = ModelConfig.from_environment()
    if config is None:
        return {
            "status": "model-unavailable",
            "answer": None,
            "citations": context.get("citations", []),
            "context": context,
            "message": "No semantic model is configured.",
        }
    if not config.is_local and not allow_cloud:
        return {
            "status": "cloud-processing-denied",
            "answer": None,
            "citations": context.get("citations", []),
            "context": context,
            "message": "Cloud processing is disabled for this request.",
        }

    blocks = context.get("blocks", [])
    prompt = json.dumps(
        {"question": context.get("query"), "evidenceBlocks": [
            {"blockId": block.get("blockId"), "title": block.get("title"), "text": block.get("text")}
            for block in blocks
        ]},
        ensure_ascii=False,
    )
    system = (
        "Answer only from the supplied evidence blocks. Return JSON with answer, citationBlockIds, and followUps. "
        "If evidence is insufficient, say so in answer. Never cite an ID absent from evidenceBlocks."
    )
    raw = await asyncio.to_thread(_request_json, config, system, prompt)
    evidence_by_block = {item["blockId"]: item["evidence"] for item in blocks if item.get("blockId")}
    requested_ids = raw.get("citationBlockIds", [])
    citations = [evidence_by_block[block_id] for block_id in requested_ids if block_id in evidence_by_block]
    return {
        "status": "answered",
        "answer": _text(raw.get("answer")),
        "citations": citations,
        "followUps": [_text(item) for item in raw.get("followUps", []) if _text(item)]
        if isinstance(raw.get("followUps"), list) else [],
        "context": context,
        "model": config.model,
    }


async def enrich_image_content(content: dict[str, Any], *, allow_cloud: bool) -> dict[str, Any]:
    config = ModelConfig.from_environment()
    if config is None or (not config.is_local and not allow_cloud):
        content["warnings"].append({
            "code": "vision_model_unavailable",
            "message": "Image metadata was extracted, but no permitted vision model is configured.",
        })
        return content
    path = str(content["resource"]["path"])
    raw = await asyncio.to_thread(_request_image_json, config, path)
    apply_visual_analysis(content, raw)
    content["provenance"].append(provenance("visual-understanding", f"openai-compatible:{config.model}"))
    return content


def apply_visual_analysis(
    content: dict[str, Any], raw: dict[str, Any], location: dict[str, Any] | None = None
) -> None:
    description = _text(raw.get("description"))
    visible_text = _text(raw.get("visibleText"))
    objects = [_text(item) for item in raw.get("objects", []) if _text(item)] \
        if isinstance(raw.get("objects"), list) else []
    facts = [_text(item) for item in raw.get("notableFacts", []) if _text(item)] \
        if isinstance(raw.get("notableFacts"), list) else []
    parts = [part for part in (description, visible_text) if part]
    if objects:
        parts.append("Objects: " + ", ".join(objects))
    if facts:
        parts.append("Notable facts: " + "; ".join(facts))
    if not parts:
        return
    content["blocks"].append({
        "id": f"block-{len(content.get('blocks', [])) + 1}",
        "type": "image",
        "text": "\n".join(parts),
        "location": location or {"kind": "resource"},
        "metadata": {"derived": "visual-understanding"},
    })
    content["metadata"]["visualUnderstanding"] = {
        "description": description,
        "visibleText": visible_text,
        "objects": objects,
        "notableFacts": facts,
    }


async def enrich_video_frames(
    content: dict[str, Any], frames: list[tuple[str, int]], *, allow_cloud: bool
) -> dict[str, Any]:
    config = ModelConfig.from_environment()
    if config is None or (not config.is_local and not allow_cloud):
        content["warnings"].append({
            "code": "video_vision_unavailable",
            "message": "Audio was processed, but no permitted vision model is configured for video frames.",
        })
        return content
    for frame_path, timestamp_ms in frames:
        raw = await asyncio.to_thread(_request_image_json, config, frame_path)
        apply_visual_analysis(
            content,
            raw,
            {"kind": "time", "startMs": timestamp_ms, "endMs": timestamp_ms},
        )
    content["provenance"].append(provenance("video-frame-understanding", f"openai-compatible:{config.model}"))
    return content


def normalize_semantics(raw: dict[str, Any], content: dict[str, Any]) -> dict[str, Any]:
    blocks = {block["id"]: block for block in content.get("blocks", []) if isinstance(block, dict) and "id" in block}
    resource_id = str(content["resource"]["id"])

    def evidence(block_ids: Any) -> list[dict[str, Any]]:
        if not isinstance(block_ids, list):
            return []
        refs = []
        for block_id in block_ids:
            block = blocks.get(block_id)
            if block:
                refs.append({"resourceId": resource_id, "blockId": block_id, "location": block["location"]})
        return refs

    entities = []
    for index, item in enumerate(_objects(raw.get("entities"))):
        name = _text(item.get("name"))
        if name:
            entities.append({
                "id": f"entity-{index + 1}",
                "name": name,
                "type": _text(item.get("type")) or "unknown",
                "evidence": evidence(item.get("evidenceBlockIds")),
            })

    claims = []
    for index, item in enumerate(_objects(raw.get("claims"))):
        text = _text(item.get("text"))
        refs = evidence(item.get("evidenceBlockIds"))
        if text and refs:
            claims.append({"id": f"claim-{index + 1}", "text": text, "evidence": refs})

    actions = []
    for index, item in enumerate(_objects(raw.get("actionItems"))):
        text = _text(item.get("text"))
        refs = evidence(item.get("evidenceBlockIds"))
        if text and refs:
            action: dict[str, Any] = {"id": f"action-{index + 1}", "text": text, "evidence": refs}
            for source, target in (("assignee", "assignee"), ("dueDate", "dueDate")):
                value = _text(item.get(source))
                if value:
                    action[target] = value
            actions.append(action)

    result: dict[str, Any] = {"entities": entities, "claims": claims, "actionItems": actions}
    summary = _text(raw.get("summary"))
    if summary:
        result["summary"] = summary
    return result


def _request_semantics(config: ModelConfig, content: dict[str, Any]) -> dict[str, Any]:
    compact_blocks = []
    used = 0
    for block in content.get("blocks", []):
        compact = {"id": block["id"], "text": block["text"]}
        size = len(compact["text"]) + len(compact["id"]) + 32
        if compact_blocks and used + size > 120_000:
            break
        compact_blocks.append(compact)
        used += size
    serialized = json.dumps(compact_blocks, ensure_ascii=False)

    system = (
        "You extract work semantics. Return only JSON with summary, entities, claims, and actionItems. "
        "Every claim and action item must contain evidenceBlockIds copied from the input. Never invent block IDs."
    )
    return _request_json(config, system, serialized)


def _request_json(config: ModelConfig, system: str, user: str) -> dict[str, Any]:
    body = {
        "model": config.model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    headers = {"Content-Type": "application/json"}
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"
    request = urllib.request.Request(
        f"{config.base_url}/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=config.timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[-2000:]
        raise RuntimeError(f"Semantic model request failed ({error.code}): {detail}") from error
    message = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not isinstance(message, str):
        raise ValueError("Semantic model returned no textual JSON content")
    fenced = re.sub(r"^```(?:json)?\s*|\s*```$", "", message.strip(), flags=re.IGNORECASE)
    result = json.loads(fenced)
    if not isinstance(result, dict):
        raise ValueError("Semantic model result must be an object")
    return result


def _request_embeddings(config: ModelConfig, texts: list[str]) -> list[list[float]]:
    headers = {"Content-Type": "application/json"}
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"
    request = urllib.request.Request(
        f"{config.base_url}/v1/embeddings",
        data=json.dumps({"model": config.model, "input": texts}).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=config.timeout_seconds) as response:
        payload = json.loads(response.read().decode("utf-8"))
    ordered = sorted(payload.get("data", []), key=lambda item: item.get("index", 0))
    vectors = [item.get("embedding") for item in ordered]
    if not all(isinstance(vector, list) and all(isinstance(value, (int, float)) for value in vector) for vector in vectors):
        raise ValueError("Embedding provider returned invalid vectors")
    return [[float(value) for value in vector] for vector in vectors]


def _request_image_json(config: ModelConfig, path: str) -> dict[str, Any]:
    with open(path, "rb") as stream:
        raw = stream.read()
    if len(raw) > 25 * 1024 * 1024:
        raise ValueError("Image exceeds the 25 MB vision limit")
    mime_type = mimetypes.guess_type(path)[0] or "image/png"
    image_url = f"data:{mime_type};base64,{base64.b64encode(raw).decode('ascii')}"
    body = {
        "model": config.model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": (
                    "Analyze this work resource. Return JSON with description, visibleText, objects, and notableFacts. "
                    "Describe only what is supported by the image."
                )},
                {"type": "image_url", "image_url": {"url": image_url}},
            ],
        }],
    }
    headers = {"Content-Type": "application/json"}
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"
    request = urllib.request.Request(
        f"{config.base_url}/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=config.timeout_seconds) as response:
        payload = json.loads(response.read().decode("utf-8"))
    message = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not isinstance(message, str):
        raise ValueError("Vision model returned no textual JSON content")
    result = json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", message.strip(), flags=re.IGNORECASE))
    if not isinstance(result, dict):
        raise ValueError("Vision model result must be an object")
    return result


def _request_transcription(
    config: ModelConfig, path: str, language: str | None
) -> dict[str, Any]:
    boundary = "----workmuse-form-boundary"
    with open(path, "rb") as stream:
        audio = stream.read()
    if len(audio) > 200 * 1024 * 1024:
        raise ValueError("Media file exceeds the 200 MB transcription limit")
    fields = {"model": config.model, "response_format": "verbose_json"}
    if language:
        fields["language"] = language
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    mime_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
    file_name = os.path.basename(path).replace('"', "")
    body.extend(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{file_name}\"\r\n"
        f"Content-Type: {mime_type}\r\n\r\n".encode()
    )
    body.extend(audio)
    body.extend(f"\r\n--{boundary}--\r\n".encode())
    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"
    request = urllib.request.Request(
        f"{config.base_url}/v1/audio/transcriptions",
        data=bytes(body),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=config.timeout_seconds) as response:
        result = json.loads(response.read().decode("utf-8"))
    if not isinstance(result, dict):
        raise ValueError("Transcription provider returned an invalid response")
    return result


def _objects(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""
