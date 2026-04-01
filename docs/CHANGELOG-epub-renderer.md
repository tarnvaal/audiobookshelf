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

#### Pending
- Test new renderer with real epub in browser
- Phase 3: TTS migration validation
- Phase 4: Chat context migration
- Phase 5: Remove old code + feature flag
