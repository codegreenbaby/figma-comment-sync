---
name: page-build
description: Build a page end to end as HTML, push it to Figma as one frame per section, and publish an HTML preview. Use when the user asks to build or start a page or a section, "push to Figma", or "build the preview".
---

# Page build

HTML is the source of truth. Figma is the review surface. The preview is what reviewers scroll.
Load the project's own rules skill first, if the project has one.

## 1. Brief

Collect: what the page sells or explains, who reads it, the facts it may state, any reference
screenshots or URLs. Missing facts become `[VERIFY: what is needed]`, never estimates.

## 2. Build the page

`pages/<slug>/index.html`, a complete self-contained document. Follow `examples/demo/index.html`:

- One `<section data-section="NN-name">` per block, NN in page order. Each becomes a Figma frame.
- Every `section` (and `footer`) sets its own background. Figma frames do not inherit `<body>`.
- Visible strings sit in elements with `data-i18n="section.key"` (see `localize`).
- Tabs use `role="tab"` / `role="tabpanel"` + `hidden`, so the Figma build can reveal all panels.
- Fluid from 375 to 1440 px; use logical CSS properties so RTL works.
- Images live in `pages/<slug>/assets/` and are referenced as `src="assets/..."`; the build inlines
  them. Use WebP for large transparent images in HTML; keep a PNG copy for Figma (`createImage`
  does not take WebP).
- Animated backgrounds: generate SVG markup so the first frame is real geometry Figma can import.
- Respect `prefers-reduced-motion`.

## 3. Check locally

Bundle, then open in a browser (the bundle works offline and as a single file):

```
python tools/build_preview.py pages/<slug>/index.html dist/<slug>/full.html --full
```

Check 1440 and 375 widths: no horizontal scroll (`scrollWidth == clientWidth`), nothing overlaps.

## 4. Push to Figma (first time, or new sections)

This spends MCP calls. Say so before doing it.

1. `create_new_file` once per project (`whoami` gives the plan key). Save the key in `state/figma.json`.
2. Build the Figma variant: all tab panels visible, animations frozen at rest:
   ```
   python tools/build_preview.py pages/<slug>/index.html dist/<slug>/figma.html --full --show-all
   ```
3. `html_to_figma` with `cssSelector: "section[data-section], footer[data-section]"`, then
   `curl -f -X POST "<submitUrl>" -H "Content-Type: text/html" --data-binary @dist/<slug>/figma.html`.
4. Stack and name the frames (`NN · name`) with a plugin patch (`set` ops on x/y/name), not MCP.
5. Record every frame id under `sections` in `state/figma.json`.

Known behavior of `html_to_figma`: it renders at about 1280 px wide, drops CSS `mask-image`, turns
CSS `filter: drop-shadow` on images into a rectangular shadow, and imports `<img>` as a FRAME with
an image fill.

## 5. Preview

```
python tools/build_preview.py pages/<slug>/index.html dist/<slug>/index.html
```

`dist/<slug>/index.html` is the page body without `<html>/<head>/<body>` wrappers, ready for hosts
that add their own skeleton (for example a Claude Artifact). For a normal static host use the
`--full` build instead. Record the preview URL in `state/figma.json` under `previews`.
