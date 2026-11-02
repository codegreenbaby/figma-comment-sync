"""Read and reply to Figma comments via the REST API.

Usage:
  python tools/figma_comments.py init <file_key|url>   # create state/figma.json for a file
  python tools/figma_comments.py check                 # verify the token can read comments
  python tools/figma_comments.py fetch                 # unapplied threads as JSON
  python tools/figma_comments.py reply <comment_id> "<message>"

Token: secrets/figma-token.txt in the project (one line), falling back to
%USERPROFILE%\\.figma-token. File key: state/figma.json.
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOKEN_FILES = [ROOT / "secrets" / "figma-token.txt", Path.home() / ".figma-token"]
STATE = ROOT / "state" / "figma.json"
LEDGER = ROOT / "state" / "applied.jsonl"
API = "https://api.figma.com/v1"


def token():
    for f in TOKEN_FILES:
        t = f.read_text(encoding="utf-8-sig").strip() if f.exists() else ""
        if t and not t.startswith("PASTE"):
            return t
    sys.exit("No token in " + " or ".join(str(f) for f in TOKEN_FILES))


def file_key():
    if not STATE.exists():
        sys.exit(f"No {STATE}. Run: python tools/figma_comments.py init <figma file key or URL>")
    return json.loads(STATE.read_text(encoding="utf-8"))["fileKey"]


def call(method, path, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"X-Figma-Token": token(), "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} on {method} {path}: {e.read().decode()[:300]}")


def applied_ids():
    if not LEDGER.exists():
        return set()
    return {json.loads(l)["id"] for l in LEDGER.read_text(encoding="utf-8").splitlines() if l.strip()}


def threads():
    comments = call("GET", f"/files/{file_key()}/comments")["comments"]
    roots = {c["id"]: {**c, "replies": []} for c in comments if not c.get("parent_id")}
    for c in comments:
        if c.get("parent_id") in roots:
            roots[c["parent_id"]]["replies"].append(c)
    done = applied_ids()
    out = []
    for r in roots.values():
        if r["id"] in done or r.get("resolved_at"):
            continue
        out.append({
            "id": r["id"],
            "author": r["user"]["handle"],
            "created": r["created_at"],
            "node_id": (r.get("client_meta") or {}).get("node_id"),
            "node_offset": (r.get("client_meta") or {}).get("node_offset"),
            "message": r["message"],
            "replies": [{"author": x["user"]["handle"], "message": x["message"]}
                        for x in sorted(r["replies"], key=lambda x: x["created_at"])],
        })
    return sorted(out, key=lambda t: t["created"])


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "fetch"
    if cmd == "init":
        import re
        key = re.search(r"([0-9A-Za-z]{22,128})", sys.argv[2].split("/design/")[-1]).group(1)
        STATE.parent.mkdir(exist_ok=True)
        data = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {"sections": {}, "previews": {}}
        data.update({"fileKey": key, "fileUrl": f"https://www.figma.com/design/{key}"})
        STATE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        print(f"state/figma.json -> {key}")
    elif cmd == "check":
        n = len(call("GET", f"/files/{file_key()}/comments")["comments"])
        print(f"OK: token reads comments, {n} in file {file_key()}")
    elif cmd == "fetch":
        print(json.dumps(threads(), ensure_ascii=False, indent=2))
    elif cmd == "reply":
        cid, msg = sys.argv[2], sys.argv[3]
        res = call("POST", f"/files/{file_key()}/comments", {"message": msg, "comment_id": cid})
        with LEDGER.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"id": cid, "reply_id": res["id"], "message": msg}, ensure_ascii=False) + "\n")
        print(f"Replied to {cid}")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
