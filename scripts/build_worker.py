from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    output = root / "build" / "runtime"
    work = root / "build" / "pyinstaller-work"
    spec = root / "build" / "pyinstaller-spec"
    output.mkdir(parents=True, exist_ok=True)
    work.mkdir(parents=True, exist_ok=True)
    spec.mkdir(parents=True, exist_ok=True)
    executable = output / ("workmuse-worker.exe" if sys.platform == "win32" else "workmuse-worker")
    executable.unlink(missing_ok=True)

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name",
        "workmuse-worker",
        "--paths",
        str(root / "python-worker"),
        "--collect-all",
        "pypdf",
        "--collect-all",
        "PIL",
        "--collect-all",
        "docx",
        "--collect-all",
        "pptx",
        "--collect-all",
        "openpyxl",
        "--add-data",
        f"{root / 'python-worker' / 'tools.d'}{';' if sys.platform == 'win32' else ':'}tools.d",
        "--distpath",
        str(output),
        "--workpath",
        str(work),
        "--specpath",
        str(spec),
        str(root / "python-worker" / "worker.py"),
    ]
    subprocess.run(command, cwd=root, check=True)
    if not executable.is_file():
        raise RuntimeError(f"Worker build did not produce {executable}")
    print(executable)


if __name__ == "__main__":
    main()
