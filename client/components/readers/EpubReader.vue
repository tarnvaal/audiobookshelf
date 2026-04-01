<template>
  <div id="epub-reader" class="h-full w-full">
    <div class="h-full flex items-center justify-center">
      <button type="button" aria-label="Previous page" class="w-24 max-w-24 h-full hidden sm:flex items-center overflow-x-hidden justify-center opacity-50 hover:opacity-100">
        <span v-if="hasPrev" class="material-symbols text-6xl" @mousedown.prevent @click="prev">chevron_left</span>
      </button>
      <div id="frame" class="w-full" style="height: 80%">
        <div id="viewer"></div>
      </div>
      <button type="button" aria-label="Next page" class="w-24 max-w-24 h-full hidden sm:flex items-center justify-center overflow-x-hidden opacity-50 hover:opacity-100">
        <span v-if="hasNext" class="material-symbols text-6xl" @mousedown.prevent @click="next">chevron_right</span>
      </button>
    </div>
  </div>
</template>

<script>
import ePub from 'epubjs'

/**
 * @typedef {object} EpubReader
 * @property {ePub.Book} book
 * @property {ePub.Rendition} rendition
 */
export default {
  props: {
    libraryItem: {
      type: Object,
      default: () => {}
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
      /** @type {ePub.Rendition} */
      rendition: null,
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
      }
    }
  },
  watch: {
    playerOpen() {
      this.resize()
    }
  },
  computed: {
    /** @returns {string} */
    libraryItemId() {
      return this.libraryItem?.id
    },
    allowScriptedContent() {
      return this.$store.getters['libraries/getLibraryEpubsAllowScriptedContent']
    },
    hasPrev() {
      return !this.rendition?.location?.atStart
    },
    hasNext() {
      return !this.rendition?.location?.atEnd
    },
    userMediaProgress() {
      if (!this.libraryItemId) return
      return this.$store.getters['user/getUserMediaProgress'](this.libraryItemId)
    },
    savedEbookLocation() {
      if (!this.keepProgress) return null
      if (!this.userMediaProgress?.ebookLocation) return null
      const loc = this.userMediaProgress.ebookLocation
      // Handle CFI string (from web client)
      if (typeof loc === 'string' && loc.startsWith('epubcfi')) return loc
      // Handle JSON location object (from mobile app) — extract href for navigation
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
      // Use actual container width instead of window width
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
    themeRules() {
      const theme = this.ereaderSettings.theme
      const isDark = theme === 'dark'
      const isSepia = theme === 'sepia'

      const fontColor = isDark
        ? '#fff'
        : isSepia
        ? '#5b4636'
        : '#000'

      const backgroundColor = isDark
        ? 'rgb(35 35 35)'
        : isSepia
        ? 'rgb(244, 236, 216)'
        : 'rgb(255, 255, 255)'

      const lineSpacing = this.ereaderSettings.lineSpacing / 100
      const fontScale   = this.ereaderSettings.fontScale   / 100
      const textStroke  = this.ereaderSettings.textStroke  / 100

      const textAlign = this.ereaderSettings.textAlign || 'justify'

      return {
        '*': {
          color: `${fontColor}!important`,
          'background-color': `${backgroundColor}!important`,
          'line-height': `${lineSpacing * fontScale}rem!important`,
          '-webkit-text-stroke': `${textStroke}px ${fontColor}!important`
        },
        'p, div, li, td, th, dd, dt, blockquote, figcaption': {
          'text-align': `${textAlign}!important`,
          'hyphens': textAlign === 'justify' ? 'auto!important' : 'none!important',
          '-webkit-hyphens': textAlign === 'justify' ? 'auto!important' : 'none!important'
        },
        a: {
          color: `${fontColor}!important`
        }
      }
    }
  },
  methods: {
    updateSettings(settings) {
      const oldSettings = this.ereaderSettings
      this.ereaderSettings = settings

      if (!this.rendition) return

      // If layout mode changed, recreate the rendition entirely
      const wasContin = oldSettings.spread === 'continuous'
      const isContin = settings.spread === 'continuous'
      if (wasContin !== isContin) {
        this.recreateRendition()
        return
      }

      this.applyTheme()

      const fontScale = settings.fontScale || 100
      this.rendition.themes.fontSize(`${fontScale}%`)
      this.rendition.themes.font(settings.font)

      if (!isContin) {
        this.rendition.spread(settings.spread || 'auto')
      }

      // Resize rendition to respect column width setting
      const widthPct = (settings.maxWidth || 70) / 100
      this.rendition.resize(Math.round(this.readerWidth * widthPct), this.readerHeight * 0.8)
    },
    recreateRendition() {
      if (!this.book || !this.rendition) return

      // Save current location before destroying
      const currentLocation = this.rendition.location?.start?.cfi

      // Destroy old rendition
      this.rendition.destroy()

      // Clear the viewer container
      const viewer = document.getElementById('viewer')
      if (viewer) viewer.innerHTML = ''

      // Create new rendition with correct settings
      const widthPct = (this.ereaderSettings.maxWidth || 70) / 100
      const isContinuous = this.ereaderSettings.spread === 'continuous'
      this.rendition = this.book.renderTo('viewer', {
        width: Math.round(this.readerWidth * widthPct),
        height: this.readerHeight * 0.8,
        allowScriptedContent: this.allowScriptedContent,
        spread: isContinuous ? 'none' : (this.ereaderSettings.spread || 'auto'),
        snap: !isContinuous,
        manager: 'continuous',
        flow: isContinuous ? 'scrolled-doc' : 'paginated'
      })

      // Reapply settings
      const fontScale = this.ereaderSettings.fontScale || 100
      this.rendition.themes.fontSize(`${fontScale}%`)
      this.rendition.themes.font(this.ereaderSettings.font)

      this.rendition.on('rendered', () => {
        this.applyTheme()
      })
      this.rendition.on('relocated', this.relocated)
      this.rendition.on('keydown', this.keyUp)
      this.rendition.on('touchstart', (event) => { this.$emit('touchstart', event) })
      this.rendition.on('touchend', (event) => { this.$emit('touchend', event) })

      // Navigate to where we were, then patch the manager
      this.rendition.display(currentLocation || this.book.locations.start).then(() => {
        this.patchContinuousManager()
      })
    },
    prev() {
      if (!this.rendition?.manager) return
      this.initialPositioning = false
      return this.rendition?.prev()
    },
    next() {
      if (!this.rendition?.manager) return
      this.initialPositioning = false
      return this.rendition?.next()
    },
    goToChapter(href) {
      if (!this.rendition?.manager) return
      this.initialPositioning = false
      return this.rendition?.display(href)
    },
    /** @returns {object} Returns the chapter that the `position` in the book is in */
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
    /** @returns {Array} Returns an array of chapters that only includes chapters with query results */
    async searchBook(query) {
      const chapters = structuredClone(await this.chapters)
      const searchResults = await Promise.all(this.book.spine.spineItems.map((item) => item.load(this.book.load.bind(this.book)).then(item.find.bind(item, query)).finally(item.unload.bind(item))))
      const mergedResults = [].concat(...searchResults)

      mergedResults.forEach((chapter) => {
        chapter.start = this.book.locations.percentageFromCfi(chapter.cfi)
        const foundChapter = this.findChapterFromPosition(chapters, chapter.start)
        if (foundChapter) foundChapter.searchResults.push(chapter)
      })

      let filteredResults = chapters.filter(function f(o) {
        if (o.searchResults.length) return true
        if (o.subitems.length) {
          return (o.subitems = o.subitems.filter(f)).length
        }
      })
      return filteredResults
    },
    keyUp(e) {
      const rtl = this.book?.package?.metadata?.direction === 'rtl'
      if ((e.keyCode || e.which) == 37) {
        return rtl ? this.next() : this.prev()
      } else if ((e.keyCode || e.which) == 39) {
        return rtl ? this.prev() : this.next()
      }
    },
    /**
     * @param {object} payload
     * @param {string} payload.ebookLocation - CFI of the current location
     * @param {string} payload.ebookProgress - eBook Progress Percentage
     */
    updateProgress(payload) {
      if (!this.keepProgress) return
      this.$axios.$patch(`/api/me/progress/${this.libraryItemId}`, payload, { progress: false }).catch((error) => {
        console.error('EpubReader.updateProgress failed:', error)
      })
    },
    getAllEbookLocationData() {
      const locations = []
      let totalSize = 0 // Total in bytes

      for (const key in localStorage) {
        if (!localStorage.hasOwnProperty(key) || !key.startsWith('ebookLocations-')) {
          continue
        }

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

      // Sort by oldest lastAccessed first
      locations.sort((a, b) => a.lastAccessed - b.lastAccessed)

      return {
        locations,
        totalSize
      }
    },
    /** @param {string} locationString */
    checkSaveLocations(locationString) {
      const maxSizeInBytes = 3000000 // Allow epub locations to take up to 3MB of space
      const newLocationsSize = JSON.stringify({ lastAccessed: Date.now(), locations: locationString }).length * 2

      // Too large overall
      if (newLocationsSize > maxSizeInBytes) {
        console.error('Epub locations are too large to store. Size =', newLocationsSize)
        return
      }

      const ebookLocationsData = this.getAllEbookLocationData()

      let availableSpace = maxSizeInBytes - ebookLocationsData.totalSize

      // Remove epub locations until there is room for locations
      while (availableSpace < newLocationsSize && ebookLocationsData.locations.length) {
        const oldestLocation = ebookLocationsData.locations.shift()
        console.log(`Removing cached locations for epub "${oldestLocation.key}" taking up ${oldestLocation.size} bytes`)
        availableSpace += oldestLocation.size
        localStorage.removeItem(oldestLocation.key)
      }

      console.log(`Cacheing epub locations with key "${this.localStorageLocationsKey}" taking up ${newLocationsSize} bytes`)
      this.saveLocations(locationString)
    },
    /** @param {string} locationString */
    saveLocations(locationString) {
      localStorage.setItem(
        this.localStorageLocationsKey,
        JSON.stringify({
          lastAccessed: Date.now(),
          locations: locationString
        })
      )
    },
    loadLocations() {
      const locationsObjString = localStorage.getItem(this.localStorageLocationsKey)
      if (!locationsObjString) return null

      const locationsObject = JSON.parse(locationsObjString)

      // Remove invalid location objects
      if (!locationsObject.locations) {
        console.error('Invalid epub locations stored', this.localStorageLocationsKey)
        localStorage.removeItem(this.localStorageLocationsKey)
        return null
      }

      // Update lastAccessed
      this.saveLocations(locationsObject.locations)

      return locationsObject.locations
    },
    /** @param {string} location - CFI of the new location */
    relocated(location) {
      if (!this.book) return
      // During TTS playback, ttsSaveProgress handles progress — skip here
      // to avoid overwriting paragraph-level position with page-level position
      if (this._ttsNavigating) {
        this._ttsNavigating = false
        return
      }
      const pct = location.end?.percentage || 0
      const position = this.book.locations?.locationFromCfi(location.start.cfi)
      const total = this.book?.locations?.total || 0
      const chapter = this.findChapterFromPosition(this.chapters, pct)

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
      // Estimate time to finish based on current reading pace
      let etaMinutes = null
      if (pctRead > 0.005 && sessionMinutes > 0) {
        etaMinutes = Math.round(pctRemaining / (pctRead / sessionMinutes))
      }

      this.$emit('reading-status', {
        percentage: pct,
        chapter: chapter?.title || '',
        location: position || 0,
        totalLocations: total,
        sessionMinutes,
        etaMinutes,
        currentCfi: location.start.cfi
      })

      if (this.initialPositioning) return
      if (this.savedEbookLocation === location.start.cfi) {
        return
      }

      if (location.end.percentage) {
        this.updateProgress({
          ebookLocation: location.start.cfi,
          ebookProgress: location.end.percentage
        })
      } else {
        this.updateProgress({
          ebookLocation: location.start.cfi
        })
      }
    },
    initEpub() {
      /** @type {EpubReader} */
      const reader = this

      // Use axios to make request because we have token refresh logic in interceptor
      const customRequest = async (url) => {
        try {
          return this.$axios.$get(url, {
            responseType: 'arraybuffer'
          })
        } catch (error) {
          console.error('EpubReader.initEpub customRequest failed:', error)
          throw error
        }
      }

      /** @type {ePub.Book} */
      reader.book = new ePub(reader.ebookUrl, {
        width: this.readerWidth,
        height: this.readerHeight - 50,
        openAs: 'epub',
        requestMethod: customRequest
      })

      // Suppress relocated handler until user actually navigates (next/prev)
      const targetProgress = this.savedEbookProgress
      if (targetProgress) this.initialPositioning = true

      // Wait for the book to fully open before creating the rendition.
      // epubjs's renderTo accesses book.package internally; calling it
      // before book.ready resolves causes "this.book is undefined" errors.
      reader.book.ready
        .then(async () => {
          const widthPct = (this.ereaderSettings.maxWidth || 70) / 100
          const isContinuous = this.ereaderSettings.spread === 'continuous'
          reader.rendition = reader.book.renderTo('viewer', {
            width: Math.round(this.readerWidth * widthPct),
            height: this.readerHeight * 0.8,
            allowScriptedContent: this.allowScriptedContent,
            spread: isContinuous ? 'none' : (this.ereaderSettings.spread || 'auto'),
            snap: !isContinuous,
            manager: 'continuous',
            flow: isContinuous ? 'scrolled-doc' : 'paginated'
          })

          reader.rendition.on('rendered', () => {
            this.applyTheme()
          })
          reader.rendition.on('relocated', reader.relocated)
          reader.rendition.on('keydown', reader.keyUp)
          reader.rendition.on('touchstart', (event) => {
            this.$emit('touchstart', event)
          })
          reader.rendition.on('touchend', (event) => {
            this.$emit('touchend', event)
          })

          // Load or generate location map
          const savedLocations = this.loadLocations()
          if (savedLocations) {
            reader.book.locations.load(savedLocations)
          } else {
            await reader.book.locations.generate()
            this.checkSaveLocations(reader.book.locations.save())
          }

          // Navigate to saved position
          if (targetProgress) {
            const totalLocations = reader.book.locations.total
            const targetLoc = Math.ceil(totalLocations * targetProgress)
            const cfi = reader.book.locations.cfiFromPercentage(targetProgress)
            console.log(`[EpubReader] Resume: progress=${targetProgress}, totalLocations=${totalLocations}, targetLoc=${targetLoc}, cfi=${cfi}`)
            await reader.rendition.display(cfi || reader.book.locations.start)
          } else {
            await reader.rendition.display(this.savedEbookLocation || reader.book.locations.start)
          }
          // Patch manager now that display() has created it
          this.patchContinuousManager()
          this.getChapters()
        })
        .catch((error) => {
          console.error('EpubReader.initEpub failed:', error)
        })
    },
    getChapters() {
      if (!this.book?.packaging) return Promise.resolve()
      // Load the list of chapters in the book. See https://github.com/futurepress/epub.js/issues/759
      const toc = this.book?.navigation?.toc || []

      const tocTree = []

      const resolveURL = (url, relativeTo) => {
        // see https://github.com/futurepress/epub.js/issues/1084
        // HACK-ish: abuse the URL API a little to resolve the path
        // the base needs to be a valid URL, or it will throw a TypeError,
        // so we just set a random base URI and remove it later
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
            end: null, // set by flattenChapters()
            id: null, // set by flattenChapters()
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
      // Convert the nested epub chapters into something that looks like audiobook chapters for player-ui
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
    resize() {
      this.windowWidth = window.innerWidth
      this.windowHeight = window.innerHeight
      // Use actual container width for rendition sizing
      const el = document.getElementById('epub-reader')
      const width = el ? el.clientWidth : this.readerWidth
      const widthPct = (this.ereaderSettings.maxWidth || 70) / 100
      this.rendition?.resize(Math.round(width * widthPct), this.readerHeight * 0.8)
    },
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
      // Don't duplicate
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
    goToBookmark(cfi) {
      if (!this.rendition?.manager) return
      this.initialPositioning = false
      this.rendition.display(cfi)
    },
    /**
     * Save reading progress for a given paragraph element.
     * Generates a CFI from the element and calls updateProgress.
     */
    ttsSaveProgress(el) {
      if (!this.keepProgress || !el || !this.book || !this.rendition) return
      try {
        // Find which spine item contains this element
        const contents = this.rendition.getContents() || []
        for (const c of contents) {
          const doc = c.document || c.content?.ownerDocument
          if (!doc || !doc.body.contains(el)) continue
          const section = c.sectionIndex != null ? this.book.spine.get(c.sectionIndex) : null
          if (!section) continue
          const cfi = section.cfiFromElement(el)
          if (!cfi) continue
          const pct = this.book.locations.percentageFromCfi(cfi)
          this.updateProgress({
            ebookLocation: cfi,
            ebookProgress: pct || undefined
          })
          return
        }
      } catch (e) {
        console.error('ttsSaveProgress failed:', e)
      }
    },
    /**
     * Get all paragraph elements from the current epub iframe(s).
     * Returns an array of { el, text } objects.
     */
    getTtsParagraphs() {
      const contents = this.rendition?.getContents?.() || []
      const paragraphs = []
      for (const c of contents) {
        const doc = c.document || c.content?.ownerDocument
        if (!doc?.body) continue
        const els = doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote')
        els.forEach((el) => {
          const text = (el.innerText || el.textContent || '').trim()
          if (text.length > 0) {
            paragraphs.push({ el, text })
          }
        })
      }
      return paragraphs
    },
    /**
     * Find the index of the first paragraph that's currently visible on screen.
     * Used to start TTS from where the user is actually reading.
     */
    getFirstVisibleParagraphIndex(paragraphs) {
      if (!paragraphs.length) return 0
      // Get the container's visible area
      const container = this.rendition?.manager?.container
      if (!container) return 0
      const containerRect = container.getBoundingClientRect()

      for (let i = 0; i < paragraphs.length; i++) {
        const el = paragraphs[i].el
        try {
          // Get the element's position relative to the viewport
          // The element is inside an iframe, so we need to account for the iframe's offset
          const iframe = el.ownerDocument?.defaultView?.frameElement
          if (!iframe) continue
          const iframeRect = iframe.getBoundingClientRect()
          const elRect = el.getBoundingClientRect()
          // Element's absolute position = iframe offset + element offset within iframe
          const absTop = iframeRect.top + elRect.top
          const absBottom = iframeRect.top + elRect.bottom
          // Check if element overlaps with the visible container area
          if (absBottom > containerRect.top && absTop < containerRect.bottom) {
            return i
          }
        } catch (e) {
          continue
        }
      }
      return 0
    },
    /**
     * Highlight a paragraph element in the epub iframe.
     * Clears any previous highlight first.
     */
    ttsHighlight(el) {
      this.ttsClearHighlight()
      if (!el) return
      el.setAttribute('data-tts-active', 'true')
      el.style.setProperty('outline', '2px solid rgba(59, 130, 246, 0.5)', 'important')
      el.style.setProperty('outline-offset', '2px', 'important')
      el.style.setProperty('background-color', 'rgba(59, 130, 246, 0.08)', 'important')

      // Check if element is visible; if not, navigate the rendition to show it
      const container = this.rendition?.manager?.container
      if (container) {
        const iframe = el.ownerDocument?.defaultView?.frameElement
        if (iframe) {
          const iframeRect = iframe.getBoundingClientRect()
          const elRect = el.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()
          const absTop = iframeRect.top + elRect.top
          const absBottom = iframeRect.top + elRect.bottom
          if (absBottom <= containerRect.top || absTop >= containerRect.bottom) {
            // Element is off-screen — generate CFI and navigate to it
            try {
              const contents = this.rendition.getContents() || []
              for (const c of contents) {
                const doc = c.document || c.content?.ownerDocument
                if (!doc || !doc.body.contains(el)) continue
                const section = c.sectionIndex != null ? this.book.spine.get(c.sectionIndex) : null
                if (!section) continue
                const cfi = section.cfiFromElement(el)
                if (cfi) {
                  this._ttsNavigating = true
                  this.rendition.display(cfi)
                }
                break
              }
            } catch (e) {
              // Fallback to scrollIntoView
              el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          }
        }
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    },
    ttsClearHighlight() {
      const contents = this.rendition?.getContents?.() || []
      for (const c of contents) {
        const doc = c.document || c.content?.ownerDocument
        if (!doc) continue
        const active = doc.querySelectorAll('[data-tts-active]')
        active.forEach((el) => {
          el.removeAttribute('data-tts-active')
          el.style.removeProperty('outline')
          el.style.removeProperty('outline-offset')
          el.style.removeProperty('background-color')
        })
      }
    },
    /**
     * Install click handlers on paragraphs so user can click to set TTS start point.
     * Emits 'tts-start-from' with the paragraph index.
     */
    ttsInstallClickHandlers() {
      const contents = this.rendition?.getContents?.() || []
      for (const c of contents) {
        const doc = c.document || c.content?.ownerDocument
        if (!doc?.body) continue
        // Remove old handlers if any
        if (doc._ttsClickHandler) {
          doc.body.removeEventListener('click', doc._ttsClickHandler)
        }
        if (doc._ttsMouseDown) {
          doc.body.removeEventListener('mousedown', doc._ttsMouseDown)
        }
        // Track mousedown position to distinguish clicks from scroll drags
        let downX = 0, downY = 0
        doc._ttsMouseDown = (e) => { downX = e.clientX; downY = e.clientY }
        doc._ttsClickHandler = (e) => {
          // Ignore if mouse moved more than 5px (scroll/drag)
          const dist = Math.sqrt((e.clientX - downX) ** 2 + (e.clientY - downY) ** 2)
          if (dist > 5) return
          // Walk up from click target to find a paragraph-level element
          let target = e.target
          const tags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'])
          while (target && target !== doc.body) {
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
        doc.body.addEventListener('mousedown', doc._ttsMouseDown)
        doc.body.addEventListener('click', doc._ttsClickHandler)
      }
    },
    ttsRemoveClickHandlers() {
      const contents = this.rendition?.getContents?.() || []
      for (const c of contents) {
        const doc = c.document || c.content?.ownerDocument
        if (!doc?.body) continue
        if (doc._ttsClickHandler) {
          doc.body.removeEventListener('click', doc._ttsClickHandler)
          delete doc._ttsClickHandler
        }
        if (doc._ttsMouseDown) {
          doc.body.removeEventListener('mousedown', doc._ttsMouseDown)
          delete doc._ttsMouseDown
        }
      }
    },
    /**
     * Load all paragraphs from the current spine section (full chapter),
     * not just what's visible. Returns array of text strings.
     */
    async getTtsChapterParagraphs() {
      const currentSection = this.rendition?.location?.start?.href
      if (!currentSection) return []
      try {
        const item = this.book.spine.get(currentSection)
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
    /**
     * For continuous scroll mode: pre-load all spine items so the manager
     * never needs to prepend/append during navigation. This eliminates the
     * counter() race condition that causes chapter navigation drift.
     */
    async patchContinuousManager() {
      const mgr = this.rendition?.manager
      if (!mgr || mgr.name !== 'continuous') return

      const isContinuous = this.ereaderSettings.spread === 'continuous'
      if (!isContinuous) return

      // Save the current location so we can restore after preloading
      const currentCfi = this.rendition.location?.start?.cfi

      // Suppress counter() during preload — we'll reposition after
      const origCounter = mgr.counter.bind(mgr)
      mgr.counter = function () {}

      // Suppress scroll events during preload
      const origOnScroll = mgr._onScroll
      if (origOnScroll) {
        const scroller = mgr.settings.fullsize ? window : mgr.container
        scroller.removeEventListener('scroll', origOnScroll)
      }

      // Append all spine items below current
      let last = mgr.views.last()
      while (last) {
        const next = last.section.next()
        if (!next) break
        const view = mgr.append(next)
        await view.display(mgr.request)
        last = mgr.views.last()
      }

      // Prepend all spine items above current
      let first = mgr.views.first()
      while (first) {
        const prev = first.section.prev()
        if (!prev) break
        const view = mgr.prepend(prev)
        await view.display(mgr.request)
        first = mgr.views.first()
      }

      // Restore counter
      mgr.counter = origCounter

      // Restore scroll listener
      if (origOnScroll) {
        const scroller = mgr.settings.fullsize ? window : mgr.container
        scroller.addEventListener('scroll', origOnScroll)
      }

      // Navigate back to where we were — all sections are loaded now so
      // check() won't prepend anything and counter() won't fire
      if (currentCfi) {
        await this.rendition.display(currentCfi)
      }

      // Disable trim and check so sections never get removed or re-added
      mgr.trim = function () { return Promise.resolve() }

      // Replace check to be a no-op since everything is loaded
      mgr.check = function () { return Promise.resolve(false) }

      console.log('[patchContinuousManager] Pre-loaded all', mgr.views.length(), 'spine items')
    },
    applyTheme() {
      if (!this.rendition) return
      this.rendition.getContents().forEach((c) => {
        c.addStylesheetRules(this.themeRules)
        // Inject web fonts into the epub iframe
        const doc = c.document || c.content?.ownerDocument
        if (doc && !doc.getElementById('abs-custom-fonts')) {
          const link = doc.createElement('link')
          link.id = 'abs-custom-fonts'
          link.rel = 'stylesheet'
          link.href = 'https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,200..900&display=swap'
          doc.head.appendChild(link)
          const style = doc.createElement('style')
          style.textContent = `
            @font-face {
              font-family: 'OpenDyslexic';
              src: url('https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Regular.woff') format('woff');
              font-weight: normal;
            }
            @font-face {
              font-family: 'OpenDyslexic';
              src: url('https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Bold.woff') format('woff');
              font-weight: bold;
            }
          `
          doc.head.appendChild(style)
        }
      })
    }
  },
  mounted() {
    this.windowWidth = window.innerWidth
    this.windowHeight = window.innerHeight
    window.addEventListener('resize', this.resize)
    this.loadBookmarks()
    this.$emit('bookmarks-updated', this.ebookBookmarks)
    this.initEpub()
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.resize)
    this.book?.destroy()
  }
}
</script>
