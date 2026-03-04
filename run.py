#!/usr/bin/env python3
"""
r3ditor — CLI entry point.

Usage:
    python run.py [--port 5100] [--host 127.0.0.1] [--debug] [--open]
"""
from __future__ import annotations

import argparse
import sys
import webbrowser
import pathlib


def main():
    parser = argparse.ArgumentParser(
        description="r3ditor — 3D Model Editor with SolveSpace constraint solver",
    )
    parser.add_argument("--port", type=int, default=5100, help="Server port (default: 5100)")
    parser.add_argument("--host", default="127.0.0.1", help="Host address (default: 127.0.0.1)")
    parser.add_argument("--debug", action="store_true", help="Enable Flask debug mode")
    parser.add_argument("--open", action="store_true", help="Open browser on startup")
    args = parser.parse_args()

    # Ensure we're in the project directory
    project_dir = pathlib.Path(__file__).resolve().parent
    sys.path.insert(0, str(project_dir))

    version = (project_dir / "VERSION").read_text().strip()
    print(f"\n  r3ditor v{version} — 3D Model Editor")
    print(f"  http://{args.host}:{args.port}\n")

    if args.open:
        webbrowser.open(f"http://{args.host}:{args.port}")

    from server import app
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
