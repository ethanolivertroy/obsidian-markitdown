#!/usr/bin/env python3
"""Install a Python package into a plugin-managed virtual environment.

Usage:
    python install_package.py --package "markitdown[all]" --venv-dir /path/to/.venv

Installing into a dedicated venv avoids PEP 668 externally-managed-environment
errors from Homebrew / system Python, and keeps the plugin's dependency isolated.

Output:
    Streams pip output line by line to stdout.
    Final line is JSON: {"success": true, "python_path": "..."} or
    {"success": false, "error": "message"}
"""

import argparse
import json
import os
import subprocess
import sys


def venv_python(venv_dir: str) -> str:
    if sys.platform == "win32":
        return os.path.join(venv_dir, "Scripts", "python.exe")
    return os.path.join(venv_dir, "bin", "python")


def run_pip(python: str, package: str) -> int:
    process = subprocess.Popen(
        [python, "-m", "pip", "install", package],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    assert process.stdout is not None
    for line in process.stdout:
        print(line, end="", flush=True)

    process.wait()
    return process.returncode or 0


def ensure_venv(venv_dir: str, bootstrap_python: str) -> str:
    py = venv_python(venv_dir)
    if os.path.isfile(py):
        return py

    print(f"Creating virtual environment at {venv_dir}...", flush=True)
    result = subprocess.run(
        [bootstrap_python, "-m", "venv", venv_dir],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 or not os.path.isfile(py):
        detail = (result.stderr or result.stdout or "").strip()
        raise RuntimeError(
            f"Failed to create virtual environment at {venv_dir}: {detail or f'exit {result.returncode}'}"
        )
    return py


def main():
    parser = argparse.ArgumentParser(
        description="Install a Python package into a plugin-managed venv"
    )
    parser.add_argument(
        "--package",
        required=True,
        help="Package specification (e.g., 'markitdown[all]')",
    )
    parser.add_argument(
        "--venv-dir",
        required=True,
        help="Directory for the plugin-managed virtual environment",
    )
    args = parser.parse_args()

    try:
        py = ensure_venv(args.venv_dir, sys.executable)
        print(f"Installing {args.package} into {py}...", flush=True)
        code = run_pip(py, args.package)

        if code == 0:
            print(json.dumps({"success": True, "python_path": py}))
        else:
            print(
                json.dumps(
                    {
                        "success": False,
                        "error": f"pip exited with code {code}",
                    }
                )
            )
            sys.exit(1)

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
