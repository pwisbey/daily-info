import http.server
import json
import os
import socketserver
import urllib.parse
import urllib.request

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
REMOTE_API_BASE = "https://btresult.smartdailyinfo.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}

class InfiniteLocalHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parts = urllib.parse.urlparse(self.path)
        path = parts.path
        query = urllib.parse.parse_qs(parts.query)

        if path == "/api/tickers":
            self.serve_tickers()
            return
        if path == "/api/range":
            self.serve_range(query.get("ticker", ["SOXL"])[0].upper())
            return
        if path == "/api/dates":
            self.serve_dates(query.get("ticker", ["SOXL"])[0].upper())
            return
        if path == "/api/me":
            self.send_json({"login": False})
            return
        if path == "/api/presets":
            self.send_json({"presets": []})
            return
        if path == "/api/health":
            self.send_json({"status": "ok"})
            return

        super().do_GET()

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        ln = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(ln) if ln > 0 else b""

        if path == "/api/backtest":
            self.serve_backtest(body)
            return
        if path == "/api/compare":
            self.serve_compare(body)
            return
        if path == "/api/optimize":
            self.serve_optimize(body)
            return
        if path.startswith("/api/auth/"):
            self.send_json({"ok": True})
            return

        self.send_error(404, "Not Found")

    def do_PUT(self):
        if urllib.parse.urlparse(self.path).path == "/api/presets":
            self.send_json({"ok": True})
            return
        self.send_error(404, "Not Found")

    def send_json(self, data, status=200):
        b = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(b)

    def serve_tickers(self):
        fp = os.path.join(DIRECTORY, "tickers.json")
        if os.path.exists(fp):
            with open(fp, "r", encoding="utf-8") as f:
                self.send_json(json.load(f))
        else:
            self.send_json({"tickers": ["SOXL", "TQQQ", "488080"]})

    def serve_range(self, ticker):
        fp = os.path.join(DIRECTORY, f"range_{ticker.lower()}.json")
        if not os.path.exists(fp):
            fp = os.path.join(DIRECTORY, "range_soxl.json")
        if os.path.exists(fp):
            with open(fp, "r", encoding="utf-8") as f:
                d = json.load(f)
                d["ticker"] = ticker
                self.send_json(d)
        else:
            self.send_json({"ticker": ticker, "start": "2010-03-11", "end": "2026-09-25"})

    def serve_dates(self, ticker):
        fp = os.path.join(DIRECTORY, f"dates_{ticker.lower()}.json")
        if not os.path.exists(fp):
            fp = os.path.join(DIRECTORY, "dates_soxl.json")
        if os.path.exists(fp):
            with open(fp, "r", encoding="utf-8") as f:
                self.send_json(json.load(f))
        else:
            self.send_json({"ticker": ticker, "dates": []})

    def serve_backtest(self, body_bytes):
        try:
            req = urllib.request.Request(
                f"{REMOTE_API_BASE}/api/backtest",
                data=body_bytes,
                headers={"Content-Type": "application/json", **HEADERS},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
        except Exception:
            pass

        # Offline fallback
        try:
            tk = json.loads(body_bytes.decode("utf-8")).get("ticker", "SOXL").lower()
        except Exception:
            tk = "soxl"
        fp = os.path.join(DIRECTORY, f"sample_backtest_{tk}.json")
        if not os.path.exists(fp):
            fp = os.path.join(DIRECTORY, "sample_backtest.json")
        with open(fp, "r", encoding="utf-8") as f:
            d = json.load(f)
            self.send_json(d)

    def serve_compare(self, body_bytes):
        try:
            req = urllib.request.Request(
                f"{REMOTE_API_BASE}/api/compare",
                data=body_bytes,
                headers={"Content-Type": "application/json", **HEADERS},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
        except Exception:
            pass
        with open(os.path.join(DIRECTORY, "sample_compare.json"), "r", encoding="utf-8") as f:
            self.send_json(json.load(f))

    def serve_optimize(self, body_bytes):
        try:
            req = urllib.request.Request(
                f"{REMOTE_API_BASE}/api/optimize",
                data=body_bytes,
                headers={"Content-Type": "application/json", **HEADERS},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
        except Exception:
            pass
        with open(os.path.join(DIRECTORY, "sample_optimize.json"), "r", encoding="utf-8") as f:
            self.send_json(json.load(f))


def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), InfiniteLocalHandler) as httpd:
        print(f"Server running at http://localhost:{PORT}")
        httpd.serve_forever()


if __name__ == "__main__":
    run_server()
