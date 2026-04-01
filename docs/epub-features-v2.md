# Epub Features v2 — Implementation Plan

Four features for the epub reader. Each is independent. Build order: bookmark preview, chapter progress, vocabulary builder, book DNA fingerprinting.

Branch: `epub-features-v2`

## Codebase context (for cold start)

- No iframes. All epub content renders as `<section data-spine-index="N">` inside `#epub-content`. CSS column pagination via `translateX` on a wrapper div.
- epub.js is parsing-only. `Book` provides spine, TOC, locations, CFI generation. Rendering is `EpubRenderer.js`.
- Three layers: `EpubRenderer.js` (pure JS) -> `EpubReader.vue` (Vue wrapper) -> `Reader.vue` (parent: bookmarks, TTS, chat, settings).
- Bookmarks stored in localStorage at `ebookBookmarks-{libraryItemId}`.
- Position tracking uses `currentPage / (totalPages - 1)`. CFIs derived from percentages.
- Server is Express + Sequelize/SQLite. Proxy endpoints for Ollama and Kokoro TTS in `Server.js` lines 322-380.
- CSS column gotcha: `getBoundingClientRect()` ignores `translateX`. Must use `offsetLeft / pageWidth` via `_getElementPageOffset()`.
- Docker dev cycle documented in `docs/development.md`.

---

## Feature 1: Bookmark Preview

**Scope:** ~1-2 hours. Two file edits.

### What

Show ~120 characters of paragraph text alongside each bookmark in the bookmarks panel. Currently bookmarks show "15% — Chapter 3" with no content preview.

### Data model

Add `preview` field to bookmark objects. Current format:
```js
{ cfi, percentage, chapter, label, created }
```
New:
```js
{ cfi, percentage, chapter, label, created, preview }
```

Old bookmarks without `preview` degrade gracefully (no preview shown).

### Text extraction

In `EpubReader.vue` `addBookmark()` (line 451), after computing `pct`:

```js
let preview = ''
if (this.renderer) {
  const visibleText = this.renderer.getVisibleText()
  preview = visibleText.slice(0, 120).trim()
  if (visibleText.length > 120) preview += '...'
}
```

`getVisibleText()` already handles paginated mode correctly via `_getElementPageOffset()`.

### UI

In `Reader.vue` bookmarks panel (lines 128-133), add below the percentage line:

```html
<p v-if="bm.preview" class="text-xs opacity-40 mt-0.5 line-clamp-2 italic">{{ bm.preview }}</p>
```

Inline expansion, not tooltip. More mobile-friendly, simpler, no positioning logic.

### Files
- `client/components/readers/EpubReader.vue` — `addBookmark()` (line 451)
- `client/components/readers/Reader.vue` — bookmarks panel template (lines 128-133)

### Test
- Create bookmarks on different pages, verify preview text appears.
- Bookmark a page with only images — preview should be empty, no crash.
- Verify old bookmarks still render.

---

## Feature 2: Chapter Progress Indicator

**Scope:** ~2-3 hours. Small additions to existing files.

### What

Thin progress bar showing how far through the current chapter you are. Displayed in the status bar (bottom) and optionally per-chapter in the TOC sidebar.

### Where chapter data comes from

`getChapters()` (EpubReader.vue line 604) builds the TOC tree with `start` percentages. `flattenChapters()` (line 648) fills in `end` values. **`flattenChapters()` exists but is never called.** Must be called after `getChapters()` resolves.

### Calculation

```js
const chapterProgress = (chapter.end && chapter.start != null)
  ? Math.max(0, Math.min(1, (pct - chapter.start) / (chapter.end - chapter.start)))
  : 0
```

### Implementation

1. **EpubReader.vue:** After `getChapters()` (line 783), call `this._flatChapters = this.flattenChapters(this.chapters)`.
2. **EpubReader.vue:** In `_onPositionChanged()` (line 278), compute `chapterProgress` and add to `reading-status` emit.
3. **Reader.vue status bar** (lines 55-69): Add an amber progress bar below the blue whole-book bar.
4. **Reader.vue TOC sidebar** (lines 96-111, optional): Add a thin bar below the current chapter's title.

