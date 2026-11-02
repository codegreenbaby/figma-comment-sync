"""Bundle stub.js + ../code.js + a test patch into one HTML page for the browser pane.

Usage:
  python plugin/test/build_stub_test.py      # writes plugin/test/stub-test.html
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
stub = (HERE / "stub.js").read_text(encoding="utf-8")
code = (HERE.parent / "code.js").read_text(encoding="utf-8")

test = r"""
(async () => {
  const f = figma;
  // seed: a section with a text and a frame, as html_to_figma would leave them
  const sec = f._make("FRAME", { id: "16:2", name: "07 · section", layoutMode: "VERTICAL" }); f._page.appendChild(sec);
  const label = f._make("TEXT", { id: "16:5", name: "label" }); sec.appendChild(label);
  const btn = f._make("FRAME", { id: "10:19", name: "button", layoutMode: "HORIZONTAL" }); sec.appendChild(btn);
  await f.loadFontAsync({ family: "Inter", style: "Regular" }); label.characters = "old"; // seed only

  const patch = { id: "stub-1", page: "0:1", ops: [
    { op: "text", node: "16:5", text: "New headline" },
    { op: "fill", node: "10:19", color: "#A761FF" },
    { op: "effects", node: "10:19", effects: [{ glow: "#A761FF", alpha: .5, radius: 32 }] },
    { op: "set", node: "10:19", props: { cornerRadius: 12, itemSpacing: 8 } },
    { op: "resize", node: "10:19", w: -50, h: 40 },
    { op: "svg", parent: "16:2", svg: "<svg width='10' height='10'></svg>", name: "chart", x: 20, y: 30, index: 0, absolute: true },
    { op: "image", parent: "16:2", base64: btoa("PNGDATA"), w: 96, h: 54, name: "photo" },
    { op: "badge", parent: "10:19", text: "Most popular", color: "#3AE7A7" },
    { op: "clone", node: "10:19", parent: "16:2", name: "button copy" },
    { op: "inspect", node: "16:2", depth: 1 },
    { op: "screenshot", node: "16:2", scale: .5 },
    { op: "set", node: "10:19", props: { constructor: 1 } },
    { op: "text", node: "10:19", text: "not a text node" },
    { op: "remove", node: "404:404" },
    { op: "nope", node: "16:2" },
    { op: "badge", parent: "10:19", text: "bad font", color: "#3AE7A7", font: { family: "Missing", style: "Bold" } },
    { op: "remove", node: "16:5" },
    { op: "replaceWithSvg", node: "10:19", up: 0, svg: "<svg width='500' height='300'></svg>", name: "wave", h: 100, glowByStroke: true },
    { op: "replaceWithSvg", node: "16:2", up: 3, svg: "<svg></svg>" },
    { op: "image", parent: "16:2", base64: btoa("PNG2"), w: 420, h: 490, x: -170, y: 330, index: 0, absolute: true, opacity: .45, blendMode: "SCREEN", name: "decor" },
    { op: "findSet", parent: "16:2", match: { type: "RECTANGLE", minW: 400 }, fillOpacity: .8 },
    { op: "clone", node: "16:2", x: 1480, y: 0, name: "wide" },
    { op: "set", node: "$21", props: { layoutMode: "NONE" } },
    { op: "resize", node: "$21", w: 1760 },
    { op: "shiftChildren", node: "$21", dx: 240 },
    { op: "findSet", parent: "$21", match: { name: "decor" }, resize: { w: 560, h: 654 }, props: { x: -154 } },
    { op: "resize", node: "$12" },
    { op: "setImage", node: "$19", base64: btoa("PNG3") }
  ]};
  const r = await applyPatch(patch);
  const expectFail = [11, 12, 13, 14, 15, 18, 26];
  const failedIdx = r.failed.map(x => x.i);
  const st = sec.children.find(c => c.name === 'decor');
  const wide = [...figma._nodes.values()].find(n => n.name === 'wide');
  const ok = r.applied.length === 21 && figma._nodes.get(r.applied[20].result).fills[0].imageHash === 'hash4' && wide && wide.width === 1760 && r.failed.some(f => f.i === 26 && /no result/.test(f.error)) && st && st.opacity === .45 && st.blendMode === 'SCREEN' && st.layoutPositioning === 'ABSOLUTE' && r.applied[14].result.matched === 1 && btn.removed && sec.children.some(c => c.name === 'wave' && c.height === 100) && JSON.stringify(failedIdx) === JSON.stringify(expectFail)
    && label.removed
    && sec.children.some(c => c.name === "chart" && c.layoutPositioning === "ABSOLUTE");
  document.body.textContent = JSON.stringify({ PASS: ok, applied: r.applied.length, failed: r.failed }, null, 1);
  window.__report = r;
  window.__result = { PASS: ok, applied: r.applied.map(a => a.op), failed: r.failed };
})().catch(e => { document.body.textContent = "CRASH " + e.message; window.__result = { PASS: false, crash: e.message }; });
"""

html = f"<!doctype html><meta charset='utf-8'><title>plugin stub test</title><body><script>{stub}</script><script>{code}</script><script>{test}</script>"
(HERE / "stub-test.html").write_text(html, encoding="utf-8")
print("plugin/test/stub-test.html")
