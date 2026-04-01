/**
 * EpubRenderer — custom epub rendering engine.
 * Uses epub.js Book for parsing only. Renders content into plain DOM elements
 * (no iframes, no epub.js Rendition/Manager).
 *
 * Supports continuous scroll and paginated (CSS columns) modes.
 */
import ContentLoader from './ContentLoader'
import ThemeManager from './ThemeManager'

export default class EpubRenderer {
  /**
   * @param {HTMLElement} container — the DOM element to render into
   * @param {ePub.Book} book — epub.js Book instance (parsing only)
   * @param {object} options
   * @param {string} options.mode — 'continuous' or 'paginated'
   * @param {boolean} [options.allowScriptedContent=false]
   */
  constructor(container, book, options = {}) {
    this.container = container
    this.book = book
    this.mode = options.mode || 'continuous'
    this.allowScriptedContent = options.allowScriptedContent || false

    this.contentLoader = new ContentLoader(book, {
      allowScriptedContent: this.allowScriptedContent
    })
    this.themeManager = new ThemeManager(container)

    // Loaded section data: array of { spineIndex, href, html, styles, section }
    this.loadedSections = []

    // Pagination state
    this.currentPage = 0
    this.totalPages = 1

    // Event listeners
    this._listeners = {}

    // The inner content wrapper
    this._wrapper = null
  }

  /**
   * Render all spine items into the container.
   */
  async render() {
    this.loadedSections = await this.contentLoader.loadAllSections()
    this._buildDom()
    this._emit('rendered')
  }

  /**
   * Build the DOM structure from loaded sections.
   */
  _buildDom() {
    // Clear container (except style tags we may have injected)
    const existingStyles = Array.from(this.container.querySelectorAll('style'))
    this.container.innerHTML = ''
    existingStyles.forEach((s) => this.container.appendChild(s))

    if (this.mode === 'paginated') {
      this._buildPaginatedDom()
    } else {
      this._buildContinuousDom()
    }
  }

  _buildContinuousDom() {
    this.container.style.overflow = 'auto'
    this.container.classList.remove('epub-paginated-container')

    for (const data of this.loadedSections) {
      const section = document.createElement('section')
      section.setAttribute('data-spine-index', String(data.spineIndex))
      section.setAttribute('data-href', data.href)
      section.innerHTML = data.html
      this.container.appendChild(section)

      // Inject section-specific styles
      if (data.styles.length) {
        this.themeManager.injectSectionStyles(data.spineIndex, data.styles)
      }
    }
  }

  _buildPaginatedDom() {
    this.container.style.overflow = 'hidden'
    this.container.classList.add('epub-paginated-container')

    const wrapper = document.createElement('div')
    wrapper.className = 'epub-pages'
    wrapper.style.columnGap = '0px'
    wrapper.style.overflow = 'hidden'

    for (const data of this.loadedSections) {
      const section = document.createElement('section')
      section.setAttribute('data-spine-index', String(data.spineIndex))
      section.setAttribute('data-href', data.href)
      section.innerHTML = data.html
      wrapper.appendChild(section)

      if (data.styles.length) {
        this.themeManager.injectSectionStyles(data.spineIndex, data.styles)
      }
    }

    this.container.appendChild(wrapper)
    this._wrapper = wrapper

    // Defer column sizing until the container has dimensions
    this._applyPaginatedLayout()
    console.log('[EpubRenderer] Paginated DOM built, wrapper children:', wrapper.childNodes.length, 'container innerHTML length:', this.container.innerHTML.length)
  }

  /**
   * Apply column sizing for paginated layout.
   * Called after DOM is built and whenever container resizes.
   */
  _applyPaginatedLayout() {
    if (!this._wrapper) return
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    console.log('[EpubRenderer] Paginated layout:', w, 'x', h)
    if (w > 0 && h > 0) {
      // CSS columns pagination: fixed height forces horizontal overflow into columns.
      // Container clips to show one page, translateX moves between pages.
      this._wrapper.style.columnWidth = `${w}px`
      this._wrapper.style.columnGap = '0px'
      this._wrapper.style.height = `${h}px`
      this._wrapper.style.overflow = 'visible'
      this._wrapper.style.width = `${w}px`

      // Container clips to one page width
      this.container.style.overflow = 'hidden'

      // Wait a frame for columns to lay out before measuring
      requestAnimationFrame(() => {
        this._recalcPages()
        console.log('[EpubRenderer] Pages:', this.totalPages, 'scrollWidth:', this._wrapper.scrollWidth)
      })
    } else {
      requestAnimationFrame(() => this._applyPaginatedLayout())
    }
  }

  /**
   * Recalculate total page count for paginated mode.
   */
  _recalcPages() {
    if (this.mode !== 'paginated' || !this._wrapper) return
    const scrollWidth = this._wrapper.scrollWidth
    const pageWidth = this.container.clientWidth
    this.totalPages = Math.max(1, Math.ceil(scrollWidth / pageWidth))
  }

  /**
   * Navigate to the next page/scroll segment.
   */
  next() {
    if (this.mode === 'paginated') {
      if (this.currentPage < this.totalPages - 1) {
        this.currentPage++
        this._applyPageTransform()
      }
    } else {
      const scrollAmount = this.container.clientHeight * 0.9
      this.container.scrollBy({ top: scrollAmount, behavior: 'smooth' })
      this.currentPage++
    }
  }

