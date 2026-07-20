#!/usr/bin/env python3
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 - stdlib callback name
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length))
        statuses = sorted({alert.get("status", "unknown") for alert in payload.get("alerts", [])})
        print(f"DELIVERY status={','.join(statuses)}", flush=True)
        self.send_response(200)
        self.end_headers()

    def log_message(self, _format, *_args):
        return


ThreadingHTTPServer((os.environ.get("WEBHOOK_SINK_HOST", "127.0.0.1"), 19094), Handler).serve_forever()
