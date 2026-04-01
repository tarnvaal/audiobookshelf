# audiobookshelf (fork)

Personal fork of [audiobookshelf](https://github.com/advplyr/audiobookshelf) with a rewritten epub reader.

## What changed

The stock epub reader uses [epub.js](https://github.com/futurepress/epub.js) for everything -- parsing, rendering, navigation. epub.js renders content inside iframes managed by a "continuous manager" that controls which spine items are loaded, laid out, and visible. This works for basic reading but falls apart when you build features on top of it:

- **TTS highlighting** requires cross-iframe DOM access, offset math between iframe and container coordinates, and careful tracking of which iframe contains the current paragraph
- **Resize/reflow** (opening the chat panel, changing font size, window resize) triggers epub.js's internal layout pipeline, which crashes after the manager has been patched to preload all spine items (`r.views.length is not a function`)
- **Paginated mode** fights the continuous manager's lazy loading, causing page jumps on pause/resume and position drift across chapter boundaries
- **`rendition.display(cfi)`** is the only way to navigate, but it triggers the full view pipeline and crashes in patched state

Every fix to one of these created a new edge case somewhere else.

## The rewrite

epub.js is now used only for parsing -- book structure, spine, TOC, CFI location maps. All rendering is custom:

- **No iframes.** Content is injected as `<section>` elements in a single scrollable div. TTS paragraph extraction is `querySelectorAll('p, h1, ...')`. Highlighting is direct DOM manipulation. No cross-frame offset math.
- **CSS columns for pagination.** Paginated mode uses `column-width` on a wrapper div with `translateX` to show one page at a time. `overflow: hidden` on the container clips to one page width. Page turns just change the transform offset.
- **No manager pipeline.** Resize is CSS. Navigation is scroll or transform. Nothing calls into epub.js after initial parse.

### Architecture

```
epub.js Book (parsing only)
    |
    v
ContentLoader ---- loads spine items, sanitizes HTML, rewrites URLs, strips xmlns
    |
    v
EpubRenderer ----- builds DOM, handles scroll/pagination, paragraph access
    |
    +-- ThemeManager ---- dark/sepia/light themes, font/size/spacing injection
    +-- PositionTracker -- scroll position <-> percentage mapping
    |
    v
EpubReader.vue --- thin Vue wrapper, same interface as stock reader
    |
    v
Reader.vue ------- unchanged parent component (TTS, chat, bookmarks, settings)
```

### What works

- Paginated rendering with page arrows, mouse wheel, keyboard
- TTS with blue box highlighting, auto-page-advance, correct start position
- Position/chapter/percentage tracking in status bar
- Progress save/restore across sessions
- Theme application (dark/sepia/light)
- Mobile-friendly layout (title row separated from controls)

### Known gaps

- Continuous scroll mode is untested with real epubs
- Settings changes mid-read (font/size/spacing) are untested
- Chat context text extraction via compatibility shim is untested
- Touch swipe to turn pages is not implemented

## Files

| Path | What |
|------|------|
| `client/lib/epub-renderer/` | Core rendering modules (ContentLoader, ThemeManager, EpubRenderer, PositionTracker) |
| `client/components/readers/EpubReader.vue` | Rewritten reader component |
| `client/cypress/tests/lib/` | 48 Cypress component tests |
| `docs/epub-renderer-rewrite.md` | Architecture plan |
| `docs/epub-renderer-gotchas.md` | DOM layout pitfalls discovered during bring-up |
| `docs/CHANGELOG-epub-renderer.md` | Change history |
| `docs/development.md` | Docker dev cycle, test commands |

## Development

See [docs/development.md](docs/development.md) for the Docker build/restart cycle, lock file sync, and test commands.

## Upstream

This fork tracks [advplyr/audiobookshelf](https://github.com/advplyr/audiobookshelf). Changes are limited to the epub reader -- server code is unmodified. Upstream merges are pulled periodically.
