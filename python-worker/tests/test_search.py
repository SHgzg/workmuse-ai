from __future__ import annotations

import tempfile
import json
import unittest
from pathlib import Path

from workmuse_worker.search import ContentIndex


def content(resource_id: str, title: str, blocks: list[tuple[str, str]]) -> dict:
    return {
        "resource": {
            "id": resource_id,
            "path": f"/{title}.txt",
            "mimeType": "text/plain",
            "checksum": resource_id.split(":")[-1],
        },
        "title": title,
        "metadata": {},
        "blocks": [
            {
                "id": block_id,
                "type": "paragraph",
                "text": text,
                "location": {"kind": "text", "start": 0, "end": len(text)},
            }
            for block_id, text in blocks
        ],
    }


class SearchTests(unittest.TestCase):
    def test_index_search_filter_and_context(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            index = ContentIndex(Path(temporary))
            first = content("sha256:first", "周会", [("b1", "产品路线图需要在周五完成评审"), ("b2", "风险是测试时间不足")])
            second = content("sha256:second", "随笔", [("b1", "周末阅读一本产品设计书")])
            index.upsert(first)
            index.upsert(second)

            results = index.search("产品路线图")
            self.assertEqual(results[0]["resourceId"], "sha256:first")
            self.assertEqual(results[0]["evidence"]["blockId"], "b1")

            filtered = index.search("产品", resource_ids=["sha256:second"])
            self.assertEqual([item["resourceId"] for item in filtered], ["sha256:second"])

            context_result = index.context("风险", max_characters=100)
            self.assertEqual(context_result["citations"][0]["blockId"], "b2")
            self.assertLessEqual(context_result["characterCount"], 100)

    def test_reindex_replaces_stale_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            index = ContentIndex(Path(temporary))
            index.upsert(content("sha256:first", "文档", [("old", "旧内容")]))
            index.upsert(content("sha256:first", "文档", [("new", "新内容")]))
            self.assertEqual(index.search("旧内容"), [])
            self.assertEqual(index.search("新内容")[0]["blockId"], "new")

    def test_vector_search_augments_lexical_results(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            index = ContentIndex(Path(temporary))
            resource = content("sha256:vectors", "向量", [("near", "项目延期风险"), ("far", "午餐菜单")])
            index.upsert(resource)
            index.upsert_embeddings("sha256:vectors", "test-model", ["near", "far"], [[1.0, 0.0], [0.0, 1.0]])
            results = index.hybrid_search(
                "没有字面匹配的查询",
                query_vector=[0.9, 0.1],
                embedding_model="test-model",
            )
            self.assertEqual(results[0]["blockId"], "near")

    def test_index_can_be_rebuilt_from_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            state = root / "state"
            artifact = root / "artifacts" / "resource" / "content.v1.json"
            artifact.parent.mkdir(parents=True)
            payload = content("sha256:rebuilt", "重建", [("b1", "索引可以从产物恢复")])
            payload["schema"] = "workmuse.content.v1"
            artifact.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            index = ContentIndex(state)
            result = index.rebuild([root / "artifacts"])
            self.assertEqual(result["indexedResources"], 1)
            self.assertEqual(index.search("产物恢复")[0]["resourceId"], "sha256:rebuilt")
