---
name: localize
description: Produce language versions of a page from its English source. Use when the user asks for translations or language versions. Also the rules for keeping a page translation-ready.
---

# Localize

English is the source. The target language list comes from the user or the project's own skill.

## Keeping a page translation-ready

- Every visible string sits in an element with `data-i18n="section.key"`; inline markup inside it
  is part of the string. Elements must not nest another element of the same tag.
- Use logical CSS properties (`margin-inline-start`, `padding-inline`, `inset-inline-end`) so
  `dir="rtl"` flips the layout without a second stylesheet.
- Expose the font stack as a CSS variable `--font`; the build swaps it for scripts that need it.
- Leave room for growth: German and other languages run longer than English.

## Producing versions

```
python tools/i18n.py extract pages/<slug>/index.html          # writes pages/<slug>/i18n/en.json
python tools/i18n.py build   pages/<slug>/index.html <lang>   # writes dist/<slug>/<lang>/index.html
```

1. Extract `en.json`.
2. Write `pages/<slug>/i18n/<lang>.json`: same keys, translated values. Keep inline tags and
   attributes exactly. Do not translate numbers, product names or `[VERIFY]` markers. Keep one
   term per concept per language.
3. Build each language. The build sets `lang`, adds `dir="rtl"` for Arabic, and loads a Noto font
   for Arabic, Simplified Chinese and Japanese (edit `RTL` / `FONTS` in `tools/i18n.py` for more).
4. Check the longest language and any RTL language at 1440 and 375 px.
5. Tell the user these are machine translations pending native review.