### Status bar UI

```html
<!-- Existing whole book progress -->
<div class="w-full h-0.5 bg-gray-700">
  <div class="h-full bg-blue-500/60 transition-all" :style="{ width: bookPct + '%' }"></div>
</div>
<!-- Chapter progress -->
<div v-if="readingStatus.chapterProgress != null" class="w-full h-0.5 bg-gray-700/50">
  <div class="h-full bg-amber-500/60 transition-all" :style="{ width: chapterPct + '%' }"></div>
</div>
```

### Files
- `client/components/readers/EpubReader.vue` — `_onPositionChanged()`, initialization after `getChapters()`
- `client/components/readers/Reader.vue` — status bar, optionally TOC sidebar

### Test
- Navigate within a chapter, verify amber bar fills 0-100%.
- Cross a chapter boundary, verify it resets.
- Test with nested TOC items.

---

## Feature 3: Vocabulary Builder

**Scope:** ~4-6 hours. New component, new server endpoint, dictionary file setup.

### What

Select a word in the reader to see its definition. Save words to a per-book vocabulary list for review. Uses a local WordNet dictionary — no external API.

### Dictionary

**WordNet SQLite** — Princeton WordNet 3.1 in SQLite format.
- Size: ~30MB
- License: Princeton WordNet license (free use with attribution)
- Placement: `/config/wordnet.sqlite` (already a Docker volume mount)
- Source: https://github.com/pxcanem/wnsqlite or build from official distribution

### Server endpoint

`GET /api/dictionary/:word`

Add to `Server.js` after line 380. Uses `better-sqlite3` (read-only, separate from Sequelize app database).

```js
const sqlite3 = require('better-sqlite3')
const DICT_DB_PATH = Path.join(global.ConfigPath, 'wordnet.sqlite')

let dictDb = null
function getDictDb() {
  if (!dictDb && fs.existsSync(DICT_DB_PATH)) {
    dictDb = sqlite3(DICT_DB_PATH, { readonly: true })
  }
  return dictDb
}

router.get('/api/dictionary/:word', authMiddleware, (req, res) => {
  const db = getDictDb()
  if (!db) return res.status(503).json({ error: 'Dictionary not available' })
  const word = req.params.word.toLowerCase().trim()
  const rows = db.prepare(`
    SELECT s.pos, d.definition
    FROM words w
    JOIN senses se ON w.wordid = se.wordid
    JOIN synsets s ON se.synsetid = s.synsetid
    JOIN definitions d ON s.synsetid = d.synsetid
    WHERE w.lemma = ?
    ORDER BY se.sensenum LIMIT 5
  `).all(word)
  res.json({ word, definitions: rows })
})
```

**Note:** WordNet SQLite schemas vary by source. The query above uses a common schema — test against the actual file and adjust column/table names.

**Dependency:** Add `better-sqlite3` to `package.json`. Native module — Docker already has build tools (`python3`, `make`, `g++` in the Dockerfile).

### Word click detection

Use `mouseup` after text selection — no conflict with TTS click handlers (which use `click` on paragraph elements) or page turn gestures.

In `EpubReader.vue`, add alongside the scroll listener (line 749):

```js
container.addEventListener('mouseup', (e) => {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return
  const word = selection.toString().trim()
  if (!word || word.includes(' ') || word.length > 30) return
  this.$emit('word-selected', { word, x: e.clientX, y: e.clientY })
})
```

Works because there are no iframes — `window.getSelection()` covers all rendered content.

### Popover component

New file: `client/components/readers/WordPopover.vue`

- Absolutely positioned at click coordinates
- Shows: word (bold), part of speech, definitions (numbered)
- "Save" button adds to per-book vocab list
- Click-outside to dismiss
- Theme-aware (reads `data-theme` from `#reader`)
- Viewport clamping to prevent overflow

### Vocab list storage

localStorage at `ebookVocab-{libraryItemId}` (consistent with bookmarks pattern).

