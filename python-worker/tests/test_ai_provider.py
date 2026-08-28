from __future__ import annotations

import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from workmuse_worker.ai import answer_question, embed_texts, enrich_content, enrich_image_content, transcribe_file


class ProviderHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        if self.path == "/v1/embeddings":
            request = json.loads(body)
            data = [
                {"index": index, "embedding": [1.0, float(index)]}
                for index, _value in enumerate(request["input"])
            ]
            self._json({"data": data})
            return
        if self.path == "/v1/audio/transcriptions":
            self._json({"text": "确认路线图", "segments": [{"start": 1.0, "end": 2.5, "text": "确认路线图"}]})
            return
        request = json.loads(body)
        content = request["messages"][-1]["content"]
        if isinstance(content, list):
            result = {
                "description": "一张路线图",
                "visibleText": "MVP 九月完成",
                "objects": ["时间轴"],
                "notableFacts": ["有延期标记"],
            }
        elif "evidenceBlocks" in content:
            result = {"answer": "周五完成", "citationBlockIds": ["b1", "fake"], "followUps": ["谁负责？"]}
        else:
            result = {
                "summary": "需要完成评审",
                "entities": [{"name": "路线图", "type": "document", "evidenceBlockIds": ["b1"]}],
                "claims": [{"text": "周五完成", "evidenceBlockIds": ["b1"]}],
                "actionItems": [{"text": "完成评审", "evidenceBlockIds": ["b1"]}],
            }
        self._json({"choices": [{"message": {"content": json.dumps(result, ensure_ascii=False)}}]})

    def _json(self, value: dict) -> None:
        payload = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, _format: str, *_args: object) -> None:
        pass


class AiProviderTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), ProviderHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.environment = {
            "WORKMUSE_AI_BASE_URL": f"http://127.0.0.1:{cls.server.server_port}",
            "WORKMUSE_AI_MODEL": "mock-vision",
            "WORKMUSE_EMBEDDING_MODEL": "mock-embedding",
            "WORKMUSE_TRANSCRIPTION_MODEL": "mock-transcription",
        }

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    async def test_semantic_embedding_and_grounded_answer(self) -> None:
        content = {
            "resource": {"id": "r1"},
            "blocks": [{"id": "b1", "text": "周五完成评审", "location": {"kind": "resource"}}],
            "semantics": {},
            "provenance": [],
            "warnings": [],
        }
        context = {
            "query": "什么时候完成？",
            "blocks": [{
                "blockId": "b1",
                "title": "路线图",
                "text": "周五完成评审",
                "evidence": {"resourceId": "r1", "blockId": "b1", "location": {"kind": "resource"}},
            }],
            "citations": [],
        }
        with patch.dict("os.environ", self.environment, clear=False):
            enriched = await enrich_content(content, allow_cloud=False)
            embeddings = await embed_texts(["一", "二"], allow_cloud=False)
            answer = await answer_question(context, allow_cloud=False)
        self.assertEqual(enriched["semantics"]["claims"][0]["evidence"][0]["blockId"], "b1")
        self.assertEqual(len(embeddings[1]), 2)
        self.assertEqual(answer["answer"], "周五完成")
        self.assertEqual([item["blockId"] for item in answer["citations"]], ["b1"])

    async def test_image_and_transcription_requests(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            image = root / "image.png"
            image.write_bytes(b"mock-image")
            audio = root / "meeting.wav"
            audio.write_bytes(b"mock-audio")
            content = {
                "resource": {"path": str(image)},
                "blocks": [],
                "metadata": {},
                "provenance": [],
                "warnings": [],
            }
            with patch.dict("os.environ", self.environment, clear=False):
                enriched = await enrich_image_content(content, allow_cloud=False)
                transcript = await transcribe_file(str(audio), allow_cloud=False, language="zh")
        self.assertIn("MVP 九月完成", enriched["blocks"][0]["text"])
        self.assertEqual(transcript["segments"][0]["start"], 1.0)
