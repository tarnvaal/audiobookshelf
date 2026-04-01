# Epub Renderer Rewrite - Changelog

## [Unreleased]

### Phase 1: Core Modules (in progress)

#### Added
- `client/lib/epub-renderer/ContentLoader.js` — spine item loading, HTML sanitization, URL rewriting, script stripping, decorative content marking (data-tts-skip)
- `client/lib/epub-renderer/ThemeManager.js` — dark/sepia/light themes, font/size/spacing/alignment injection, scoped epub CSS per spine section, idempotent style management
- `client/lib/epub-renderer/EpubRenderer.js` — core renderer with continuous scroll and paginated (CSS columns) modes, TTS paragraph extraction, navigation (next/prev/scrollToSection/scrollToElement), resize, event system
- `client/cypress/tests/lib/ContentLoader.cy.js` — tests for loading, sanitization, URL rewriting, CSS extraction, decorative content marking
- `client/cypress/tests/lib/ThemeManager.cy.js` — tests for theme application, font settings, line spacing, idempotency, scoped CSS injection
- `client/cypress/tests/lib/EpubRenderer.cy.js` — tests for continuous/paginated rendering, navigation, paragraph access, resize, events
- `docs/epub-renderer-rewrite.md` — full rewrite plan
- `docs/CHANGELOG-epub-renderer.md` — this changelog
- Branch `epub-renderer-rewrite` created from master

#### Added (cont.)
- `client/lib/epub-renderer/PositionTracker.js` — CFI mapping, scroll tracking, relocated events (9/9 tests passing)
- `client/cypress/tests/lib/PositionTracker.cy.js` — tests for position tracking, CFI generation, scroll events
- `client/components/readers/EpubReaderNew.vue` — new EpubReader using custom renderer (Phase 2)
- Feature flag: `localStorage.setItem('useCustomRenderer', 'true')` toggles new renderer
- Compatibility shim on EpubReaderNew.vue exposes `rendition` for Reader.vue chat context
- All 48 Phase 1 tests passing

#### Fixed during bring-up
- XML document `.body` property missing — fall back to `querySelector('body')`
- XHTML xmlns attributes breaking HTML rendering — import nodes into HTML context
- Container zero dimensions at render time — defer column sizing with requestAnimationFrame
- CSS column overflow clipping all content — wrapper overflow visible, container clips
- `getBoundingClientRect` not reflecting CSS column transforms — use `offsetLeft / pageWidth` for page detection
- Position tracking using DOM-based CFI (fails across document boundaries) — use page-based percentage + `locations.cfiFromPercentage`

#### Working
- Paginated rendering (661 pages from 89 spine sections)
- Page turning (prev/next arrows)
- TTS starts from current page
- TTS blue box highlighting
- Position/percentage/chapter tracking in status bar
- Progress saving on page turn
- Theme application (dark/sepia/light)

#### Remaining
- **Phase 3: TTS hardening** — verify pause/resume, auto-advance, progress save on paragraph end
- **Phase 4: Chat context** — verify page/chapter/selection/range text extraction via compatibility shim
- **Continuous scroll mode** — untested with real epub, likely needs fixes
- **Position restore on reload** — `_scrollToCfi` does rough spine-level positioning, needs exact paragraph restore
- **Bookmarks** — navigate to bookmark (needs page calculation from CFI)
- **Settings panel** — font, size, spacing, theme changes while reading
- **Keyboard/touch navigation** — verify arrow keys and swipe
- **Search** — verify `searchBook` works with new renderer
- **Phase 5: Remove old code + feature flag** — once all above validated
