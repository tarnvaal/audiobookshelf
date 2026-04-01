import ThemeManager from '../../../lib/epub-renderer/ThemeManager'

describe('ThemeManager', () => {
  let container

  beforeEach(() => {
    container = document.createElement('div')
    container.id = 'epub-content'
    document.body.appendChild(container)
    container.innerHTML = '<section data-spine-index="0"><p>Test paragraph</p></section>'
  })

  afterEach(() => {
    container.remove()
  })

  describe('applyTheme', () => {
    it('applies dark theme colors', () => {
      const tm = new ThemeManager(container)
      tm.applyTheme('dark')

      const style = window.getComputedStyle(container)
      expect(style.backgroundColor).to.not.equal('')
      // Dark theme should have dark background
      const section = container.querySelector('section')
      const sectionStyle = window.getComputedStyle(section)
      // The theme style tag should exist
      const styleEl = container.querySelector('style[data-theme]')
      expect(styleEl).to.not.be.null
      expect(styleEl.textContent).to.include('background-color')
    })

    it('applies sepia theme colors', () => {
      const tm = new ThemeManager(container)
      tm.applyTheme('sepia')

      const styleEl = container.querySelector('style[data-theme]')
      expect(styleEl).to.not.be.null
      expect(styleEl.textContent).to.include('background-color')
    })

    it('applies light theme colors', () => {
      const tm = new ThemeManager(container)
      tm.applyTheme('light')

      const styleEl = container.querySelector('style[data-theme]')
      expect(styleEl).to.not.be.null
    })

    it('is idempotent — applying twice does not double-inject', () => {
      const tm = new ThemeManager(container)
      tm.applyTheme('dark')
      tm.applyTheme('dark')

      const styleEls = container.querySelectorAll('style[data-theme]')
      expect(styleEls).to.have.length(1)
    })

    it('replaces previous theme when switching', () => {
      const tm = new ThemeManager(container)
      tm.applyTheme('dark')
      tm.applyTheme('sepia')

      const styleEls = container.querySelectorAll('style[data-theme]')
      expect(styleEls).to.have.length(1)
    })
  })

  describe('setFont', () => {
    it('sets font family on the container', () => {
      const tm = new ThemeManager(container)
      tm.setFont('Georgia')

      const style = window.getComputedStyle(container)
      expect(style.fontFamily).to.include('Georgia')
    })
  })

  describe('setFontSize', () => {
    it('sets font size as percentage', () => {
      const tm = new ThemeManager(container)
      tm.setFontSize(120)

      const styleEl = container.querySelector('style[data-font-size]')
      expect(styleEl).to.not.be.null
      expect(styleEl.textContent).to.include('120%')
    })
  })

  describe('setLineSpacing', () => {
    it('sets line height', () => {
      const tm = new ThemeManager(container)
      tm.setLineSpacing(150)

      const styleEl = container.querySelector('style[data-line-spacing]')
      expect(styleEl).to.not.be.null
      expect(styleEl.textContent).to.include('1.5')
    })
  })

  describe('setTextAlign', () => {
    it('sets text alignment', () => {
      const tm = new ThemeManager(container)
      tm.setTextAlign('justify')

      const styleEl = container.querySelector('style[data-text-align]')
      expect(styleEl).to.not.be.null
      expect(styleEl.textContent).to.include('justify')
    })
  })

  describe('setMaxWidth', () => {
    it('sets max width as percentage', () => {
      const tm = new ThemeManager(container)
      tm.setMaxWidth(70)

      expect(container.style.maxWidth).to.equal('70%')
    })
  })

  describe('injectSectionStyles', () => {
    it('injects scoped CSS for a spine section', () => {
      const tm = new ThemeManager(container)
      tm.injectSectionStyles(0, ['p { color: red; }'])

      const styleEl = container.querySelector('style[data-spine-styles="0"]')
      expect(styleEl).to.not.be.null
      expect(styleEl.textContent).to.include('color: red')
    })

    it('scopes CSS selectors to the section', () => {
      const tm = new ThemeManager(container)
      tm.injectSectionStyles(0, ['p { color: red; }'])

      const styleEl = container.querySelector('style[data-spine-styles="0"]')
      // Should be scoped to the section
      expect(styleEl.textContent).to.include('[data-spine-index="0"]')
    })

    it('does not duplicate when called twice for same section', () => {
      const tm = new ThemeManager(container)
      tm.injectSectionStyles(0, ['p { color: red; }'])
      tm.injectSectionStyles(0, ['p { color: blue; }'])

      const styleEls = container.querySelectorAll('style[data-spine-styles="0"]')
      expect(styleEls).to.have.length(1)
    })
  })

  describe('applyAll', () => {
    it('applies all settings at once', () => {
      const tm = new ThemeManager(container)
      tm.applyAll({
        theme: 'dark',
        font: 'serif',
        fontScale: 110,
        lineSpacing: 130,
        textAlign: 'left',
        maxWidth: 80
      })

      expect(container.querySelector('style[data-theme]')).to.not.be.null
      expect(container.querySelector('style[data-font-size]')).to.not.be.null
      expect(container.querySelector('style[data-line-spacing]')).to.not.be.null
      expect(container.querySelector('style[data-text-align]')).to.not.be.null
      expect(container.style.maxWidth).to.equal('80%')
    })
  })
})
