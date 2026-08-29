# WorkMuse Core Runtime

WorkMuse uses TypeScript for its domain core and Electron integration, while a
managed Python worker runs document, media, OCR and model tooling. Python is an
implementation detail behind a versioned JSONL protocol; renderer code never
starts commands directly.

## Responsibilities

The TypeScript side owns job intent, domain authorization, lifecycle, UI events
and normalized WorkMuse schemas. The Python side owns bounded concurrency,
external process execution, tool discovery, cancellation and conversion of raw
tool output through adapters.

The worker currently registers capability probes for FFmpeg, ffprobe, Docling,
MinerU, Whisper, Tesseract and Pandoc. A missing executable is an unavailable
capability rather than a worker startup failure.

## Resource understanding pipeline

`resources.understand` inspects and hashes an imported asset, routes text to the
built-in decoder, routes documents and images to Docling, and routes audio or
video to ffprobe and Whisper. Every route produces `workmuse.content.v1` with
stable blocks and source locations. Results are committed atomically beneath
the Core artifact directory.

If external tools are absent, the managed Python runtime can still extract
text and structure from PDF, DOCX, PPTX and XLSX through pinned lightweight
libraries. Docling remains the preferred rich-layout parser; MinerU and
Tesseract are fallbacks. Audio can use a local Whisper CLI or an explicitly
configured compatible transcription endpoint.

Optional semantic enrichment uses an OpenAI-compatible model endpoint configured
through the main-process Core settings store (environment variables remain
available for development):

- `WORKMUSE_AI_BASE_URL`
- `WORKMUSE_AI_MODEL`
- `WORKMUSE_AI_API_KEY` (optional for local endpoints)

Remote endpoints are skipped unless a job explicitly allows cloud processing.
Model-produced claims and action items are retained only when their evidence IDs
refer to blocks that actually exist in the normalized document.

The API key is encrypted with Electron `safeStorage`; preload exposes only
`hasApiKey`. Saving settings restarts the Worker so secrets are injected only
into its environment. Tool subprocesses receive a sanitized environment with
model-provider secrets removed.

Processed blocks are indexed automatically in SQLite FTS5. When
`WORKMUSE_EMBEDDING_MODEL` is configured, embeddings are stored locally and
combined with lexical results through reciprocal-rank fusion. Search context has
a bounded character budget and always returns source references. The index can
be rebuilt from immutable `content.v1.json` artifacts.

## Runtime resolution

Production must ship or download a pinned Python runtime. Resolution order is:

1. Explicit application override.
2. `WORKMUSE_PYTHON`.
3. `resources/runtime/python` in a packaged application.
4. `.runtime/python` in a development checkout.

WorkMuse must not depend on a globally installed Python. Tool and model bundles
should be version-pinned, checksum-verified and stored outside the application
ASAR archive.

## Security boundary

Only registered tool IDs can be executed. Executable paths are resolved inside
the worker and are never supplied by the renderer. Arguments are passed as an
array without a command shell. Each production pipeline should additionally
restrict allowed arguments and working directories in its adapter.

## Renderer integration

The Electron main process creates one `PythonWorkerClient` and exposes a narrow,
typed preload API for Core status, user-initiated resource import, persistent job
status, local search, bounded search context, grounded answers and Core settings.
The file cabinet uses these APIs to show loading, empty, failure and offline
states. Global search returns normalized source locations and evidence IDs.

Opening a search source never accepts a renderer-supplied path. The renderer
passes a `sha256:` resource ID, and the main process resolves it inside the
checksum-addressed asset store before asking the operating system to open it.
Malformed IDs and missing originals fail without opening a path.

When a grounded AI answer is converted into a task, the business store keeps
the AI suggestion and its source resource/block references as separate source
records. The suggestion must not be presented as an original fact.

The worker is stopped during `before-quit`. Arbitrary `tools.run` access remains
an internal Core API and is not exposed through IPC. Permission filtering is a
required gate before team or shared resources are added to renderer search.

Desktop startup uses software rendering for compatibility with remote desktops
and Windows images without a working Chromium GPU runtime. Top-level startup
failures are surfaced to the user and terminate cleanly instead of leaving an
uninitialized window running.
