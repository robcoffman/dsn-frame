#!/usr/bin/env python3
"""
DSN Frame - tiny local server for the Deep Space Network display.

Serves index.html and proxies/caches the outside data the page needs, so the
browser never has to deal with CORS and a Pi Zero isn't re-downloading images:

  /api/dsn            -> https://eyes.nasa.gov/dsn/data/dsn.xml   (cached ~5 s)
  /api/config         -> https://eyes.nasa.gov/apps/dsn-now/config.xml (cached 1 day)
  /api/wiki?title=X   -> Wikipedia page summary JSON (cached 7 days)
  /api/img?u=URL      -> Wikimedia image bytes (cached on disk forever)

Standard library only. Run:  python3 server.py [--port 8080]
"""
import argparse
import hashlib
import json
import os
import threading
import time
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ROOT, "cache")
os.makedirs(CACHE, exist_ok=True)

UA = "dsn-frame/1.0 (home wall display; python-urllib)"
DSN_URL = "https://eyes.nasa.gov/dsn/data/dsn.xml?r={}"
CONFIG_URL = "https://eyes.nasa.gov/apps/dsn-now/config.xml"
WIKI_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/{}"
IMG_HOSTS = {"upload.wikimedia.org", "thumb.wikimedia.org"}

_lock = threading.Lock()
_mem = {}  # key -> (fetched_at, bytes)


def fetch(url, timeout=10):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def cached(key, max_age, url_fn, disk=False):
    """Return (bytes, stale). Falls back to the last good copy if the fetch fails."""
    path = os.path.join(CACHE, hashlib.sha1(key.encode()).hexdigest()) if disk else None
    now = time.time()
    with _lock:
        hit = _mem.get(key)
    if hit is None and disk and os.path.exists(path):
        hit = (os.path.getmtime(path), open(path, "rb").read())
        with _lock:
            _mem[key] = hit
    if hit and now - hit[0] < max_age:
        return hit[1], False
    try:
        data = fetch(url_fn())
        with _lock:
            _mem[key] = (now, data)
        if disk:
            tmp = path + ".tmp"
            with open(tmp, "wb") as f:
                f.write(data)
            os.replace(tmp, path)
        return data, False
    except Exception as e:  # network down, NASA page offline, etc.
        print(f"[warn] fetch failed for {key}: {e}")
        if hit:
            return hit[1], True
        raise


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):  # keep the journal quiet
        if not self.path.startswith("/api/"):
            return
        super().log_message(fmt, *args)

    def send_bytes(self, data, ctype, stale=False, max_age=0):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", f"max-age={max_age}")
        if stale:
            self.send_header("X-Stale", "1")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        try:
            if u.path == "/api/dsn":
                data, stale = cached("dsn", 5, lambda: DSN_URL.format(int(time.time() // 5)), disk=True)
                return self.send_bytes(data, "application/xml", stale)
            if u.path == "/api/config":
                data, stale = cached("config", 86400, lambda: CONFIG_URL, disk=True)
                return self.send_bytes(data, "application/xml", stale, 3600)
            if u.path == "/api/wiki":
                title = (q.get("title") or [""])[0].strip()
                if not title:
                    return self.send_error(400, "title required")
                t = urllib.parse.quote(title.replace(" ", "_"), safe="")
                data, stale = cached("wiki:" + title, 7 * 86400, lambda: WIKI_URL.format(t), disk=True)
                return self.send_bytes(data, "application/json", stale, 86400)
            if u.path == "/api/img":
                src = (q.get("u") or [""])[0]
                if urllib.parse.urlparse(src).hostname not in IMG_HOSTS:
                    return self.send_error(403, "host not allowed")
                data, _ = cached("img:" + src, 10 ** 9, lambda: src, disk=True)
                ext = urllib.parse.urlparse(src).path.lower().rsplit(".", 1)[-1]
                ctype = {"png": "image/png", "svg": "image/svg+xml", "gif": "image/gif",
                         "webp": "image/webp"}.get(ext, "image/jpeg")
                return self.send_bytes(data, ctype, max_age=86400 * 30)
        except Exception as e:
            return self.send_error(502, f"upstream unavailable: {e}")
        return super().do_GET()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--bind", default="127.0.0.1")
    args = ap.parse_args()
    srv = ThreadingHTTPServer((args.bind, args.port), Handler)
    print(f"DSN Frame on http://{args.bind}:{args.port}/  (demo: /?demo)")
    srv.serve_forever()


if __name__ == "__main__":
    main()
