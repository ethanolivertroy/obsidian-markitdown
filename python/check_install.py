#!/usr/bin/env python3
"""Check Python environment and installed packages.

Usage:
    python check_install.py --check markitdown
    python check_install.py --check all

Output (JSON to stdout):
    {"python_version": "3.11.5", "packages": {"markitdown": {"installed": true, "version": "0.1.3"}}}
"""

import argparse
import json
import sys


ALLOWED_PACKAGES = {"markitdown"}


def check_package(name: str) -> dict:
    """Check if a Python package is installed, importable, and return its version."""
    if name not in ALLOWED_PACKAGES:
        return {"installed": False, "version": None}

    # Verify the package can actually be imported (not just metadata)
    if name == "markitdown":
        try:
            from markitdown import MarkItDown  # noqa: F401
        except (ImportError, AttributeError, TypeError):
            return {"installed": False, "version": None}

    try:
        from importlib.metadata import version, PackageNotFoundError
        try:
            ver = version(name)
            return {"installed": True, "version": ver}
        except PackageNotFoundError:
            return {"installed": False, "version": None}
    except ImportError:
        # Python < 3.8 fallback
        try:
            import pkg_resources
            ver = pkg_resources.get_distribution(name).version
            return {"installed": True, "version": ver}
        except Exception:
            return {"installed": False, "version": None}


def main():
    parser = argparse.ArgumentParser(description="Check Python package installations")
    parser.add_argument(
        "--check",
        required=True,
        help="Package to check: 'markitdown' or 'all'",
    )
    args = parser.parse_args()

    packages_to_check = []
    if args.check == "all":
        packages_to_check = ["markitdown"]
    else:
        packages_to_check = [args.check]

    result = {
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "packages": {},
    }

    for pkg in packages_to_check:
        result["packages"][pkg] = check_package(pkg)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
