// Strict stand-in for the Figma plugin API: throws where the real API throws, so a patch that
// passes here fails in Figma only on things a stub cannot know (text metrics, real fonts).
(function () {
  let seq = 100;
  const loaded = new Set();
  const nodes = new Map();

  function make(type, props) {
    const n = Object.assign({
      id: "9:" + (seq++), type, name: type, x: 0, y: 0, width: 100, height: 100, opacity: 1, visible: true,
      fills: [], strokes: [], effects: [], children: type === "TEXT" ? undefined : [], parent: null, removed: false,
      layoutMode: "NONE", cornerRadius: 0,
      resize(w, h) {
        if (!(w >= 0.01)) throw new Error('in resize: Property "width" failed validation');
        if (!(h >= 0.01)) throw new Error('in resize: Property "height" failed validation');
        this.width = w; this.height = h;
      },
      appendChild(c) { if (!c) throw new Error("null child"); if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = this; this.children.push(c); },
      insertChild(i, c) { if (!c) throw new Error("null child"); if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = this; this.children.splice(i, 0, c); },
      remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.removed = true; nodes.delete(this.id); },
      clone() { const c = make(this.type, { name: this.name, width: this.width, height: this.height, x: this.x, y: this.y, layoutMode: this.layoutMode }); (this.children || []).forEach(k => c.appendChild(k.clone())); return c; },
      findAll(fn) { const out = []; (function walk(x) { (x.children || []).forEach(k => { if (fn(k)) out.push(k); walk(k); }); })(this); return out; },
      findAllWithCriteria({ types }) { const out = []; (function walk(x) { (x.children || []).forEach(k => { if (types.includes(k.type)) out.push(k); walk(k); }); })(this); return out; },
      async exportAsync() { return new Uint8Array([137, 80, 78, 71]); }
    }, props || {});
    if (type === "TEXT") {
      let chars = "", font = { family: "Inter", style: "Regular" };
      Object.defineProperty(n, "fontName", { get: () => font, set(v) { if (!loaded.has(v.family + "|" + v.style)) throw new Error('Cannot use unloaded font "' + v.family + " " + v.style + '"'); font = v; } });
      Object.defineProperty(n, "characters", { get: () => chars, set(v) { if (!loaded.has(font.family + "|" + font.style)) throw new Error('Cannot write to node with unloaded font "' + font.family + " " + font.style + '"'); chars = v; } });
      n.getStyledTextSegments = () => [{ fontName: font }];
      n.fontSize = 12;
    }
    if (type === "FRAME") n.layoutPositioning = "AUTO";
    nodes.set(n.id, n);
    return n;
  }

  const page = make("PAGE", { id: "0:1", name: "Page 1" });
  window.figma = {
    _nodes: nodes, _page: page, _make: make,
    currentPage: page,
    async getNodeByIdAsync(id) { return nodes.get(id) || null; },
    async setCurrentPageAsync(p) { if (p.type !== "PAGE") throw new Error("not a page"); this.currentPage = p; },
    async loadFontAsync(f) { if (f.family === "Missing") throw new Error("font not found"); loaded.add(f.family + "|" + f.style); },
    createFrame() { const f = make("FRAME"); page.appendChild(f); return f; },
    createRectangle() { const r = make("RECTANGLE"); page.appendChild(r); return r; },
    createText() { const t = make("TEXT"); page.appendChild(t); return t; },
    createNodeFromSvg(s) { if (!/^<svg[\s>]/.test(s)) throw new Error("bad svg"); const f = make("FRAME", { name: "Vector" }); page.appendChild(f); return f; },
    createImage(bytes) { if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error("createImage needs bytes"); return { hash: "hash" + bytes.length, async getSizeAsync() { return { width: 1, height: 1 }; } }; },
    base64Encode(b) { return btoa(String.fromCharCode.apply(null, Array.from(b))); },
    notify() {}
  };
})();
