# audiobookshelf (fork)

Fork of [audiobookshelf](https://github.com/advplyr/audiobookshelf) rebuilt around epub reading. Stock audiobookshelf is audiobook-first -- the epub reader is a secondary feature built on [epub.js](https://github.com/futurepress/epub.js) iframes. This fork replaces that rendering layer entirely.

## What we did

**Replaced epub.js rendering with a custom DOM renderer.** epub.js still handles parsing (book structure, spine, TOC, CFI location maps). Everything else is ours:

- Custom rendering pipeline -- content injected as `<section>` elements in a single div, no iframes, no epub.js Manager/Views pipeline
- CSS column pagination -- `column-width` + `translateX` for page turns, pure CSS resize
- TTS with Kokoro -- paragraph-level highlighting, auto-page-advance, position-aware playback start, pause/resume without position loss
- LLM chat panel -- Ollama integration with page/chapter/selection/range context modes
- Mobile-usable reader -- title row separated from controls, mouse wheel page turns

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
- Mobile-friendly layout

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

Tracks [advplyr/audiobookshelf](https://github.com/advplyr/audiobookshelf). Changes are limited to the epub reader -- server code is unmodified. Upstream merges pulled periodically.
