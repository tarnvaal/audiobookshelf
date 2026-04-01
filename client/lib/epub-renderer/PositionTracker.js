/**
 * PositionTracker — maps scroll position to CFI and percentage,
 * and emits relocated events on scroll. Uses epub.js Section objects
 * for CFI generation and Book.locations for percentage mapping.
 */
export default class PositionTracker {
  /**
   * @param {HTMLElement} container — the epub content container
   * @param {Array} sections — array of epub.js Section objects (one per spine item)
   * @param {object} locations — epub.js Book.locations object
   */
  constructor(container, sections, locations) {
    this.container = container
    this.sections = sections
    this.locations = locations

    this._listeners = {}
    this._scrollHandler = null
    this._scrollTimer = null
  }

  /**
   * Get the current reading position.
   * Returns { spineIndex, cfi, percentage, location, element }
   */
  getCurrentPosition() {
    const el = this.findFirstVisibleElement()
    if (!el) {
      return { spineIndex: 0, cfi: null, percentage: 0, location: 0, element: null }
    }

    const spineIndex = this._getSpineIndex(el)
    const cfi = this.getCfiForElement(el)
    const percentage = cfi ? this.getPercentageForCfi(cfi) : 0
    const location = cfi ? this.getLocationForCfi(cfi) : 0

    return { spineIndex, cfi, percentage, location, element: el }
  }

  /**
   * Find the first paragraph-level element visible in the container viewport.
   */
  findFirstVisibleElement() {
    const containerRect = this.container.getBoundingClientRect()
    const els = this.container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote')

    for (const el of els) {
      const rect = el.getBoundingClientRect()
      if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
        return el
      }
    }
    return null
  }

  /**
   * Generate a CFI for a DOM element using its spine section.
   * Returns null if the element isn't inside a tracked section.
   */
  getCfiForElement(el) {
    const spineIndex = this._getSpineIndex(el)
    if (spineIndex < 0 || spineIndex >= this.sections.length) return null

    const section = this.sections[spineIndex]
    if (!section || typeof section.cfiFromElement !== 'function') return null

    try {
      return section.cfiFromElement(el)
    } catch (e) {
      return null
    }
  }

  /**
   * Get percentage (0-1) from a CFI via the locations map.
   */
  getPercentageForCfi(cfi) {
    if (!this.locations || typeof this.locations.percentageFromCfi !== 'function') return 0
    try {
      return this.locations.percentageFromCfi(cfi) || 0
    } catch (e) {
      return 0
    }
  }

  /**
   * Get location number from a CFI.
   */
  getLocationForCfi(cfi) {
    if (!this.locations || typeof this.locations.locationFromCfi !== 'function') return 0
    try {
      return this.locations.locationFromCfi(cfi) || 0
    } catch (e) {
      return 0
    }
  }

  /**
   * Start tracking scroll position and emitting relocated events.
   * Debounces scroll events to avoid excessive CFI generation.
   */
  startTracking() {
    this._scrollHandler = () => {
      clearTimeout(this._scrollTimer)
      this._scrollTimer = setTimeout(() => {
        const pos = this.getCurrentPosition()
        this._emit('relocated', pos)
      }, 150)
    }
    this.container.addEventListener('scroll', this._scrollHandler)
  }

  /**
   * Stop tracking scroll position.
   */
  stopTracking() {
    if (this._scrollHandler) {
      this.container.removeEventListener('scroll', this._scrollHandler)
      this._scrollHandler = null
    }
    clearTimeout(this._scrollTimer)
  }

  /**
   * Get the spine index for a DOM element by walking up to its section wrapper.
   */
  _getSpineIndex(el) {
    const section = el.closest?.('[data-spine-index]')
    if (!section) return -1
    return parseInt(section.getAttribute('data-spine-index'), 10)
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
   * Clean up listeners.
   */
  destroy() {
    this.stopTracking()
    this._listeners = {}
  }
}
