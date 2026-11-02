"""Bundle a page into one self-contained file.

Local images (src="assets/...") are inlined as data URIs, so the file works in the
Artifact viewer, in html_to_figma, and in the browser pane's snapshot.

Usage:
  python tools/build_preview.py <page.html> <out.html>            # Artifact body (no doctype/head/body)
  python tools/build_preview.py <page.html> <out.html> --full     # full document, for html_to_figma
  python tools/build_preview.py <page.html> <out.html> --full --show-all
        # also shows every tab panel and freezes animations at rest, for Figma
"""
import base64
import mimetypes
import re
import sys
from pathlib import Path

src, out = Path(sys.argv[1]), Path(sys.argv[2])
full = "--full" in sys.argv
show_all = "--show-all" in sys.argv
html = src.read_text(encoding="utf-8")


def inline(m):
    path = src.parent / m.group(2)
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    data = base64.b64encode(path.read_bytes()).decode()
    return f'{m.group(1)}"data:{mime};base64,{data}"'


html = re.sub(r'(\bsrc=)"((?:\./)?assets/[^"]+)"', inline, html)
if show_all:
    # Figma sees one static frame: reveal hidden tab panels so every variant can be reviewed
    html = html.replace("</head>", '<style>[role="tabpanel"][hidden] { display: block !important; }</style>\n</head>', 1)
    # Figma captures one frame: show every animated element in its resting position
    html = html.replace("</head>", "<style>*, *::before, *::after { animation: none !important; transition: none !important; }</style>\n</head>", 1)

if not full:
    head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
    body = re.search(r"<body[^>]*>(.*?)</body>", html, re.S).group(1)
    head = re.sub(r'<meta (charset|name="viewport")[^>]*>\s*', "", head)
    html = head.strip() + "\n" + body.strip() + "\n"

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding="utf-8")
print(f"{out} ({out.stat().st_size} bytes)")
