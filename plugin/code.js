// Comment Sync Patch: applies a JSON patch prepared by the agent (state/patch.json).
// Runs without the Figma MCP, so it does not spend the plan's MCP call budget.
// Ground rules: clamp sizes, load fonts before text edits, stamp the build, and report what ran.
// One failing op never stops the rest of the patch.

var BUILD = "2026-11-03 b6";

// Images created in this patch; a screenshot in the same patch waits for them to decode,
// otherwise Figma exports the frame before the new picture is drawn (seen on 2026-11-03).
var pendingImages = [];

// ---------- helpers ----------

function W1(v, min) { var n = Number(v); return (isFinite(n) && n > 0) ? n : (min || 1); }

function hexColor(hex) {
  var h = String(hex).replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}

function solid(hex, opacity) {
  var p = { type: "SOLID", color: hexColor(hex) };
  if (opacity !== undefined && opacity !== null) p.opacity = Number(opacity);
  return p;
}

function glow(hex, alpha, radius, spread) {
  var c = hexColor(hex);
  return { type: "DROP_SHADOW", color: { r: c.r, g: c.g, b: c.b, a: alpha === undefined ? 0.6 : alpha },
    offset: { x: 0, y: 0 }, radius: radius === undefined ? 16 : radius, spread: spread || 0, visible: true, blendMode: "NORMAL" };
}

function effectsFrom(list) {
  return (list || []).map(function (e) {
    if (e.glow) return glow(e.glow, e.alpha, e.radius, e.spread);
    return e;
  });
}

async function node(id) {
  var n = await figma.getNodeByIdAsync(String(id));
  if (!n) throw new Error("node " + id + " not found");
  return n;
}

async function loadFontsOf(textNode) {
  var segs = textNode.getStyledTextSegments(["fontName"]);
  for (var i = 0; i < segs.length; i++) await figma.loadFontAsync(segs[i].fontName);
}

async function loadFontsUnder(n) {
  if (n.type === "TEXT") return loadFontsOf(n);
  if ("findAllWithCriteria" in n) {
    var texts = n.findAllWithCriteria({ types: ["TEXT"] });
    for (var i = 0; i < texts.length; i++) await loadFontsOf(texts[i]);
  }
}

function glowByStroke(root) {
  // one glow per child, colored like that child's stroke
  var n = 0;
  ("children" in root ? root.children : []).forEach(function (g) {
    var leaf = "children" in g && g.children.length ? g.children[0] : g;
    var s = leaf.strokes && leaf.strokes[0];
    if (!s || s.type !== "SOLID") return;
    var c = s.color, hex = "#" + [c.r, c.g, c.b].map(function (v) { var h = Math.round(v * 255).toString(16); return h.length < 2 ? "0" + h : h; }).join("");
    g.effects = [glow(hex, 0.8, 6, 0), glow(hex, 0.35, 18, 0)];
    n++;
  });
  return n;
}

function ancestor(n, up) {
  for (var i = 0; i < (up || 0); i++) { if (!n.parent || n.parent.type === "PAGE") throw new Error("no ancestor " + (i + 1) + " levels up"); n = n.parent; }
  return n;
}

function place(parent, child, op) {
  if (op.index !== undefined && op.index !== null) parent.insertChild(Math.max(0, Math.min(op.index, parent.children.length)), child);
  else parent.appendChild(child);
  if (op.absolute && "layoutMode" in parent && parent.layoutMode !== "NONE") child.layoutPositioning = "ABSOLUTE";
  if (op.x !== undefined) child.x = Number(op.x);
  if (op.y !== undefined) child.y = Number(op.y);
  if (op.name) child.name = op.name;
  if (op.opacity !== undefined) child.opacity = Number(op.opacity);
  if (op.blendMode) child.blendMode = op.blendMode;
}

