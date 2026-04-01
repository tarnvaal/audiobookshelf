/**
 * ContentLoader — loads epub spine items via epub.js Book parsing,
 * extracts body HTML, rewrites resource URLs, strips scripts,
 * and marks decorative content.
 *
 * Does NOT render anything — just prepares content for injection.
 */
export default class ContentLoader {
  /**
   * @param {ePub.Book} book — epub.js Book instance (parsing only)
   * @param {object} [options]
   * @param {boolean} [options.allowScriptedContent=false]
   */
  constructor(book, options = {}) {
    this.book = book
    this.allowScriptedContent = options.allowScriptedContent || false
  }

  /**
   * Load a single spine item by index.
   * Returns { spineIndex, href, html, styles, section }
   *
   * - html: serialized body innerHTML with URLs rewritten
   * - styles: array of CSS strings extracted from <style> blocks
   * - section: the epub.js Section object (kept loaded for CFI generation)
   */
  async loadSection(index) {
    const section = this.book.spine.get(index)
    if (!section) throw new Error(`No spine item at index ${index}`)

    await section.load(this.book.load.bind(this.book))

    const doc = section.document
    // epub.js parses XHTML as XML — doc.body may not exist on XML documents
    const body = doc?.body || doc?.querySelector('body')
    if (!body) {
      console.warn(`[ContentLoader] No body found for spine item ${index}`)
      return { spineIndex: index, href: section.href, html: '', styles: [], section }
    }

    // Extract styles from <head>
    const styles = this._extractStyles(doc, section.url)

    // Rewrite resource URLs in the body
    this._rewriteUrls(body, section.url)

    // Strip scripts if not allowed
    if (!this.allowScriptedContent) {
      this._stripScripts(body)
    }

    // Mark decorative/non-speakable paragraphs for TTS
    this._markDecorativeContent(body)

    // Serialize body innerHTML
    const html = this._serializeBody(body)

    return { spineIndex: index, href: section.href, html, styles, section }
  }

  /**
   * Load all spine items in order.
   * Returns array of { spineIndex, href, html, styles, section }
   */
  async loadAllSections() {
    const items = this.book.spine.spineItems
    const results = []
    for (let i = 0; i < items.length; i++) {
      results.push(await this.loadSection(i))
    }
    return results
  }

  /**
   * Extract <style> block contents from the document head.
   * Returns array of CSS strings.
   */
  _extractStyles(doc, baseUrl) {
    const styles = []
    const styleEls = doc.querySelectorAll('head style')
    styleEls.forEach((el) => {
      const css = el.textContent || ''
      if (css.trim()) styles.push(css)
    })
    return styles
  }

  /**
   * Rewrite relative src/href attributes to absolute URLs
   * based on the section's URL.
   */
  _rewriteUrls(body, baseUrl) {
    const attrs = ['src', 'href', 'poster', 'xlink:href']
    const els = body.querySelectorAll('[src], [href], [poster], [xlink\\:href]')

    els.forEach((el) => {
      attrs.forEach((attr) => {
        const val = el.getAttribute(attr)
        if (!val) return
        // Skip absolute URLs and data URIs
        if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:') || val.startsWith('blob:')) return
        // Skip fragment-only references
        if (val.startsWith('#')) return

        try {
          const resolved = new URL(val, baseUrl).href
          el.setAttribute(attr, resolved)
        } catch (e) {
          // Leave as-is if URL parsing fails
        }
      })
    })
  }

  /**
   * Remove all <script> elements from the body.
   */
  _stripScripts(body) {
    const scripts = body.querySelectorAll('script')
    scripts.forEach((s) => s.remove())
  }

  /**
   * Mark paragraphs that contain no alphanumeric characters
   * with data-tts-skip so TTS can skip them.
   */
  _markDecorativeContent(body) {
    const els = body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote')
    els.forEach((el) => {
      const text = (el.innerText || el.textContent || '').trim()
      if (text.length > 0 && !/[a-zA-Z0-9]/.test(text)) {
        el.setAttribute('data-tts-skip', 'true')
      }
    })
  }

  /**
   * Serialize body contents to an HTML string.
   */
  _serializeBody(body) {
    // Use innerHTML to get just the body contents, not the body tag itself
    // Fall back to XMLSerializer for xhtml documents
    if (body.innerHTML !== undefined) {
      return body.innerHTML
    }
    const serializer = new XMLSerializer()
    let html = ''
    for (const child of body.childNodes) {
      html += serializer.serializeToString(child)
    }
    return html
  }
}
