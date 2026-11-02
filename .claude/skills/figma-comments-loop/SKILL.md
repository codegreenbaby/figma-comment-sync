---
name: figma-comments-loop
description: Apply the user's Figma comments to the HTML source and to the Figma file, then reply in each thread. Use when the user says "check comments", "apply comments", or anything that means acting on feedback left in the Figma file.
---

# Figma comments loop

Read → map → decide → edit HTML → check → patch Figma → verify → reply → report.
The user deletes comments once they see the change. `state/applied.jsonl` stops a comment from
being applied twice if they forget.

## 1. Read

```
python tools/figma_comments.py fetch
```

Returns unapplied, unresolved root threads with their replies in order. The real instruction is
often in a reply, not the root. Empty list: say so and stop.

## 2. Map

Each thread has `node_id` and `node_offset` (pixels from that node's top-left). Look the node up in
`state/figma.json` to find the section and its HTML. Use the offset against the layout to find
the element. If the node is unknown, run a plugin `inspect` patch or ask the user. Do not spend an
MCP read.

## 3. Decide

Copy, visual, layout, motion, or a question. Questions get an answer in the thread and no edit.
If the request conflicts with the project's own rules skill, do not apply it silently: reply with
the conflict and an alternative.

## 4. Edit the HTML and check it

Change `pages/<slug>/index.html` (texts through their `data-i18n` keys). Regenerate any generated
parts. Bundle with `tools/build_preview.py ... --full` and look at 1440 and 375 px once each.

## 5. Patch Figma with the plugin

1. Write `state/patch.json` (format: `plugin/README.md`). Use ids from `state/figma.json`.
   Prefer in-place ops (`text`, `fill`, `set`, `effects`, `setImage`, `replaceWithSvg`) so the
   commented node keeps its id and the comment stays pinned.
   Use `"$N"` to refer to the node made by op N in the same patch.
2. End the patch with a `screenshot` op for each touched section.
3. Start the bridge in the background: `python tools/patch_server.py`.
4. Ask the user to run *Plugins > Development > Vibe Figma Patch > Apply patch from agent*.
5. Read `state/patch-result.json`. Every `failed` entry needs a fix and a follow-up patch.
   Look at `state/shots/*.png`. A blank image right after `image`/`setImage` in builds before b6
   meant the screenshot ran before the picture decoded; re-check with a screenshot-only patch.
6. Stop the server, delete `state/patch.json`, record new ids in `state/figma.json`.

Only for what the plugin cannot do (importing a brand-new section from HTML) fall back to MCP
`html_to_figma`, and tell the user it spends the MCP budget.

## 6. Reply

```
python tools/figma_comments.py reply <root_comment_id> "<message>"
```

One or two sentences in the user's language: what changed, exact values, and anything that exists
only in HTML (motion). The command logs the id to `state/applied.jsonl`.

## 7. Report

Rebuild and republish the preview to the same URL. Tell the user, per comment: what was done in
HTML, what was done in Figma, what was skipped and why.

## Figma gotchas worth knowing

- Masks: a RECTANGLE with a `GRADIENT_RADIAL` fill (identity transform is centered) and
  `isMask = true` works inside a plain FRAME, over a RECTANGLE that carries the image fill.
  A mask inside `figma.group()`, or over an imported image FRAME, renders nothing.
- A layer shadow on a transparent PNG becomes a rectangle. Bake glows into the image instead.
- To widen a frame without reflowing it: `set layoutMode NONE` (children keep their positions),
  `resize`, then `shiftChildren`.
