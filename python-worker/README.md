# WorkMuse Python Worker

The worker is a managed execution boundary for document, media, OCR and AI tools. It communicates over versioned JSON Lines on standard input/output. Diagnostic output is written to standard error.

The worker deliberately exposes registered tool IDs instead of accepting arbitrary executable paths. The initial registry probes FFmpeg, ffprobe, Docling, MinerU, Whisper, Tesseract and Pandoc. Missing tools are reported as unavailable capabilities and do not prevent the worker from starting.

Tool capabilities are declared in `tools.d/*.json`. `requirements-core.txt`
pins the lightweight library fallback used for PDF, DOCX, PPTX, XLSX and image
metadata. Rich layout, OCR and local transcription remain optional tool bundles.

## Development

Run from the repository root with a Python 3.11+ runtime. Set `PYTHONPATH` to
the worker source directory, then start the module:

```text
PYTHONPATH=python-worker python -m workmuse_worker
```

Production builds should provide a managed Python runtime and set
`WORKMUSE_PYTHON` or place it under `resources/runtime/python`.

## Protocol example

Request:

```json
{"version":1,"id":"health-1","method":"system.health","params":{}}
```

Response:

```json
{"version":1,"id":"health-1","type":"result","result":{"status":"ok"}}
```
