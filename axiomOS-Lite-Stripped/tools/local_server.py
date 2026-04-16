from __future__ import annotations

import argparse
import json
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def build_handler(root: Path):
    class AxiomLocalHandler(SimpleHTTPRequestHandler):
        server_version = "AxiomLocalServer/1.1"

        def __init__(self, *args, directory=None, **kwargs):
            super().__init__(*args, directory=str(root), **kwargs)

        def do_GET(self):
            if self.path == "/__axiom_ping":
                payload = {
                    "ok": True,
                    "app": "axiomOS",
                    "root": str(root),
                }
                body = json.dumps(payload).encode("utf-8")
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
                return
            super().do_GET()

        def end_headers(self):
            path = self.path.split("?", 1)[0]
            if (
                path.endswith(".html")
                or path.endswith(".js")
                or path.endswith(".css")
                or path.endswith("manifest.json")
                or path.endswith("manifest-demo.json")
            ):
                self.send_header("Cache-Control", "no-store, max-age=0")
            elif path.endswith("sw.js"):
                self.send_header("Cache-Control", "no-store, max-age=0")
                self.send_header("Service-Worker-Allowed", "/")
            super().end_headers()

        def log_message(self, format, *args):
            return

    return AxiomLocalHandler


def main():
    parser = argparse.ArgumentParser(
        description="Serve axiomOS locally on loopback so the PWA remains usable and installable without public hosting."
    )
    parser.add_argument("--host", default="127.0.0.1", help="Loopback host to bind to. Defaults to 127.0.0.1.")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind to. Defaults to 8765.")
    parser.add_argument(
        "--root",
        default=".",
        help="Project root to serve. Defaults to the current working directory.",
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    handler = build_handler(root)
    server = ThreadingHTTPServer((args.host, args.port), partial(handler, directory=str(root)))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
