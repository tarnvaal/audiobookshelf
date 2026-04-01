/**
 * ThemeManager — handles theme colors, fonts, spacing, and epub CSS injection
 * for the custom epub renderer. All styling via <style> tags in the container,
 * no iframe shenanigans.
 */

const THEMES = {
  dark: {
    background: '#232323',
    color: '#d4d4d4',
    linkColor: '#7eb8f7'
  },
  sepia: {
    background: '#f5e6c8',
    color: '#5b4636',
    linkColor: '#6b4c2a'
  },
  light: {
    background: '#ffffff',
    color: '#1a1a1a',
    linkColor: '#1a5fb4'
  }
}

export default class ThemeManager {
  /**
   * @param {HTMLElement} container — the epub content container element
   */
  constructor(container) {
    this.container = container
  }

  /**
   * Apply a color theme (dark, sepia, light).
   */
  applyTheme(themeName) {
    const theme = THEMES[themeName] || THEMES.dark
    const css = `
      #epub-content {
        background-color: ${theme.background} !important;
        color: ${theme.color} !important;
      }
      #epub-content * {
        color: inherit !important;
        background-color: transparent !important;
      }
      #epub-content a, #epub-content a * {
        color: ${theme.linkColor} !important;
      }
      #epub-content img, #epub-content svg, #epub-content video {
        background-color: transparent !important;
      }
    `
    this._injectStyle('data-theme', css)
  }

  /**
   * Set the font family.
   */
  setFont(family) {
    this.container.style.fontFamily = family
  }

  /**
   * Set font size as a percentage (100 = default).
   */
  setFontSize(pct) {
    const css = `#epub-content { font-size: ${pct}% !important; }`
    this._injectStyle('data-font-size', css)
  }

  /**
   * Set line spacing as a percentage (100 = 1.0 line-height).
   */
  setLineSpacing(pct) {
    const lineHeight = pct / 100
    const css = `#epub-content * { line-height: ${lineHeight} !important; }`
    this._injectStyle('data-line-spacing', css)
  }

  /**
   * Set text alignment (justify, left, etc).
   */
  setTextAlign(align) {
    const css = `#epub-content p, #epub-content li, #epub-content blockquote { text-align: ${align} !important; }`
    this._injectStyle('data-text-align', css)
  }

  /**
   * Set max content width as a percentage.
   */
  setMaxWidth(pct) {
    this.container.style.maxWidth = `${pct}%`
  }

  /**
   * Inject CSS from an epub spine section, scoped to that section's
   * data-spine-index attribute.
   */
  injectSectionStyles(spineIndex, cssStrings) {
    const attr = `data-spine-styles`
    const scope = `[data-spine-index="${spineIndex}"]`

    // Crude but effective CSS scoping: prepend the scope selector to each rule.
    // This doesn't handle @media queries perfectly, but covers the common case.
    const scoped = cssStrings.map((css) => this._scopeCss(css, scope)).join('\n')

    this._injectStyle(attr, scoped, String(spineIndex))
  }

  /**
   * Apply all settings at once from a settings object.
   */
  applyAll(settings) {
    if (settings.theme) this.applyTheme(settings.theme)
    if (settings.font) this.setFont(settings.font)
    if (settings.fontScale) this.setFontSize(settings.fontScale)
    if (settings.lineSpacing) this.setLineSpacing(settings.lineSpacing)
    if (settings.textAlign) this.setTextAlign(settings.textAlign)
    if (settings.maxWidth) this.setMaxWidth(settings.maxWidth)
  }

  /**
   * Inject or replace a <style> element identified by a data attribute.
   */
  _injectStyle(attr, css, attrValue = '') {
    const selector = attrValue ? `style[${attr}="${attrValue}"]` : `style[${attr}]`
    let existing = this.container.querySelector(selector)
    if (existing) {
      existing.textContent = css
      return
    }
    const style = document.createElement('style')
    style.setAttribute(attr, attrValue)
    style.textContent = css
    this.container.insertBefore(style, this.container.firstChild)
  }

  /**
   * Scope CSS rules by prepending a selector prefix.
   * Handles simple selectors; @-rules are passed through with inner selectors scoped.
   */
  _scopeCss(css, scopeSelector) {
    // Split on closing brace to find rule blocks
    return css.replace(/([^{}]+)\{/g, (match, selectors) => {
      // Don't scope @-rules themselves (but their inner selectors will be scoped on recursion)
      if (selectors.trim().startsWith('@')) return match
      // Scope each comma-separated selector
      const scoped = selectors
        .split(',')
        .map((s) => {
          s = s.trim()
          if (!s) return s
          return `${scopeSelector} ${s}`
        })
        .join(', ')
      return `${scoped} {`
    })
  }
}
