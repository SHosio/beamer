#!/usr/bin/env python3
"""Beamer: broadcast Markdown text from Claude Code to a browser via SSE."""
import json
import os
import queue
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
PORT = int(os.environ.get("BEAMER_PORT", "4040"))

CTYPES = {".html": "text/html", ".js": "text/javascript", ".css": "text/css"}


class Hub:
    """In-memory message history plus the set of connected SSE clients."""

    def __init__(self):
        self.lock = threading.Lock()
        self.history = []
        self.clients = set()
        self.next_id = 1

    def add(self, title, text):
        with self.lock:
            msg = {"id": self.next_id, "ts": time.time(),
                   "title": title, "text": text}
            self.next_id += 1
            self.history.append(msg)
            self._broadcast(("message", msg))
            return msg

    def delete(self, mid):
        with self.lock:
            self.history = [m for m in self.history if m["id"] != mid]
            self._broadcast(("delete", {"id": mid}))

    def clear(self):
        with self.lock:
            self.history.clear()
            self._broadcast(("clear", {}))

    def _broadcast(self, item):
        dead = []
        for q in self.clients:
            try:
                q.put_nowait(item)
            except Exception:
                dead.append(q)
        for q in dead:
            self.clients.discard(q)

    def subscribe(self):
        q = queue.Queue()
        with self.lock:
            snapshot = list(self.history)
            self.clients.add(q)
        return q, snapshot

    def unsubscribe(self, q):
        with self.lock:
            self.clients.discard(q)


class Handler(BaseHTTPRequestHandler):
    hub = None  # set in main()

    def log_message(self, *args):
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path == "/send":
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            try:
                data = json.loads(raw)
            except Exception:
                return self._json(400, {"ok": False, "error": "invalid json"})
            text = data.get("text")
            if not isinstance(text, str) or text == "":
                return self._json(400, {"ok": False, "error": "text required"})
            msg = self.hub.add(data.get("title"), text)
            return self._json(200, {"ok": True, "id": msg["id"]})
        if self.path == "/delete":
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            try:
                mid = json.loads(raw).get("id")
            except Exception:
                return self._json(400, {"ok": False, "error": "invalid json"})
            if not isinstance(mid, int):
                return self._json(400, {"ok": False, "error": "id required"})
            self.hub.delete(mid)
            return self._json(200, {"ok": True})
        if self.path == "/clear":
            self.hub.clear()
            return self._json(200, {"ok": True})
        self._json(404, {"ok": False, "error": "not found"})

    def do_GET(self):
        if self.path == "/events":
            return self._sse()
        path = self.path.split("?", 1)[0]
        if path == "/":
            return self._file(WEB / "index.html")
        target = (WEB / path.lstrip("/")).resolve()
        if WEB in target.parents and target.is_file():
            return self._file(target)
        self._json(404, {"ok": False, "error": "not found"})

    def _file(self, path):
        try:
            body = path.read_bytes()
        except OSError:
            return self._json(404, {"ok": False, "error": "not found"})
        self.send_response(200)
        self.send_header("Content-Type",
                         CTYPES.get(path.suffix.lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _sse(self):
        q, snapshot = self.hub.subscribe()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        try:
            for msg in snapshot:
                self._emit("message", msg)
            while True:
                try:
                    event, payload = q.get(timeout=15)
                    self._emit(event, payload)
                except queue.Empty:
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
        except Exception:
            # Client disconnected (broken pipe, reset, closed stream). Drop quietly.
            pass
        finally:
            self.hub.unsubscribe(q)

    def _emit(self, event, payload):
        self.wfile.write(
            f"event: {event}\ndata: {json.dumps(payload)}\n\n".encode())
        self.wfile.flush()


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        # SSE clients disconnect mid-stream constantly; that is normal, not an error.
        pass


def main():
    Handler.hub = Hub()
    try:
        server = Server(("127.0.0.1", PORT), Handler)
    except OSError as e:
        raise SystemExit(
            f"beamer: cannot bind port {PORT} ({e}). "
            f"Set BEAMER_PORT to use a different port.")
    print(f"beamer listening on http://127.0.0.1:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