  /**
   * Navigate to the previous page/scroll segment.
   */
  prev() {
    if (this.mode === 'paginated') {
      if (this.currentPage > 0) {
        this.currentPage--
        this._applyPageTransform()
      }
    } else {
      const scrollAmount = this.container.clientHeight * 0.9
      this.container.scrollBy({ top: -scrollAmount, behavior: 'smooth' })
      if (this.currentPage > 0) this.currentPage--
    }
  }

  /**
   * Apply CSS transform for paginated mode.
   */
  _applyPageTransform() {
    if (!this._wrapper) return
    const offset = this.currentPage * this.container.clientWidth
    this._wrapper.style.transform = `translateX(-${offset}px)`
  }

  /**
   * Scroll to a section by href (continuous mode) or navigate to it (paginated).
   */
  scrollToSection(href) {
    const section = this.container.querySelector(`[data-href="${href}"]`)
    if (!section) return

    if (this.mode === 'continuous') {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      // In paginated mode, find which page this section starts on
      if (this._wrapper) {
        const sectionLeft = section.offsetLeft
        const pageWidth = this.container.clientWidth
        this.currentPage = Math.floor(sectionLeft / pageWidth)
        this._applyPageTransform()
      }
    }
  }

  /**
   * Scroll to a specific element within the rendered content.
   */
  scrollToElement(el) {
    if (!el) return
    if (this.mode === 'continuous') {
      const containerRect = this.container.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const targetScroll = this.container.scrollTop + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2)
      this.container.scrollTo({ top: targetScroll, behavior: 'smooth' })
    } else if (this._wrapper) {
      const pageWidth = this.container.clientWidth
      this.currentPage = Math.floor(el.offsetLeft / pageWidth)
      this._applyPageTransform()
    }
  }

  /**
   * Handle container resize.
   */
  resize(width, height) {
    if (width) this.container.style.width = `${width}px`
    if (height) this.container.style.height = `${height}px`

    if (this.mode === 'paginated' && this._wrapper) {
      this._applyPaginatedLayout()
      // Clamp current page
      if (this.currentPage >= this.totalPages) {
        this.currentPage = Math.max(0, this.totalPages - 1)
      }
      this._applyPageTransform()
    }
  }

  /**
   * Query all matching elements across all rendered sections.
   */
  querySelectorAll(selector) {
    return Array.from(this.container.querySelectorAll(selector))
  }

  /**
   * Get paragraphs suitable for TTS playback.
   * Skips elements marked with data-tts-skip.
   */
  getTtsParagraphs() {
    const els = this.container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote')
    const paragraphs = []
    els.forEach((el) => {
      if (el.hasAttribute('data-tts-skip')) return
      const text = (el.innerText || el.textContent || '').trim()
      if (text.length > 0 && /[a-zA-Z0-9]/.test(text)) {
        paragraphs.push({ el, text })
      }
    })
    return paragraphs
  }

  /**
   * Get text content from the currently visible area.
   */
  getVisibleText() {
    if (this.mode === 'paginated') {
      // In paginated mode, get text from the current page's visible content
      return this._getVisibleTextPaginated()
    }
    return this._getVisibleTextContinuous()
  }

  _getVisibleTextContinuous() {
    const containerRect = this.container.getBoundingClientRect()
    const els = this.container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote')
    const texts = []
    els.forEach((el) => {
      const rect = el.getBoundingClientRect()
      if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
        const text = (el.innerText || el.textContent || '').trim()
        if (text) texts.push(text)
      }
    })
    return texts.join('\n')
  }

  _getVisibleTextPaginated() {
    const containerRect = this.container.getBoundingClientRect()
    const els = this.container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote')
    const texts = []
    els.forEach((el) => {
      const rect = el.getBoundingClientRect()
      if (rect.right <= containerRect.left || rect.left >= containerRect.right) return
      if (rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) return
      const text = (el.innerText || el.textContent || '').trim()
      if (text) texts.push(text)
    })
    return texts.join('\n')
  }

  /**
   * Get the section data for a given spine index.
   */
  getSection(spineIndex) {
    return this.loadedSections[spineIndex] || null
  }

  /**
   * Get the spine index for a DOM element.
   */
  getSpineIndexForElement(el) {
    const section = el.closest('[data-spine-index]')
    if (!section) return -1
    return parseInt(section.getAttribute('data-spine-index'), 10)
  }

  /**
   * Find the first visible paragraph index in the container.
   */
  getFirstVisibleParagraphIndex(paragraphs) {
    if (!paragraphs.length) return 0
    const containerRect = this.container.getBoundingClientRect()

    for (let i = 0; i < paragraphs.length; i++) {
      const el = paragraphs[i].el
      const rect = el.getBoundingClientRect()
      if (this.mode === 'paginated') {
        // In paginated mode, check both vertical and horizontal visibility.
        // translateX shifts elements — only elements within the container's
        // left/right bounds are on the current page.
        if (rect.right > containerRect.left && rect.left < containerRect.right &&
            rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
          return i
        }
      } else {
        if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
          return i
        }
      }
    }
    return 0
  }

  // ── Event system ──

  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(handler)
  }

  off(event, handler) {
    if (!this._listeners[event]) return
    this._listeners[event] = this._listeners[event].filter((h) => h !== handler)
  }

  _emit(event, ...args) {
    const handlers = this._listeners[event] || []
    handlers.forEach((h) => h(...args))
  }

  /**
   * Clean up.
   */
  destroy() {
    this.container.innerHTML = ''
    this.loadedSections = []
    this._listeners = {}
    this._wrapper = null
  }
}
