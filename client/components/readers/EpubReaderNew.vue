<template>
  <div id="epub-reader" class="h-full w-full">
    <div class="h-full flex items-center justify-center">
      <button type="button" aria-label="Previous page" class="w-24 max-w-24 h-full hidden sm:flex items-center overflow-x-hidden justify-center opacity-50 hover:opacity-100">
        <span v-if="hasPrev" class="material-symbols text-6xl" @mousedown.prevent @click="prev">chevron_left</span>
      </button>
      <div id="frame" class="w-full" style="height: 80%">
        <div id="epub-content" ref="epubContent" style="width: 100%; height: 100%; overflow: auto; position: relative;"></div>
      </div>
      <button type="button" aria-label="Next page" class="w-24 max-w-24 h-full hidden sm:flex items-center justify-center overflow-x-hidden opacity-50 hover:opacity-100">
        <span v-if="hasNext" class="material-symbols text-6xl" @mousedown.prevent @click="next">chevron_right</span>
      </button>
    </div>
  </div>
</template>

<script>
import ePub from 'epubjs'
import EpubRenderer from '../../lib/epub-renderer/EpubRenderer'

export default {
  props: {
    libraryItem: {
      type: Object,
      default: () => ({})
    },
    playerOpen: Boolean,
    keepProgress: Boolean,
    fileId: String
  },
  data() {
    return {
      windowWidth: 0,
      windowHeight: 0,
      /** @type {ePub.Book} */
      book: null,
      /** @type {EpubRenderer} */
      renderer: null,
      initialPositioning: false,
      chapters: [],
      sessionStartTime: null,
      sessionStartPct: 0,
      lastPageTurnTime: null,
      pageTurns: 0,
      ebookBookmarks: [],
      ereaderSettings: {
        theme: 'dark',
        font: 'serif',
        fontScale: 100,
        lineSpacing: 115,
        spread: 'auto',
        textStroke: 0,
        maxWidth: 70,
        textAlign: 'justify'
      },
      // Current position state
      _currentCfi: null,
      _currentHref: null,
      _currentPct: 0,
      // TTS click handler references
      _ttsClickHandler: null,
      _ttsMouseDown: null
    }
  },
  watch: {
    playerOpen() {
      this.resize()
    }
  },
  computed: {
    libraryItemId() {
      return this.libraryItem?.id
    },
    allowScriptedContent() {
      return this.$store.getters['libraries/getLibraryEpubsAllowScriptedContent']
    },
    hasPrev() {
      if (!this.renderer) return false
      if (this.renderer.mode === 'paginated') {
        return this.renderer.currentPage > 0
      }
      return this.$refs.epubContent?.scrollTop > 0
    },
    hasNext() {
      if (!this.renderer) return false
      if (this.renderer.mode === 'paginated') {
        return this.renderer.currentPage < this.renderer.totalPages - 1
      }
      const el = this.$refs.epubContent
      if (!el) return false
      return el.scrollTop + el.clientHeight < el.scrollHeight - 10
    },
    userMediaProgress() {
      if (!this.libraryItemId) return
      return this.$store.getters['user/getUserMediaProgress'](this.libraryItemId)
    },
    savedEbookLocation() {
      if (!this.keepProgress) return null
      if (!this.userMediaProgress?.ebookLocation) return null
      const loc = this.userMediaProgress.ebookLocation
      if (typeof loc === 'string' && loc.startsWith('epubcfi')) return loc
      if (typeof loc === 'string') {
        try {
          const parsed = JSON.parse(loc)
          if (parsed.href) return parsed.href
        } catch (e) {}
      }
      if (typeof loc === 'object' && loc.href) return loc.href
      return null
    },
    savedEbookProgress() {
      if (!this.keepProgress) return null
      return this.userMediaProgress?.ebookProgress || null
    },
    localStorageLocationsKey() {
      return `ebookLocations-${this.libraryItemId}`
    },
    readerWidth() {
      const el = document.getElementById('epub-reader')
      if (el) return el.clientWidth
      if (this.windowWidth < 640) return this.windowWidth
      return this.windowWidth - 200
    },
    readerHeight() {
      if (this.windowHeight < 400 || !this.playerOpen) return this.windowHeight
      return this.windowHeight - 164
    },
    ebookUrl() {
      if (this.fileId) {
        return `/api/items/${this.libraryItemId}/ebook/${this.fileId}`
      }
      return `/api/items/${this.libraryItemId}/ebook`
    },
    /**
     * Compatibility shim — Reader.vue accesses this.rendition.getContents()
     * and this.rendition.location for chat context.
     */
    rendition() {
      const self = this
      return {
        getContents() {
          if (!self.renderer) return []
          // Return objects matching epub.js Contents interface
          return self.renderer.loadedSections.map((data) => ({
            document: self.$refs.epubContent,
            content: { ownerDocument: self.$refs.epubContent },
            sectionIndex: data.spineIndex
          }))
        },
        get location() {
          return {
            start: { href: self._currentHref, cfi: self._currentCfi },
            end: { percentage: self._currentPct }
          }
        }
      }
    }
  },
  methods: {
    updateSettings(settings) {
      const oldSettings = this.ereaderSettings
      this.ereaderSettings = settings

      if (!this.renderer) return

      // If layout mode changed, re-render
      const wasContin = oldSettings.spread === 'continuous'
      const isContin = settings.spread === 'continuous'
      if (wasContin !== isContin) {
        this.renderer.mode = isContin ? 'continuous' : 'paginated'
        this.renderer.render().then(() => {
          this._applySettings(settings)
          this._restorePosition()
        })
        return
      }

      this._applySettings(settings)
    },
    _applySettings(settings) {
      if (!this.renderer) return
      this.renderer.themeManager.applyAll({
        theme: settings.theme,
        font: settings.font,
        fontScale: settings.fontScale,
        lineSpacing: settings.lineSpacing,
        textAlign: settings.textAlign,
        maxWidth: settings.maxWidth
      })
    },
    prev() {
      if (!this.renderer) return
      this.initialPositioning = false
      this.renderer.prev()
      this._onPositionChanged()
    },
    next() {
      if (!this.renderer) return
      this.initialPositioning = false
      this.renderer.next()
      this._onPositionChanged()
    },
    goToChapter(href) {
      if (!this.renderer) return
      this.initialPositioning = false
      this.renderer.scrollToSection(href)
      this._onPositionChanged()
    },
    goToBookmark(cfi) {
      if (!this.renderer) return
      this.initialPositioning = false
      this._scrollToCfi(cfi)
      this._onPositionChanged()
    },
    findChapterFromPosition(chapters, position) {
      let foundChapter
      for (let i = 0; i < chapters.length; i++) {
        if (position >= chapters[i].start && (!chapters[i + 1] || position < chapters[i + 1].start)) {
          foundChapter = chapters[i]
          if (chapters[i].subitems && chapters[i].subitems.length > 0) {
            return this.findChapterFromPosition(chapters[i].subitems, position, foundChapter)
          }
          break
        }
      }
      return foundChapter
    },
    async searchBook(query) {
      const chapters = structuredClone(await this.chapters)
      const searchResults = await Promise.all(
        this.book.spine.spineItems.map((item) =>
          item.load(this.book.load.bind(this.book))
            .then(item.find.bind(item, query))
            .finally(item.unload.bind(item))
        )
      )
      const mergedResults = [].concat(...searchResults)

      mergedResults.forEach((chapter) => {
        chapter.start = this.book.locations.percentageFromCfi(chapter.cfi)
        const foundChapter = this.findChapterFromPosition(chapters, chapter.start)
        if (foundChapter) foundChapter.searchResults.push(chapter)
      })

      return chapters.filter(function f(o) {
        if (o.searchResults.length) return true
        if (o.subitems.length) {
          return (o.subitems = o.subitems.filter(f)).length
        }
      })
    },
    keyUp(e) {
      const rtl = this.book?.package?.metadata?.direction === 'rtl'
      if ((e.keyCode || e.which) === 37) {
        return rtl ? this.next() : this.prev()
      } else if ((e.keyCode || e.which) === 39) {
        return rtl ? this.prev() : this.next()
      }
    },
    updateProgress(payload) {
      if (!this.keepProgress) return
      this.$axios.$patch(`/api/me/progress/${this.libraryItemId}`, payload, { progress: false }).catch((error) => {
        console.error('EpubReader.updateProgress failed:', error)
      })
    },

    // ── Position tracking ──

    _onPositionChanged() {
      if (!this.renderer || !this.book) return

      // Find first visible element and generate CFI
      const el = this.renderer.getFirstVisibleParagraphIndex
        ? this._findFirstVisibleEl()
        : null

      if (!el) return

      const spineIndex = this.renderer.getSpineIndexForElement(el)
      const sectionData = this.renderer.getSection(spineIndex)
      if (!sectionData?.section) return

      try {
        const cfi = sectionData.section.cfiFromElement(el)
        if (!cfi) return
        const pct = this.book.locations.percentageFromCfi(cfi) || 0
        const position = this.book.locations.locationFromCfi(cfi) || 0
        const total = this.book.locations.total || 0
        const chapter = this.findChapterFromPosition(this.chapters, pct)

        this._currentCfi = cfi
        this._currentPct = pct
        this._currentHref = sectionData.href

        // Reading stats
        const now = Date.now()
        if (!this.sessionStartTime) {
          this.sessionStartTime = now
          this.sessionStartPct = pct
        }
        if (!this.initialPositioning) {
          this.pageTurns++
          this.lastPageTurnTime = now
        }
        const sessionMinutes = Math.round((now - this.sessionStartTime) / 60000)
        const pctRead = pct - this.sessionStartPct
        const pctRemaining = 1 - pct
        let etaMinutes = null
        if (pctRead > 0.005 && sessionMinutes > 0) {
          etaMinutes = Math.round(pctRemaining / (pctRead / sessionMinutes))
        }

        this.$emit('reading-status', {
          percentage: pct,
          chapter: chapter?.title || '',
          location: position,
          totalLocations: total,
          sessionMinutes,
          etaMinutes,
          currentCfi: cfi
        })

        if (this.initialPositioning) return
        if (this.savedEbookLocation === cfi) return

        this.updateProgress({
          ebookLocation: cfi,
          ebookProgress: pct || undefined
        })
      } catch (e) {
        // CFI generation can fail for some elements
      }
    },

    _findFirstVisibleEl() {
      const container = this.$refs.epubContent
      if (!container) return null
      const containerRect = container.getBoundingClientRect()
      const els = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote')
      for (const el of els) {
        const rect = el.getBoundingClientRect()
        if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
          return el
        }
      }
      return null
    },

    _scrollToCfi(cfi) {
      if (!this.book || !this.renderer) return
      // Parse the CFI to find which spine item and element
      try {
        // Use book.spine to find the section from CFI
        // CFI format: epubcfi(/6/<spinePos>!/...)
        const match = cfi.match(/\/6\/(\d+)/)
        if (!match) return
        const spinePos = parseInt(match[1])
        // epub CFI spine positions are 1-based and even-numbered
        const spineIndex = (spinePos / 2) - 1

        const sectionEl = this.$refs.epubContent?.querySelector(`[data-spine-index="${spineIndex}"]`)
        if (sectionEl) {
          // Try to find the exact element using the section's CFI resolver
          const sectionData = this.renderer.getSection(spineIndex)
          if (sectionData?.section?.document) {
            // For now, scroll to the section start
            this.renderer.scrollToElement(sectionEl)
          } else {
            this.renderer.scrollToElement(sectionEl)
          }
        }
      } catch (e) {
        console.warn('_scrollToCfi failed:', e)
      }
    },

    // ── Location caching (unchanged from old reader) ──

    getAllEbookLocationData() {
      const locations = []
      let totalSize = 0
      for (const key in localStorage) {
        if (!localStorage.hasOwnProperty(key) || !key.startsWith('ebookLocations-')) continue
        try {
          const ebookLocations = JSON.parse(localStorage[key])
          if (!ebookLocations.locations) throw new Error('Invalid locations object')
          ebookLocations.key = key
          ebookLocations.size = (localStorage[key].length + key.length) * 2
          locations.push(ebookLocations)
          totalSize += ebookLocations.size
        } catch (error) {
          console.error('Failed to parse ebook locations', key, error)
          localStorage.removeItem(key)
        }
      }
      locations.sort((a, b) => a.lastAccessed - b.lastAccessed)
      return { locations, totalSize }
    },
    checkSaveLocations(locationString) {
      const maxSizeInBytes = 3000000
      const newLocationsSize = JSON.stringify({ lastAccessed: Date.now(), locations: locationString }).length * 2
      if (newLocationsSize > maxSizeInBytes) return
      const ebookLocationsData = this.getAllEbookLocationData()
      let availableSpace = maxSizeInBytes - ebookLocationsData.totalSize
      while (availableSpace < newLocationsSize && ebookLocationsData.locations.length) {
        const oldestLocation = ebookLocationsData.locations.shift()
        availableSpace += oldestLocation.size
        localStorage.removeItem(oldestLocation.key)
      }
      this.saveLocations(locationString)
    },
    saveLocations(locationString) {
      localStorage.setItem(this.localStorageLocationsKey, JSON.stringify({
        lastAccessed: Date.now(),
        locations: locationString
      }))
    },
    loadLocations() {
      const locationsObjString = localStorage.getItem(this.localStorageLocationsKey)
      if (!locationsObjString) return null
      const locationsObject = JSON.parse(locationsObjString)
      if (!locationsObject.locations) {
        localStorage.removeItem(this.localStorageLocationsKey)
        return null
      }
      this.saveLocations(locationsObject.locations)
      return locationsObject.locations
    },

    // ── Bookmarks ──

    loadBookmarks() {
      try {
        const data = localStorage.getItem(`ebookBookmarks-${this.libraryItemId}`)
        this.ebookBookmarks = data ? JSON.parse(data) : []
      } catch (e) {
        this.ebookBookmarks = []
      }
    },
    saveBookmarks() {
      localStorage.setItem(`ebookBookmarks-${this.libraryItemId}`, JSON.stringify(this.ebookBookmarks))
      this.$emit('bookmarks-updated', this.ebookBookmarks)
    },
    addBookmark(cfi, label) {
      if (!cfi) return
      if (this.ebookBookmarks.find(b => b.cfi === cfi)) return
      const pct = this.book?.locations?.percentageFromCfi(cfi)
      const chapter = this.findChapterFromPosition(this.chapters, pct)
      this.ebookBookmarks.push({
        cfi,
        percentage: pct,
        chapter: chapter?.title || '',
        label: label || `${Math.round((pct || 0) * 100)}% — ${chapter?.title || 'Unknown'}`,
        created: Date.now()
      })
      this.ebookBookmarks.sort((a, b) => (a.percentage || 0) - (b.percentage || 0))
      this.saveBookmarks()
    },
    removeBookmark(cfi) {
      this.ebookBookmarks = this.ebookBookmarks.filter(b => b.cfi !== cfi)
      this.saveBookmarks()
    },

    // ── TTS methods ──

    getTtsParagraphs() {
      if (!this.renderer) return []
      return this.renderer.getTtsParagraphs()
    },
    getFirstVisibleParagraphIndex(paragraphs) {
      if (!paragraphs.length || !this.renderer) return 0
      return this.renderer.getFirstVisibleParagraphIndex(paragraphs)
    },
    ttsHighlight(el) {
      this.ttsClearHighlight()
      if (!el) return
      el.setAttribute('data-tts-active', 'true')
      el.style.setProperty('outline', '2px solid rgba(59, 130, 246, 0.5)', 'important')
      el.style.setProperty('outline-offset', '2px', 'important')
      el.style.setProperty('background-color', 'rgba(59, 130, 246, 0.08)', 'important')

      // Scroll into view if off-screen — direct DOM, no iframes
      this.renderer?.scrollToElement(el)
    },
    ttsClearHighlight() {
      const container = this.$refs.epubContent
      if (!container) return
      const active = container.querySelectorAll('[data-tts-active]')
      active.forEach((el) => {
        el.removeAttribute('data-tts-active')
        el.style.removeProperty('outline')
        el.style.removeProperty('outline-offset')
        el.style.removeProperty('background-color')
      })
    },
    ttsSaveProgress(el) {
      if (!this.keepProgress || !el || !this.book || !this.renderer) return
      try {
        const spineIndex = this.renderer.getSpineIndexForElement(el)
        const sectionData = this.renderer.getSection(spineIndex)
        if (!sectionData?.section) return
        const cfi = sectionData.section.cfiFromElement(el)
        if (!cfi) return
        const pct = this.book.locations.percentageFromCfi(cfi)
        this.updateProgress({
          ebookLocation: cfi,
          ebookProgress: pct || undefined
        })
      } catch (e) {
        console.error('ttsSaveProgress failed:', e)
      }
    },
    ttsInstallClickHandlers() {
      const container = this.$refs.epubContent
      if (!container) return

      // Remove old handlers
      this.ttsRemoveClickHandlers()

      let downX = 0, downY = 0
      this._ttsMouseDown = (e) => { downX = e.clientX; downY = e.clientY }
      this._ttsClickHandler = (e) => {
        const dist = Math.sqrt((e.clientX - downX) ** 2 + (e.clientY - downY) ** 2)
        if (dist > 5) return
        let target = e.target
        const tags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'])
        while (target && target !== container) {
          if (tags.has(target.tagName)) {
            const paragraphs = this.getTtsParagraphs()
            const idx = paragraphs.findIndex(p => p.el === target)
            if (idx >= 0) {
              this.$emit('tts-start-from', idx)
            }
            return
          }
          target = target.parentElement
        }
      }
      container.addEventListener('mousedown', this._ttsMouseDown)
      container.addEventListener('click', this._ttsClickHandler)
    },
    ttsRemoveClickHandlers() {
      const container = this.$refs.epubContent
      if (!container) return
      if (this._ttsClickHandler) {
        container.removeEventListener('click', this._ttsClickHandler)
        this._ttsClickHandler = null
      }
      if (this._ttsMouseDown) {
        container.removeEventListener('mousedown', this._ttsMouseDown)
        this._ttsMouseDown = null
      }
    },
    async getTtsChapterParagraphs() {
      if (!this._currentHref || !this.book) return []
      try {
        const item = this.book.spine.get(this._currentHref)
        if (!item) return []
        await item.load(this.book.load.bind(this.book))
        const doc = item.document
        if (!doc?.body) { item.unload(); return [] }
        const els = doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote')
        const texts = []
        els.forEach((el) => {
          const text = (el.innerText || el.textContent || '').trim()
          if (text.length > 0) texts.push(text)
        })
        item.unload()
        return texts
      } catch (e) {
        console.error('getTtsChapterParagraphs failed:', e)
        return []
      }
    },

    // ── Resize ──

    resize() {
      this.windowWidth = window.innerWidth
      this.windowHeight = window.innerHeight
      if (!this.renderer) return

      const el = document.getElementById('epub-reader')
      const width = el ? el.clientWidth : this.readerWidth
      const widthPct = (this.ereaderSettings.maxWidth || 70) / 100
      const newWidth = Math.round(width * widthPct)
      const newHeight = this.readerHeight * 0.8

      this.renderer.resize(newWidth, newHeight)
      this.$emit('reflowed')
    },

    // ── Chapters ──

    getChapters() {
      if (!this.book?.packaging) return Promise.resolve()
      const toc = this.book?.navigation?.toc || []
      const tocTree = []

      const resolveURL = (url, relativeTo) => {
        const base = 'https://example.invalid/'
        return new URL(url, base + relativeTo).href.replace(base, '')
      }

      const basePath = this.book.packaging.navPath || this.book.packaging.ncxPath

      const createTree = async (toc, parent) => {
        const promises = toc.map(async (tocItem, i) => {
          const href = resolveURL(tocItem.href, basePath)
          const id = href.split('#')[1]
          const item = this.book.spine.get(href)
          await item.load(this.book.load.bind(this.book))
          const el = id ? item.document.getElementById(id) : item.document.body

          const cfi = item.cfiFromElement(el)

          parent[i] = {
            title: tocItem.label.trim(),
            subitems: [],
            href,
            cfi,
            start: this.book.locations.percentageFromCfi(cfi),
            end: null,
            id: null,
            searchResults: []
          }

          if (tocItem.subitems) {
            await createTree(tocItem.subitems, parent[i].subitems)
          }
        })
        await Promise.all(promises)
      }
      return createTree(toc, tocTree).then(() => {
        this.chapters = tocTree
      })
    },

    flattenChapters(chapters) {
      const unwrap = (chapters) => {
        return chapters.reduce((acc, chapter) => {
          return chapter.subitems ? [...acc, chapter, ...unwrap(chapter.subitems)] : [...acc, chapter]
        }, [])
      }
      let flattenedChapters = unwrap(chapters)
      flattenedChapters = flattenedChapters.sort((a, b) => a.start - b.start)
      for (let i = 0; i < flattenedChapters.length; i++) {
        flattenedChapters[i].id = i
        if (i < flattenedChapters.length - 1) {
          flattenedChapters[i].end = flattenedChapters[i + 1].start
        } else {
          flattenedChapters[i].end = 1
        }
      }
      return flattenedChapters
    },

    // ── Theme (web font injection for the container) ──

    _injectWebFonts() {
      const container = this.$refs.epubContent
      if (!container || container.querySelector('#abs-custom-fonts')) return
      const link = document.createElement('link')
      link.id = 'abs-custom-fonts'
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,200..900&display=swap'
      container.appendChild(link)
    },

    // ── Position restoration ──

    _restorePosition() {
      const targetProgress = this.savedEbookProgress
      if (targetProgress) {
        const cfi = this.book.locations.cfiFromPercentage(targetProgress)
        if (cfi) this._scrollToCfi(cfi)
      } else if (this.savedEbookLocation) {
        this._scrollToCfi(this.savedEbookLocation)
      }

      // Emit initial reading status
      this.$nextTick(() => {
        this._onPositionChanged()
        this.initialPositioning = false
      })
    },

    // ── Initialization ──

    initEpub() {
      const reader = this

      const customRequest = async (url) => {
        try {
          return this.$axios.$get(url, { responseType: 'arraybuffer' })
        } catch (error) {
          console.error('EpubReader.initEpub customRequest failed:', error)
          throw error
        }
      }

      reader.book = new ePub(reader.ebookUrl, {
        width: this.readerWidth,
        height: this.readerHeight - 50,
        openAs: 'epub',
        requestMethod: customRequest
      })

      const targetProgress = this.savedEbookProgress
      if (targetProgress) this.initialPositioning = true

      reader.book.ready
        .then(async () => {
          // Load or generate location map
          const savedLocations = this.loadLocations()
          if (savedLocations) {
            reader.book.locations.load(savedLocations)
          } else {
            await reader.book.locations.generate()
            this.checkSaveLocations(reader.book.locations.save())
          }

          // Create renderer
          const isContinuous = this.ereaderSettings.spread === 'continuous'
          const container = this.$refs.epubContent

          reader.renderer = new EpubRenderer(container, reader.book, {
            mode: isContinuous ? 'continuous' : 'paginated',
            allowScriptedContent: this.allowScriptedContent
          })

          // Render content
          console.log('[EpubReaderNew] Rendering with custom renderer, mode:', reader.renderer.mode)
          await reader.renderer.render()
          console.log('[EpubReaderNew] Rendered', reader.renderer.loadedSections.length, 'sections')

          // Apply theme and settings
          this._applySettings(this.ereaderSettings)
          this._injectWebFonts()

          // Set up scroll-based position tracking
          container.addEventListener('scroll', () => {
            clearTimeout(this._scrollTimer)
            this._scrollTimer = setTimeout(() => {
              if (!this.initialPositioning) {
                this._onPositionChanged()
              }
            }, 250)
          })

          // Keyboard navigation
          document.addEventListener('keydown', this.keyUp)

          // Touch events
          container.addEventListener('touchstart', (e) => this.$emit('touchstart', e))
          container.addEventListener('touchend', (e) => this.$emit('touchend', e))

          // Load chapters and bookmarks
          await this.getChapters()
          this.loadBookmarks()
          this.$emit('bookmarks-updated', this.ebookBookmarks)

          // Restore position
          this._restorePosition()
        })
        .catch((error) => {
          console.error('EpubReader.initEpub failed:', error)
        })
    }
  },
  mounted() {
    this.windowWidth = window.innerWidth
    this.windowHeight = window.innerHeight
    window.addEventListener('resize', this.resize)
    this.initEpub()
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.resize)
    document.removeEventListener('keydown', this.keyUp)
    this.ttsRemoveClickHandlers()
    if (this.renderer) {
      this.renderer.destroy()
      this.renderer = null
    }
    this.book?.destroy()
  }
}
</script>
