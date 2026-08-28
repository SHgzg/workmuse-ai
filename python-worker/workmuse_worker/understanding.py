from __future__ import annotations

from pathlib import Path
from typing import Any, Awaitable, Callable

from .adapters import understand_document, understand_media
from .ai import enrich_content, enrich_image_content
from .content import chunk_content, inspect_resource, persist_content, understand_text
from .quality import assess_content

Progress = Callable[[str, dict[str, Any]], Awaitable[None]]


async def understand_resource(
    input_path: Path,
    output_directory: Path,
    allowed_roots: tuple[Path, ...],
    progress: Progress,
    *,
    language: str | None = None,
    allow_cloud: bool = False,
) -> dict[str, Any]:
    await progress("stage", {"name": "resource.inspect", "adapter": "workmuse"})
    resource = inspect_resource(input_path, allowed_roots)
    _validate_output_directory(output_directory, allowed_roots)

    if resource.kind == "text":
        content = understand_text(resource)
    elif resource.kind in {"document", "image"}:
        content = await understand_document(resource, progress, language)
    elif resource.kind in {"audio", "video"}:
        content = await understand_media(resource, progress, language, allow_cloud=allow_cloud)
    else:
        raise ValueError(f"Unsupported resource type: {resource.mime_type}")

    content = chunk_content(content)
    if resource.kind == "image":
        await progress("stage", {"name": "image.understand", "adapter": "configured-model"})
        content = await enrich_image_content(content, allow_cloud=allow_cloud)
    await progress("stage", {"name": "semantic.enrich", "adapter": "configured-model"})
    content = await enrich_content(content, allow_cloud=allow_cloud)
    quality = assess_content(content)
    content["metadata"]["quality"] = quality
    if quality["status"] == "low":
        content["warnings"].append({
            "code": "low_extraction_quality",
            "message": "The extracted content may be incomplete and should be reviewed.",
        })
    await progress("stage", {"name": "content.persist", "adapter": "workmuse"})
    artifact = persist_content(content, output_directory.resolve())
    return {"content": content, "artifactPath": str(artifact)}


def _validate_output_directory(path: Path, allowed_roots: tuple[Path, ...]) -> None:
    resolved = path.resolve()
    if allowed_roots and not any(_is_relative_to(resolved, root) for root in allowed_roots):
        raise PermissionError("Output directory is outside the configured roots")


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False
