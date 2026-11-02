# Vibe Figma Patch (plugin)

A Figma development plugin that applies a JSON patch prepared by the agent. It edits the file
through the Plugin API, so it does not spend Figma MCP calls.

## Install (once)

Development plugins run only in the **Figma desktop app**.

1. Open your file in Figma Desktop.
2. Menu > Plugins > Development > Import plugin from manifest...
3. Select `plugin/manifest.json` from this repository.

## Run

1. The agent writes `state/patch.json` and starts `python tools/patch_server.py`
   (listens on `127.0.0.1:8787` only).
2. In Figma: Plugins > Development > Vibe Figma Patch > **Apply patch from agent**.
3. The plugin applies the ops, shows a toast with counts and the build stamp, and POSTs its report
   to the server. The agent reads `state/patch-result.json`; screenshots land in `state/shots/`.

No server? Open "Paste a patch instead" in the plugin window and paste the JSON. The report then
stays in the window.

If the window title shows an older build stamp than `BUILD` in `code.js`, Figma is running a cached
copy: remove the plugin in Plugins > Development > Manage plugins in development and import the
manifest again.

## Patch format

```json
{ "id": "round-3", "page": "0:1", "ops": [
  { "op": "text",    "node": "16:5",  "text": "New headline" },
  { "op": "fill",    "node": "10:19", "color": "#7C9CFF" },
  { "op": "stroke",  "node": "10:19", "color": "#FFFFFF", "weight": 1 },
  { "op": "effects", "node": "10:19", "effects": [{ "glow": "#7C9CFF", "alpha": 0.5, "radius": 32 }] },
  { "op": "set",     "node": "10:19", "props": { "cornerRadius": 12, "itemSpacing": 8 } },
  { "op": "resize",  "node": "10:19", "w": 200, "h": 40 },
  { "op": "svg",     "parent": "16:4", "svgFile": "pages/demo/assets/chart.svg", "index": 0, "absolute": true, "glowByStroke": true },
  { "op": "replaceWithSvg", "node": "33:15", "up": 1, "svgFile": "pages/demo/assets/wave.svg", "h": 100 },
  { "op": "image",   "parent": "12:2", "file": "pages/demo/assets/photo.png", "w": 420, "h": 490, "x": -170, "y": 330, "index": 0, "absolute": true, "opacity": 0.45, "blendMode": "SCREEN" },
  { "op": "setImage", "node": "40:54", "file": "pages/demo/assets/photo-v2.png" },
  { "op": "badge",   "parent": "15:189", "text": "Most popular", "color": "#7C9CFF", "radius": 6 },
  { "op": "clone",   "node": "12:2", "x": 1480, "y": 951, "name": "wide copy" },
  { "op": "set",     "node": "$11", "props": { "layoutMode": "NONE" } },
  { "op": "resize",  "node": "$11", "w": 1760 },
  { "op": "shiftChildren", "node": "$11", "dx": 240 },
  { "op": "findSet", "parent": "12:2", "match": { "type": "FRAME", "radius": 16, "minW": 300 }, "fillOpacity": 0.8 },
  { "op": "remove",  "node": "28:12" },
  { "op": "inspect", "node": "16:2", "depth": 2 },
  { "op": "screenshot", "node": "16:2", "scale": 0.4 }
] }
```

| Op | What it does |
|---|---|
| `text` | Replaces a text layer's characters (loads its fonts first) |
| `fill`, `stroke` | Solid paint from a hex color, or raw `fills` |
| `effects` | `{glow, alpha, radius, spread}` shorthand or raw Figma effects; `[]` clears |
| `set` | Writes allowed properties only (list `SETTABLE` in `code.js`) |
| `resize` | Resizes; bad values fall back to the current size instead of throwing |
| `svg` | Inserts SVG markup; `glowByStroke` gives each child a glow in its stroke color |
| `replaceWithSvg` | Swaps a layer, or its ancestor `up` levels above, for an SVG in the same slot |
| `image` | Inserts a rectangle with an image fill (PNG/JPEG) |
| `setImage` | Replaces the picture inside an existing image layer |
| `badge` | Adds a small auto-layout label |
| `clone` | Duplicates a node, optionally into a parent |
| `shiftChildren` | Moves every direct child (frame must not be auto-layout) |
| `findSet` | Edits every descendant matching `{type, name, radius, minW, maxW, minH, maxH}` |
| `remove` | Deletes a node |
| `inspect` | Returns ids, names, types and bounds of a subtree |
| `screenshot` | PNG of a node, saved by the server to `state/shots/<node>.png` |

Common options on inserting ops: `name`, `x`, `y`, `index`, `absolute` (absolute positioning inside
auto-layout parents), `opacity`, `blendMode`.

- `"$N"` anywhere in an op resolves to the node made or returned by op N of the same patch.
  If op N failed, the referencing op fails with a clear message.
- `file` and `svgFile` are project-relative paths; the server inlines them and refuses paths that
  leave the project.
- Each op runs on its own: a failure is reported and the rest still apply.
- A `screenshot` after `image`/`setImage` in the same patch waits for the new pictures to decode.

## Test without Figma

```
python plugin/test/build_stub_test.py
```

Open `plugin/test/stub-test.html` in a browser. The page runs a sample patch against a strict stub
of the Plugin API (it throws where Figma throws) and prints `"PASS": true` when every op behaves.

## Limits

- No HTML import: new sections come from MCP `html_to_figma`, or are drawn op by op.
- `networkAccess.devAllowedDomains` only applies to development plugins. Publishing this plugin to
  the Community would need a different transport.
