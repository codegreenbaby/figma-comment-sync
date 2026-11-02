"""Extract page strings to JSON and build language versions.

Strings live in elements marked data-i18n="key"; the element's inner HTML is the value.
Leaf elements only: a data-i18n element must not contain another element of the same tag.

Usage:
  python tools/i18n.py extract pages/<slug>/index.html
  python tools/i18n.py build pages/<slug>/index.html <lang>
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TAGGED = re.compile(r'<(\w+)([^>]*\bdata-i18n="([^"]+)"[^>]*)>(.*?)</\1>', re.S)
RTL = {"ar"}
FONTS = {"ar": "Noto Sans Arabic", "zh-hans": "Noto Sans SC", "ja": "Noto Sans JP"}


def extract(page):
    strings = {m.group(3): m.group(4).strip() for m in TAGGED.finditer(page.read_text(encoding="utf-8"))}
    out = page.parent / "i18n" / "en.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(strings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{out}: {len(strings)} strings")


def build(page, lang):
    html = page.read_text(encoding="utf-8")
    strings = json.loads((page.parent / "i18n" / f"{lang}.json").read_text(encoding="utf-8"))
    missing = []

    def swap(m):
        key = m.group(3)
        if key not in strings:
            missing.append(key)
            return m.group(0)
        return f"<{m.group(1)}{m.group(2)}>{strings[key]}</{m.group(1)}>"

    html = TAGGED.sub(swap, html)
    attrs = f'lang="{lang}"' + (' dir="rtl"' if lang in RTL else "")
    html = re.sub(r"<html[^>]*>", f"<html {attrs}>", html, count=1)
    if lang in FONTS:
        family = FONTS[lang]
        font_url = "https://fonts.googleapis.com/css2?family=" + family.replace(" ", "+") + ":wght@400;600;700&display=swap"
        html = html.replace("</head>", f'<link href="{font_url}" rel="stylesheet">\n'
                            f'<style>:root {{ --font: "{family}", system-ui, sans-serif; }}</style>\n</head>', 1)
    out = ROOT / "dist" / page.parent.name / lang / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"{out}" + (f"  MISSING: {', '.join(missing)}" if missing else ""))


if __name__ == "__main__":
    cmd, page = sys.argv[1], Path(sys.argv[2])
    if cmd == "extract":
        extract(page)
    elif cmd == "build":
        build(page, sys.argv[3])
    else:
        sys.exit(__doc__)
