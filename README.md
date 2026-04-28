# ContextClip

Chrome extension. Clip precise content from web pages into AI-ready Markdown.

Not a web saver (but can be). A precision tool for feeding local LLMs.

## Why

LLMs need clean context. Web pages are noisy. You want three paragraphs from a GitHub README, not the sidebar, not the nav, not the comments.

ContextClip runs entirely in your browser — no server, no API key, no data leaving your machine. It works on login-required pages that server-side fetchers can't reach.

## What It Does

### Extract This Page

One click. Pulls main content, strips noise, adds YAML frontmatter with source metadata.

### Pick & Extract

Two ways to select:

- **Hover + click** — pick a semantic block (article, section, code, table)
- **Drag a rectangle** — long-press and drag to draw a selection area. Uses Range API so you get the exact text inside the rectangle, even if it's half a paragraph

Both produce the same clean Markdown output.

### Smart output

- Text pages → single `.md` file
- Media-heavy pages → `.zip` with `page.md` + `manifest.json`

All output includes YAML frontmatter: title, source URL, site, author, captured time, extraction mode.

## Site Support

General extraction works on any page via Readability. Deeper cleanup for:

- **GitHub** — README, rendered docs, single file views
- **微信公众号** — article body, author, title
- **知乎** — column posts, answers

Quality over coverage. Better to extract three sites well than thirty sites poorly.

## Install

```bash
pnpm install
pnpm build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `dist/`

## Usage

### Extract current page

1. Click extension icon
2. Click **Extract This Page**
3. Preview appears in popup
4. **Copy as MD** / **Download MD** / **Download ZIP**

### Select part of a page

1. Click extension icon
2. Click **Pick & Extract**
3. **Hover + click** to pick a block, or **long-press + drag** to draw a rectangle
4. Use floating toolbar to **Copy** or **Download**
5. **Right-click** to deselect and pick again, **Esc** again to quit

### Controls in selection mode

| Action | Effect |
|--------|--------|
| Click a block | Select that block |
| Long-press + drag | Draw a rectangle to select area |
| Right-click (with selection) | Deselect, return to hover mode |
| Right-click (no selection) | Exit selection mode |
| Esc (with selection) | Deselect, return to hover mode |
| Esc (no selection) | Exit selection mode |

## Output

### Markdown

```markdown
---
title: 'Example Page'
source_url: 'https://example.com/page'
site: 'example'
author: 'Author Name'
captured_at: '2026-04-28T10:45:13.901Z'
mode: 'selection'
selection_hint: 'article'
---

Page content here...
```

### ZIP fallback

For media-heavy pages:

```text
page-export/
  page.md
  manifest.json
```

## Development

```bash
pnpm install
pnpm dev
```

Watches source and rebuilds `dist/`. After each rebuild:

1. Open `chrome://extensions`
2. Find **ContextClip**
3. Click reload
4. Refresh target page if content script changed
