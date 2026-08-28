from __future__ import annotations

import asyncio
import json
import os
import shutil
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ToolDefinition:
    id: str
    executables: tuple[str, ...]
    version_args: tuple[str, ...] = ("--version",)
    capabilities: tuple[str, ...] = ()
    managed: bool = False


def load_tools() -> dict[str, ToolDefinition]:
    directory = Path(__file__).parents[1] / "tools.d"
    tools: dict[str, ToolDefinition] = {}
    for manifest_path in sorted(directory.glob("*.json")):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        definition = ToolDefinition(
            id=str(manifest["id"]),
            executables=tuple(str(value) for value in manifest["executables"]),
            version_args=tuple(str(value) for value in manifest.get("versionArgs", ["--version"])),
            capabilities=tuple(str(value) for value in manifest.get("capabilities", [])),
            managed=bool(manifest.get("managed", False)),
        )
        if not definition.executables:
            raise ValueError(f"Tool manifest has no executables: {manifest_path}")
        tools[definition.id] = definition
    return tools


TOOLS = load_tools()


def resolve_tool(tool_id: str) -> tuple[ToolDefinition, str]:
    definition = TOOLS.get(tool_id)
    if definition is None:
        raise ValueError(f"Tool is not registered: {tool_id}")

    for executable in definition.executables:
        resolved = shutil.which(executable)
        if resolved:
            return definition, resolved
    raise FileNotFoundError(f"Tool is unavailable: {tool_id}")


async def probe_tool(tool_id: str) -> dict[str, object]:
    try:
        definition, executable = resolve_tool(tool_id)
        process = await asyncio.create_subprocess_exec(
            executable,
            *definition.version_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=sanitized_environment(),
        )
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=10)
        version = (stdout or stderr).decode("utf-8", errors="replace").splitlines()
        return {
            "id": tool_id,
            "available": process.returncode == 0,
            "executable": str(Path(executable)),
            "version": version[0] if version else "unknown",
            "capabilities": list(definition.capabilities),
            "managed": definition.managed,
        }
    except Exception as error:  # A probe must report rather than crash the worker.
        definition = TOOLS.get(tool_id)
        return {
            "id": tool_id,
            "available": False,
            "error": str(error),
            "capabilities": list(definition.capabilities) if definition else [],
            "managed": definition.managed if definition else False,
        }


def sanitized_environment() -> dict[str, str]:
    blocked = {
        "WORKMUSE_AI_API_KEY",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GOOGLE_API_KEY",
        "AZURE_OPENAI_API_KEY",
    }
    return {key: value for key, value in os.environ.items() if key not in blocked}