Format:
```js
[{ word, definition, pos, addedAt, reviewed }]
```

### Vocab panel

In `Reader.vue`, add a "dictionary" button to the toolbar (near bookmarks button). Opens a side panel with saved words, definitions, delete button. Same layout pattern as the bookmarks panel.

### Files
- `server/Server.js` — dictionary endpoint
- `client/components/readers/EpubReader.vue` — `mouseup` listener, `word-selected` event
- **NEW:** `client/components/readers/WordPopover.vue` — popover component
- `client/components/readers/Reader.vue` — `word-selected` handler, vocab state, vocab panel, toolbar button
- `package.json` — add `better-sqlite3`

### Setup
1. Download WordNet SQLite
2. Place at `/home/tarnv/server/audiobookshelf/config/wordnet.sqlite`
3. Rebuild Docker image (`better-sqlite3` native compilation)

### Test
- Look up common words, verify definitions appear.
- Look up a word not in dictionary, verify "No definition found."
- Verify no interference with TTS (TTS active + word selection should coexist).
- Save words, close reader, reopen, verify list persists.
- Check popover doesn't overflow viewport edges.

---

## Feature 4: Book DNA Fingerprinting

**Scope:** ~8-12 hours. New model, algorithms, server endpoints, Ollama integration, book detail UI.

### What

Analyze writing style of books and find similar reads based on textual properties. Metrics computed server-side, style summary generated by Ollama, similarity via cosine distance.

### Text extraction (server-side)

Do NOT use epub.js on the server (it expects browser APIs). Use `jszip` to read the epub ZIP directly:

New file: `server/utils/epubTextExtractor.js`

1. Open epub as ZIP with `jszip`
2. Parse `META-INF/container.xml` to find OPF path
3. Parse OPF for spine item order and manifest hrefs
4. Extract each spine item's XHTML, strip HTML tags, collect text
5. Return full text as string

Dependencies: `jszip`, `fast-xml-parser` (add to `package.json`).

### Metrics

New file: `server/utils/bookFingerprint.js`

Seven metrics, each producing a float:

| Metric | Algorithm | Typical range |
|--------|-----------|---------------|
| avgSentenceLength | Split on `[.!?]\s`, count words per sentence, average | 10-25 |
| vocabDensity | `uniqueWords / totalWords` (lowercase, strip punctuation) | 0.05-0.30 |
| dialogueRatio | Regex match quoted text length / total length | 0.0-0.6 |
| paragraphLengthMean | Split on `\n\n`, mean word count per paragraph | 20-200 |
| paragraphLengthStddev | Standard deviation of paragraph word counts | 10-150 |
| pacingVariance | Variance of action-verb density across chapters | 0.0-0.01 |
| descriptiveDensity | Words ending in -ly/-ful/-ous/-ive/-al/-ish/-less / total | 0.02-0.10 |

Store as individual columns (for querying) plus a JSON vector (for similarity).

### Database model

New file: `server/models/BookFingerprint.js`

```
id (UUID, PK)
libraryItemId (UUID, unique, FK)
avgSentenceLength (FLOAT)
vocabDensity (FLOAT)
dialogueRatio (FLOAT)
paragraphLengthMean (FLOAT)
paragraphLengthStddev (FLOAT)
pacingVariance (FLOAT)
descriptiveDensity (FLOAT)
vector (JSON) — normalized 7-dim array
distinctiveWords (JSON) — top 20 TF-IDF words [{word, score}]
metricsJson (JSON) — full detail (pacing curve, paragraph distribution, etc.)
styleSummary (TEXT) — Ollama-generated
styleSummaryModel (STRING) — which model
styleSummaryPromptVersion (STRING) — for A/B tracking
styleSummaryRating (INTEGER) — Eric's 1-5 rating
analyzedAt (DATE)
totalWords (INTEGER)
totalSentences (INTEGER)
```

Register in `Database.js` `buildModels()`.

### Ollama style summary

