from __future__ import annotations

import importlib.metadata
import importlib.util
import os
import platform
import sys
from typing import Any


LIBRARIES = {
    "pypdf": ("pypdf", ["document.pdf-text"]),
    "Pillow": ("PIL", ["image.metadata"]),
    "python-docx": ("docx", ["document.docx"]),
    "python-pptx": ("pptx", ["document.pptx"]),
    "openpyxl": ("openpyxl", ["document.xlsx"]),
}


def inspect_runtime() -> dict[str, Any]:
    libraries = []
    for distribution, (module, capabilities) in LIBRARIES.items():
        available = importlib.util.find_spec(module) is not None
        try:
            version = importlib.metadata.version(distribution) if available else None
        except importlib.metadata.PackageNotFoundError:
            version = None
        libraries.append({
            "id": distribution,
            "available": available,
            "version": version,
            "capabilities": capabilities,
        })
    return {
        "python": {
            "executable": sys.executable,
            "version": platform.python_version(),
            "implementation": platform.python_implementation(),
        },
        "libraries": libraries,
        "models": {
            "semantic": os.environ.get("WORKMUSE_AI_MODEL") or None,
            "embedding": os.environ.get("WORKMUSE_EMBEDDING_MODEL") or None,
            "endpointConfigured": bool(os.environ.get("WORKMUSE_AI_BASE_URL")),
        },
    }