function base64ToBytes(b64) {
  // figma.base64Decode exists in the plugin runtime; fall back to a manual decoder for the test stub
  if (typeof figma.base64Decode === "function") return figma.base64Decode(b64);
  var bin = atob(b64), out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Properties a "set" op may write directly. Anything else must use a dedicated op.
var SETTABLE = ["name", "x", "y", "opacity", "visible", "rotation", "cornerRadius", "itemSpacing",
  "paddingLeft", "paddingRight", "paddingTop", "paddingBottom", "layoutMode", "primaryAxisSizingMode",
  "counterAxisSizingMode", "primaryAxisAlignItems", "counterAxisAlignItems", "layoutPositioning",
  "clipsContent", "fontSize", "textAlignHorizontal", "textAutoResize", "isMask", "maskType", "blendMode"];

// ---------- operations ----------

var OPS = {
  // { op:"text", node, text }
  text: async function (op) {
    var n = await node(op.node);
    if (n.type !== "TEXT") throw new Error(op.node + " is " + n.type + ", not TEXT");
    await loadFontsOf(n);
    n.characters = String(op.text);
    return n.id;
  },
  // { op:"fill", node, color:"#hex", opacity? }  or  { op:"fill", node, fills:[...] }
  fill: async function (op) {
    var n = await node(op.node);
    n.fills = op.fills ? op.fills : [solid(op.color, op.opacity)];
    return n.id;
  },
  // { op:"stroke", node, color, weight }
  stroke: async function (op) {
    var n = await node(op.node);
    n.strokes = op.color ? [solid(op.color, op.opacity)] : [];
    if (op.weight !== undefined) n.strokeWeight = Number(op.weight);
    return n.id;
  },
  // { op:"effects", node, effects:[{glow:"#hex", alpha, radius, spread} | raw effect] }  ([] clears)
  effects: async function (op) {
    var n = await node(op.node);
    n.effects = effectsFrom(op.effects);
    return n.id;
  },
  // { op:"set", node, props:{ ... } }  only keys in SETTABLE
  set: async function (op) {
    var n = await node(op.node);
    if ("fontSize" in op.props || "textAlignHorizontal" in op.props || "textAutoResize" in op.props) await loadFontsUnder(n);
    Object.keys(op.props).forEach(function (k) {
      if (SETTABLE.indexOf(k) < 0) throw new Error("set: property " + k + " not allowed");
      if (k in n) n[k] = op.props[k];
    });
    return n.id;
  },
  // { op:"resize", node, w, h }
  resize: async function (op) {
    var n = await node(op.node);
    n.resize(W1(op.w, n.width), W1(op.h, n.height));
    return n.id;
  },
  // { op:"remove", node }
  remove: async function (op) {
    var n = await node(op.node);
    n.remove();
    return op.node;
  },
  // { op:"svg", parent, svg:"<svg...>", name, x, y, index, absolute, opacity, effects }
  svg: async function (op) {
    var parent = await node(op.parent);
    var s = figma.createNodeFromSvg(String(op.svg));
    place(parent, s, op);
    if (op.opacity !== undefined) s.opacity = Number(op.opacity);
    if (op.effects) s.effects = effectsFrom(op.effects);
    if (op.glowByStroke) glowByStroke(s);
    return s.id;
  },
  // { op:"replaceWithSvg", node, up, svg|svgFile, name, fit:"target"|"natural", h, glowByStroke }
  // Swaps a layer (or its ancestor `up` levels above) for an SVG at the same spot in the tree.
  replaceWithSvg: async function (op) {
    var target = ancestor(await node(op.node), op.up);
    var parent = target.parent, index = parent.children.indexOf(target);
    var s = figma.createNodeFromSvg(String(op.svg));
    parent.insertChild(index, s);
    if (target.layoutPositioning === "ABSOLUTE") s.layoutPositioning = "ABSOLUTE";
    if (op.fit === "natural") { s.x = target.x; s.y = target.y; }
    else { s.resize(W1(target.width), W1(op.h || target.height)); s.x = target.x; s.y = target.y; }
    if ("layoutAlign" in target && target.layoutAlign) s.layoutAlign = target.layoutAlign;
    s.name = op.name || target.name;
    if (op.glowByStroke) glowByStroke(s);
    var removed = target.id;
    target.remove();
    return { created: s.id, removed: removed, w: Math.round(s.width), h: Math.round(s.height) };
  },
  // { op:"image", parent, base64, w, h, name, x, y, index, absolute }  (server fills base64 from "file")
  image: async function (op) {
    var parent = await node(op.parent);
    var img = figma.createImage(base64ToBytes(op.base64));
    pendingImages.push(img);
    var r = figma.createRectangle();
    r.resize(W1(op.w, 100), W1(op.h, 100));
    r.fills = [{ type: "IMAGE", imageHash: img.hash, scaleMode: op.scaleMode || "FILL" }];
    place(parent, r, op);
    return r.id;
  },
  // { op:"setImage", node, base64, scaleMode }  swaps the picture in an existing image layer (server fills base64 from "file")
  setImage: async function (op) {
    var n = await node(op.node);
    var img = figma.createImage(base64ToBytes(op.base64));
    pendingImages.push(img);
    var keep = (Array.isArray(n.fills) ? n.fills : []).filter(function (f) { return f.type === "IMAGE"; })[0];
    n.fills = [{ type: "IMAGE", imageHash: img.hash, scaleMode: op.scaleMode || (keep ? keep.scaleMode : "FILL") }];
    return n.id;
  },
  // { op:"badge", parent, text, color:"#hex", bg:"#hex", bgOpacity, radius, font:{family,style}, size, index }
  badge: async function (op) {
    var parent = await node(op.parent);
    var font = op.font || { family: "Poppins", style: "SemiBold" };
    await figma.loadFontAsync(font);
    var f = figma.createFrame();
    f.layoutMode = "HORIZONTAL";
    f.primaryAxisSizingMode = "AUTO"; f.counterAxisSizingMode = "AUTO";
    f.paddingLeft = f.paddingRight = 8; f.paddingTop = f.paddingBottom = 2;
    f.cornerRadius = op.radius === undefined ? 6 : Number(op.radius);
    f.fills = [solid(op.bg || op.color, op.bgOpacity === undefined ? 0.14 : op.bgOpacity)];
    var t = figma.createText();
    t.fontName = font;
    t.characters = String(op.text);
    t.fontSize = op.size || 11;
    t.fills = [solid(op.color)];
    f.appendChild(t);
    f.name = op.name || op.text;
    place(parent, f, op);
    return f.id;
  },
  // { op:"findSet", parent, match:{ type, name, radius, minW, minH, maxW }, fillOpacity?, props? }
  // Edits every descendant of `parent` that matches; for layers whose ids are not mapped yet.
  findSet: async function (op) {
    var root = await node(op.parent), m = op.match || {};
    var hits = root.findAll(function (n) {
      if (m.type && n.type !== m.type) return false;
      if (m.name && n.name !== m.name) return false;
      if (m.radius !== undefined && n.cornerRadius !== m.radius) return false;
      if (m.minW !== undefined && n.width < m.minW) return false;
      if (m.maxW !== undefined && n.width > m.maxW) return false;
      if (m.minH !== undefined && n.height < m.minH) return false;
      if (m.maxH !== undefined && n.height > m.maxH) return false;
      return true;
    });
    hits.forEach(function (n) {
      if (op.fillOpacity !== undefined && Array.isArray(n.fills)) {
        n.fills = n.fills.map(function (f) { if (f.type !== "SOLID") return f; var c = JSON.parse(JSON.stringify(f)); c.opacity = Number(op.fillOpacity); return c; });
      }
      if (op.resize) n.resize(W1(op.resize.w, n.width), W1(op.resize.h, n.height));
      if (op.props) Object.keys(op.props).forEach(function (k) {
        if (SETTABLE.indexOf(k) < 0) throw new Error("findSet: property " + k + " not allowed");
        if (k in n) n[k] = op.props[k];
      });
    });
    return { matched: hits.length, ids: hits.map(function (n) { return n.id; }) };
  },
  // { op:"shiftChildren", node, dx, dy }  moves every direct child (frame must not be auto-layout)
  shiftChildren: async function (op) {
    var n = await node(op.node);
    if ("layoutMode" in n && n.layoutMode !== "NONE") throw new Error("shiftChildren: " + n.id + " is auto-layout; set layoutMode NONE first");
    n.children.forEach(function (c) { c.x += Number(op.dx || 0); c.y += Number(op.dy || 0); });
    return { moved: n.children.length };
  },
  // { op:"clone", node, parent?, name, x, y, index }
  clone: async function (op) {
    var src = await node(op.node);
    var c = src.clone();
    if (op.parent) place(await node(op.parent), c, op);
    else { if (op.x !== undefined) c.x = op.x; if (op.y !== undefined) c.y = op.y; if (op.name) c.name = op.name; }
    return c.id;
  },
  // { op:"screenshot", node, scale }  returns a PNG data URL to the result file
  screenshot: async function (op) {
    var n = await node(op.node);
    if (pendingImages.length) {
      for (var i = 0; i < pendingImages.length; i++) { try { await pendingImages[i].getSizeAsync(); } catch (e) { /* keep going */ } }
      await new Promise(function (res) { setTimeout(res, 1200); });
      pendingImages = [];
    }
    var bytes = await n.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: op.scale || 0.5 } });
    return { node: n.id, png: "data:image/png;base64," + figma.base64Encode(bytes) };
  },
  // { op:"inspect", node, depth }  ids, names, types, bounds of a subtree
  inspect: async function (op) {
    var n = await node(op.node);
    var depth = op.depth || 2;
    function walk(x, d) {
      var o = { id: x.id, name: x.name, type: x.type, x: Math.round(x.x), y: Math.round(x.y), w: Math.round(x.width), h: Math.round(x.height) };
      if (x.type === "TEXT") o.text = x.characters.slice(0, 80);
      if (d > 0 && "children" in x) o.children = x.children.map(function (c) { return walk(c, d - 1); });
      return o;
    }
    return walk(n, depth);
  }
};