Prompt v1:
```
You are a literary analyst. Given these writing metrics for a book, write a 2-3 sentence style summary describing what the reading experience feels like. Do not repeat the numbers.

Book: "{title}" by {author}

Metrics:
- Average sentence length: {N} words
- Vocabulary richness: {N} (0-1, higher = more diverse)
- Dialogue: {N}% of text
- Average paragraph: {N} words
- Pacing variation: {N} (higher = more varied)
- Descriptive density: {N}
- Most distinctive words: {words}
```

### A/B testing

Store prompt variants in `/config/fingerprint-prompts.json`:
```json
{ "current": "v1", "variants": { "v1": "...", "v2": "..." } }
```

- `styleSummaryPromptVersion` records which variant generated the summary
- "Regenerate" button on UI lets Eric try a different variant
- `styleSummaryRating` (1-5) records Eric's assessment
- Manual process, not automated — Eric compares and rates

### Similarity scoring

Cosine distance between 7-dim normalized vectors.

Normalization: min-max across all fingerprinted books. Store raw values in columns, compute normalized vectors on-the-fly (or recompute batch when new books are added).

"Books like this": load all fingerprints, compute cosine similarity against target, return top 5.

### Server endpoints

Add to `Server.js`:

```
POST /api/items/:id/fingerprint        — trigger analysis
GET  /api/items/:id/fingerprint        — get fingerprint
GET  /api/items/:id/similar            — get similar books (top 5)
POST /api/items/:id/fingerprint/summary — (re)generate Ollama summary
PATCH /api/items/:id/fingerprint/rating — save Eric's rating
```

### Trigger

Manual button on book detail page. Not on import (too slow). Optional "Analyze All" batch button later.

### UI

`client/pages/item/_id/index.vue` — add "Book DNA" section:

- "Analyze" button (if no fingerprint)
- Style summary paragraph (if generated)
- Metric bars (7 horizontal bars with labels)
- Distinctive words (tag cloud or comma list)
- "Books like this" list with cover thumbnails and similarity percentage
- "Regenerate summary" button with model/variant selector
- Rating (1-5 stars or simple number input)

### Files
- **NEW:** `server/models/BookFingerprint.js`
- **NEW:** `server/utils/bookFingerprint.js`
- **NEW:** `server/utils/epubTextExtractor.js`
- `server/Server.js` — endpoints
- `server/Database.js` — register model
- `client/pages/item/_id/index.vue` — Book DNA UI
- `package.json` — add `jszip`, `fast-xml-parser`

### TF-IDF note

Distinctive words require IDF across the library. When a new book is fingerprinted, IDF for all books becomes slightly stale. Accept staleness or recompute batch when requested.

### Test
- Analyze a book, verify metrics are reasonable.
- Generate style summary, verify it reads naturally.
- Analyze 3+ books, verify "similar books" ranking makes sense.
- Rate summaries, regenerate with different prompts, compare.

---

## Cross-feature dependencies

- Features 1 and 2 are fully independent.
- Feature 3 is independent but shares click-handling surface with TTS. `mouseup` on selection avoids conflict.
- Feature 4 is independent but reuses Ollama proxy endpoints.
- Features 3 and 4 both add server endpoints to `Server.js` (same section). Build sequentially to avoid merge conflicts.
- Features 3 and 4 both add npm dependencies. One Docker rebuild covers both if built together.
- Only Feature 4 requires a database migration (new table).

## Risk areas

1. **WordNet schema varies by source** — test the SQL query against the actual downloaded file.
2. **`better-sqlite3` native compilation** — Docker Dockerfile already has build tools. Verify by checking if other native modules exist in `package.json`.
3. **epub.js doesn't work in Node** — Feature 4 text extraction must use `jszip` + XML parsing, not epub.js.
4. **TF-IDF staleness** — distinctive words for old books become stale when new books are added. Acceptable for a personal library.
5. **Cosine similarity normalization** — min-max scaling changes when new books are added. Recompute on-the-fly or accept drift.
6. **`flattenChapters()` is dead code** — must be called explicitly for Feature 2 to work.
