from __future__ import annotations

from typing import Any


def assess_content(content: dict[str, Any]) -> dict[str, Any]:
    blocks = [block for block in content.get("blocks", []) if isinstance(block, dict)]
    texts = [str(block.get("text", "")).strip() for block in blocks]
    character_count = sum(len(text) for text in texts)
    located = sum(1 for block in blocks if block.get("location", {}).get("kind") != "resource")
    duplicate_count = len(texts) - len(set(texts))
    issues: list[str] = []

    if not blocks:
        issues.append("no-content-blocks")
    if character_count < 20:
        issues.append("very-low-text-volume")
    if blocks and located / len(blocks) < 0.5:
        issues.append("weak-source-location")
    if blocks and duplicate_count / len(blocks) > 0.2:
        issues.append("high-duplication")

    volume_score = min(1.0, character_count / 500)
    location_score = located / len(blocks) if blocks else 0.0
    duplication_score = 1 - duplicate_count / len(blocks) if blocks else 0.0
    score = round(0.5 * volume_score + 0.3 * location_score + 0.2 * duplication_score, 3)
    return {
        "score": score,
        "status": "good" if score >= 0.7 else "usable" if score >= 0.35 else "low",
        "characterCount": character_count,
        "blockCount": len(blocks),
        "locatedBlockRatio": round(location_score, 3),
        "issues": issues,
    }
