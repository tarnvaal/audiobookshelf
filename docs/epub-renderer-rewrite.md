# Epub Renderer Rewrite

Replace epub.js's rendering pipeline (Rendition, Manager, Views, iframes) with a custom renderer. epub.js stays for parsing only.

## Problem

epub.js's continuous manager has been heavily patched (`patchContinuousManager`) to preload all spine items and disable `check`/`trim`. This causes cascading bugs: `rendition.display()`, `rendition.resize()`, and scrolling all trigger internal pipeline methods that crash with `r.views.length is not a function`. Every fix creates a new edge case.

## Architecture

Three layers:

### EpubRenderer.js (pure JS, no Vue)
Core renderer class. Loads spine item HTML, injects into a scrollable div (no iframes), handles scroll/pagination, themes, position tracking. This is the unit-testable core.

### EpubReader.vue (thin Vue wrapper)
Owns the `Book` instance and `EpubRenderer`. Exposes the same method/event interface Reader.vue already uses. Compatibility shim exposes `rendition`-like accessors so Reader.vue chat context code works unchanged.

### Reader.vue (unchanged)
Zero changes to the parent component. Interface contract preserved exactly.

## Key Decisions

### No iframes
All content lives in `<section data-spine-index="N">` elements inside one div. Eliminates:
- Cross-frame element access for TTS
- Offset math bugs (iframe rect + element rect)
- getContents() returning multiple opaque objects
- Keyboard/touch event forwarding

### CSS scoping instead of iframe isolation
Epub stylesheets get every selector prefixed with `#epub-content [data-spine-index="N"]`. Theme rules override with `!important`.

### Keep CFI for bookmarks/progress
epub.js can generate CFIs from parsed spine data without a rendition. Old bookmarks work with the new renderer.

### Lazy loading for large books
IntersectionObserver loads spine items within 2 viewport heights, unloads distant ones with same-height placeholders.

### Resource URL rewriting
Epub images/fonts use relative URLs. Rewrite `src`/`href` attributes using epub.js's `book.archive` resolver before injection.

### Paginated mode via CSS columns
```css
.epub-paginated {
  column-width: <readerWidth>px;
  column-gap: 0;
  height: <readerHeight>px;
  overflow: hidden;
}
```
Navigation = translateX by -(pageIndex * columnWidth).

## Interface Contract (EpubReader.vue -> Reader.vue)

### Methods Reader.vue calls via $refs.readerComponent
| Method | Purpose |
|---|---|
| `goToChapter(href)` | Navigate to TOC entry |
| `updateSettings(settings)` | Apply theme/font/layout changes |
| `addBookmark(cfi, label)` | Add bookmark at CFI |
| `removeBookmark(cfi)` | Remove bookmark |
| `goToBookmark(cfi)` | Navigate to bookmarked CFI |
| `resize()` | Handle container resize |
| `next()` | Next page/scroll segment |
| `prev()` | Previous page/scroll segment |
| `searchBook(query)` | Full-text search |
| `getTtsParagraphs()` | Get paragraph elements for TTS |
| `getFirstVisibleParagraphIndex(paragraphs)` | Find first visible paragraph |
| `ttsHighlight(el)` | Highlight a paragraph |
| `ttsClearHighlight()` | Clear TTS highlights |
| `ttsInstallClickHandlers()` | Install click-to-start-TTS handlers |
| `ttsRemoveClickHandlers()` | Remove those handlers |
| `ttsSaveProgress(el)` | Save progress from paragraph element |

### Properties Reader.vue reads
- `chapters` (array)
- `hasNext` (boolean)
- `book` (epub.js Book — for chat context spine access)
- `rendition.getContents()` (compatibility shim for chat context)
- `rendition.location.start.href` (compatibility shim for chapter context)

### Events EpubReader.vue emits
- `reading-status` — { percentage, chapter, location, totalLocations, sessionMinutes, etaMinutes, currentCfi }
- `bookmarks-updated` — array
- `tts-start-from` — paragraph index
- `touchstart` / `touchend` — events
- `reflowed` — layout changed signal

## File Structure
```
client/
  lib/epub-renderer/
    EpubRenderer.js       # Core renderer class
    ContentLoader.js      # Spine item loading + HTML sanitization + URL rewriting
    ThemeManager.js       # Theme/font/CSS injection
    Paginator.js          # CSS column pagination logic
    PositionTracker.js    # Scroll position <-> CFI mapping
  components/readers/
    EpubReader.vue        # Rewritten thin wrapper
  cypress/tests/
    lib/
      ContentLoader.cy.js
      ThemeManager.cy.js
      EpubRenderer.cy.js
      Paginator.cy.js
      PositionTracker.cy.js
```

## Test Plan (TDD order)

1. **ContentLoader** — loads spine items, sanitizes HTML, strips scripts, rewrites resource URLs
2. **ThemeManager** — applies dark/sepia/light themes, font settings, idempotent re-application
3. **EpubRenderer continuous mode** — renders all spine items, scroll maps to correct position, next/prev scroll by viewport
4. **Paginator** — CSS columns produce correct pages, next/prev advance correctly, resize recalculates
5. **PositionTracker** — visible element -> CFI, CFI -> scroll position, emits relocated events
6. **TTS integration** — paragraph extraction from plain DOM, visibility detection, highlight/scroll
7. **EpubReader.vue integration** — full mount, settings, chapter nav, bookmark cycle

## Phased Delivery

| Phase | What | Validates |
|-------|------|-----------|
| 1 | `client/lib/epub-renderer/` modules + tests | Core rendering works in isolation |
| 2 | New EpubReader.vue behind feature flag | Toggle old/new, continuous scroll + themes + progress |
| 3 | TTS migration | Highlighting, auto-scroll, pause/resume, progress saving |
| 4 | Chat context migration | Page/chapter/selection/range text extraction |
| 5 | Remove old code + feature flag | Clean codebase, single path |

## Risk Areas

1. **CFI from non-iframe DOM.** epub.js's `section.cfiFromElement()` uses XPath-like traversal from section root. Should work if DOM structure matches parsed section. Needs early validation.
2. **Epub CSS conflicts.** Some books have aggressive global styles. Selector scoping handles most cases.
3. **Resource loading.** Relative URLs in epub content need rewriting via `book.archive` resolver before DOM injection.
4. **Large books and memory.** Lazy loading with IntersectionObserver mitigates, but needs testing with big epubs.

## Current Status

- [ ] Phase 1: Core modules + tests
- [ ] Phase 2: New EpubReader.vue with feature flag
- [ ] Phase 3: TTS migration
- [ ] Phase 4: Chat context migration
- [ ] Phase 5: Remove old code + flag
