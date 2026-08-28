from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from workmuse_worker.server import WorkerServer
from workmuse_worker.tools import probe_tool, sanitized_environment
from workmuse_worker.understanding import understand_resource
from workmuse_worker.content import chunk_content
from workmuse_worker.ai import answer_question, apply_visual_analysis, normalize_semantics
from workmuse_worker.quality import assess_content


class WorkerTests(unittest.IsolatedAsyncioTestCase):
    async def test_registered_missing_tool_is_reported(self) -> None:
        result = await probe_tool("docling")
        self.assertEqual(result["id"], "docling")
        self.assertIn("available", result)

    async def test_unknown_tool_is_reported(self) -> None:
        result = await probe_tool("not-registered")
        self.assertFalse(result["available"])
        self.assertIn("not registered", str(result["error"]))

    async def test_tool_processes_do_not_inherit_model_secrets(self) -> None:
        with patch.dict("os.environ", {"WORKMUSE_AI_API_KEY": "secret", "SAFE_VALUE": "visible"}):
            environment = sanitized_environment()
        self.assertNotIn("WORKMUSE_AI_API_KEY", environment)
        self.assertEqual(environment["SAFE_VALUE"], "visible")

    async def test_concurrency_is_bounded(self) -> None:
        server = WorkerServer(max_concurrency=2)
        self.assertEqual(server._max_concurrency, 2)
        self.assertIsInstance(server._semaphore, asyncio.Semaphore)

    async def test_text_resource_is_normalized_and_persisted(self) -> None:
        events: list[tuple[str, dict[str, object]]] = []

        async def progress(event: str, data: dict[str, object]) -> None:
            events.append((event, data))

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "meeting.md"
            source.write_text("# 周会\n\n确认产品路线图。\n\n下周完成验收。", encoding="utf-8")
            result = await understand_resource(source, root / "artifacts", (root,), progress)

            self.assertEqual(result["content"]["schema"], "workmuse.content.v1")
            self.assertEqual(result["content"]["resource"]["kind"], "text")
            self.assertEqual(len(result["content"]["blocks"]), 3)
            artifact = Path(result["artifactPath"])
            self.assertTrue(artifact.is_file())
            persisted = json.loads(artifact.read_text(encoding="utf-8"))
            self.assertEqual(persisted["resource"]["checksum"], result["content"]["resource"]["checksum"])
            self.assertEqual([data["name"] for event, data in events if event == "stage"], [
                "resource.inspect",
                "semantic.enrich",
                "content.persist",
            ])

    async def test_semantic_evidence_is_limited_to_real_blocks(self) -> None:
        content = {
            "resource": {"id": "sha256:test"},
            "blocks": [{"id": "block-1", "text": "周五完成评审", "location": {"kind": "text", "start": 0, "end": 6}}],
        }
        raw = {
            "summary": "需要完成评审",
            "claims": [{"text": "评审在周五完成", "evidenceBlockIds": ["block-1", "invented"]}],
            "actionItems": [{"text": "完成评审", "evidenceBlockIds": ["block-1"]}],
        }
        semantics = normalize_semantics(raw, content)
        self.assertEqual(len(semantics["claims"][0]["evidence"]), 1)
        self.assertEqual(semantics["claims"][0]["evidence"][0]["blockId"], "block-1")

    async def test_quality_reports_weak_unlocated_extraction(self) -> None:
        quality = assess_content({
            "blocks": [{"id": "block-1", "text": "短文本", "location": {"kind": "resource"}}]
        })
        self.assertEqual(quality["status"], "low")
        self.assertIn("very-low-text-volume", quality["issues"])
        self.assertIn("weak-source-location", quality["issues"])

    async def test_question_returns_context_when_model_is_unavailable(self) -> None:
        context = {
            "query": "什么时候完成？",
            "blocks": [],
            "citations": [{"resourceId": "r1", "blockId": "b1", "location": {"kind": "resource"}}],
        }
        with patch.dict("os.environ", {"WORKMUSE_AI_BASE_URL": "", "WORKMUSE_AI_MODEL": ""}):
            answer = await answer_question(context, allow_cloud=False)
        self.assertEqual(answer["status"], "model-unavailable")
        self.assertEqual(answer["citations"], context["citations"])

    async def test_large_blocks_are_chunked_with_source_offsets(self) -> None:
        value = "资料理解" * 1_500
        content = {"blocks": [{
            "id": "large",
            "type": "paragraph",
            "text": value,
            "location": {"kind": "text", "start": 100, "end": 100 + len(value)},
        }]}
        chunked = chunk_content(content, max_characters=1_000, overlap=100)["blocks"]
        self.assertGreater(len(chunked), 1)
        self.assertTrue(all(len(block["text"]) <= 1_000 for block in chunked))
        self.assertEqual(chunked[0]["location"]["start"], 100)
        self.assertEqual(chunked[1]["location"]["start"], 1_000)

    async def test_visual_analysis_becomes_a_citable_block(self) -> None:
        content = {"blocks": [], "metadata": {}}
        apply_visual_analysis(content, {
            "description": "一张项目路线图",
            "visibleText": "MVP：9 月完成",
            "objects": ["时间轴"],
            "notableFacts": ["里程碑存在延期标记"],
        })
        self.assertEqual(content["blocks"][0]["type"], "image")
        self.assertIn("9 月完成", content["blocks"][0]["text"])
        self.assertEqual(content["blocks"][0]["location"], {"kind": "resource"})
        apply_visual_analysis(
            content,
            {"description": "第二个关键帧"},
            {"kind": "time", "startMs": 60_000, "endMs": 60_000},
        )
        self.assertEqual(content["blocks"][1]["location"]["startMs"], 60_000)
