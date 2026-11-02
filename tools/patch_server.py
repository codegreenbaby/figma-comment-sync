"""Local bridge between the agent and the Comment Sync Patch plugin.

GET  /patch.json  serves state/patch.json, with file references expanded:
                  "file": "pages/.../x.png"  -> "base64"
                  "svgFile": "pages/.../x.svg" -> "svg"
POST /result      writes the plugin's report to state/patch-result.json; screenshots in the
                  report are saved to state/shots/<node>.png and replaced by their path.

Binds to 127.0.0.1 only.

Usage:
  python tools/patch_server.py          # serves on http://localhost:8787 until stopped
"""
import base64
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PATCH = ROOT / "state" / "patch.json"
RESULT = ROOT / "state" / "patch-result.json"
SHOTS = ROOT / "state" / "shots"


def inside_root(rel):
    p = (ROOT / rel).resolve()
    if ROOT not in p.parents:
        raise ValueError(f"{rel} is outside the project")
    return p


def expand(patch):
    for op in patch.get("ops", []):
        if "file" in op:
            op["base64"] = base64.b64encode(inside_root(op.pop("file")).read_bytes()).decode()
        if "svgFile" in op:
            op["svg"] = inside_root(op.pop("svgFile")).read_text(encoding="utf-8")
    return patch


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def reply(self, code, body, ctype="application/json"):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] != "/patch.json":
            return self.reply(404, '{"error":"not found"}')
        if not PATCH.exists():
            return self.reply(404, '{"error":"no state/patch.json"}')
        try:
            self.reply(200, json.dumps(expand(json.loads(PATCH.read_text(encoding="utf-8")))))
        except Exception as e:  # report bad patches to the plugin instead of dropping the connection
            self.reply(500, json.dumps({"error": str(e)}))

    def do_POST(self):
        if self.path != "/result":
            return self.reply(404, '{"error":"not found"}')
        report = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        SHOTS.mkdir(parents=True, exist_ok=True)
        for item in report.get("applied", []):
            res = item.get("result")
            if isinstance(res, dict) and str(res.get("png", "")).startswith("data:image/png;base64,"):
                name = re.sub(r"[^0-9A-Za-z_-]", "_", str(res.get("node", "shot"))) + ".png"
                (SHOTS / name).write_bytes(base64.b64decode(res["png"].split(",", 1)[1]))
                res["png"] = f"state/shots/{name}"
        RESULT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"result: {len(report.get('applied', []))} applied, {len(report.get('failed', []))} failed", flush=True)
        self.reply(200, '{"ok":true}')

    def log_message(self, fmt, *args):
        print(fmt % args, flush=True)


if __name__ == "__main__":
    print("Comment Sync Patch server on http://localhost:8787", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8787), Handler).serve_forever()