async function applyPatch(patch) {
  var report = { build: BUILD, patch: patch.id || null, applied: [], failed: [] };
  var ops = patch.ops || [];
  if (patch.page) {
    var page = await node(patch.page);
    if (page.type === "PAGE") await figma.setCurrentPageAsync(page);
  }
  var results = {};
  // "$3" anywhere in an op means "the node made or returned by op 3" (its id, or its .created)
  function resolve(v) {
    if (typeof v === "string" && /^\$\d+$/.test(v)) {
      var r = results[v.slice(1)];
      if (r === undefined) throw new Error("reference " + v + " has no result (that op failed or has not run)");
      return typeof r === "string" ? r : (r.created || r.id || r.node);
    }
    if (Array.isArray(v)) return v.map(resolve);
    if (v && typeof v === "object") { var o = {}; Object.keys(v).forEach(function (k) { o[k] = resolve(v[k]); }); return o; }
    return v;
  }
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    var fn = OPS[op.op];
    try {
      if (!fn) throw new Error("unknown op " + op.op);
      op = resolve(op);
      var res = await fn(op);
      results[i] = res;
      report.applied.push({ i: i, op: op.op, ref: op.ref || null, result: res });
    } catch (e) {
      // one bad value must not kill the rest of the patch
      report.failed.push({ i: i, op: op.op, ref: op.ref || null, error: String(e && e.message || e) });
    }
  }
  return report;
}

// ---------- plugin entry ----------

if (typeof figma !== "undefined" && typeof __html__ !== "undefined" && figma.showUI) {
  figma.showUI(__html__, { width: 360, height: 300, title: "Comment Sync Patch " + BUILD });
  figma.ui.onmessage = async function (msg) {
    if (msg.type === "apply") {
      var report = await applyPatch(msg.patch);
      figma.ui.postMessage({ type: "report", report: report });
      figma.notify("Patch " + (report.patch || "") + ": " + report.applied.length + " applied, " + report.failed.length + " failed (build " + BUILD + ")");
    }
    if (msg.type === "close") figma.closePlugin();
  };
}
