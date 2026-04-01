# Epub Features v2

Four features for the epub reader. Each is independent — can be built and tested separately.

## 1. Bookmark preview

Hover a bookmark in the bookmarks panel to see a snippet of surrounding text instead of just "15% — Chapter 3". Show ~100 characters of the paragraph at that position.

**Approach:** When creating a bookmark, capture the visible paragraph text and store it alongside the CFI/percentage. Display in a tooltip on hover in the bookmarks panel.

**Files:** `Reader.vue` (bookmarks panel UI), `EpubReader.vue` (bookmark creation)

## 2. Chapter progress indicator

Thin progress bar per chapter in the TOC sidebar and/or at the top of the reading area. Shows how far through the current chapter you are, not just whole-book percentage.

**Approach:** Each chapter has a `start` and `end` percentage from the TOC. Current position percentage maps to progress within the current chapter: `(current - chapter.start) / (chapter.end - chapter.start)`.

**Files:** `Reader.vue` (TOC sidebar, status bar)

## 3. Vocabulary builder

Tap/click any word to see its definition inline. Auto-builds a per-book word list for review. Uses a local dictionary file — no external API calls.

**Approach:**
- Download a dictionary file (WordNet, wiktionary dump, or similar) and serve it from the server
- Server endpoint: `GET /api/dictionary/:word` returns definition
- Client: click handler on word elements, popover with definition, "save" button adds to per-book vocab list
- Vocab list stored in localStorage or server-side per user/book
- Review page accessible from the book detail or reader UI

**Dictionary options:**
- WordNet (Princeton) — ~30MB SQLite, well-structured, public domain
- English Wiktionary dump — larger but more complete, CC-BY-SA
- GCIDE (GNU Collaborative International Dictionary of English) — public domain

WordNet is the best fit: small, structured, easy to query, good definitions.

**Files:** New server endpoint, new client component (word popover), `EpubReader.vue` (click handler)

## 4. Book DNA fingerprinting

Analyze writing style of books in the library and find similar reads based on actual textual properties, not genre tags.

**Metrics to extract:**
- Average sentence length (words)
- Vocabulary density (unique words / total words)
- Dialogue ratio (quoted text / total text)
- Paragraph length distribution
- Pacing curve (action verb density per chapter)
- Descriptive density (adjective/adverb ratio)
- Top distinctive words (TF-IDF against the library)

**Approach:**
- Server-side analysis job triggered per book (on import or manual)
- Store fingerprint as JSON in the book's metadata or a separate table
- Ollama can generate a natural-language style summary from the metrics
- Similarity scoring: cosine distance between fingerprint vectors
- A/B test the prompt, approach, and model with Eric's feedback for quality
- "Books like this" section on the book detail page

**Storage:** New `bookFingerprint` model/table, or JSON field on the book model.

**Files:** New server endpoint, analysis worker, book detail page UI

## Build order

1. **Bookmark preview** — smallest scope, immediate UX win
2. **Chapter progress indicator** — small scope, touches existing UI
3. **Vocabulary builder** — medium scope, new server endpoint + dictionary setup
4. **Book DNA fingerprinting** — largest scope, needs analysis pipeline + Ollama integration + A/B testing framework

## Status

- [ ] Bookmark preview
- [ ] Chapter progress indicator
- [ ] Vocabulary builder
- [ ] Book DNA fingerprinting
