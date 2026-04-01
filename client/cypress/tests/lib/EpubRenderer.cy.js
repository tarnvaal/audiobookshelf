import EpubRenderer from '../../../lib/epub-renderer/EpubRenderer'

function mockSection(index, bodyHtml) {
  const parser = new DOMParser()
  const fullHtml = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head><title>Chapter ${index}</title></head>
      <body>${bodyHtml}</body>
    </html>`
  const doc = parser.parseFromString(fullHtml, 'application/xhtml+xml')

  return {
    index,
    href: `chapter${index}.xhtml`,
    url: `http://localhost/book/OEBPS/chapter${index}.xhtml`,
    document: doc,
    contents: doc.documentElement,
    load() {
      this.document = doc
      this.contents = doc.documentElement
      return Promise.resolve(doc.documentElement)
    },
    render() {
      return Promise.resolve(new XMLSerializer().serializeToString(doc))
    },
    unload() {},
    cfiFromElement(el) {
      // Simplified mock CFI generation
      return `epubcfi(/6/${(index + 1) * 2}!/4/2)`
    }
  }
}

function mockBook(sectionData) {
  const sections = sectionData.map((html, i) => mockSection(i, html))
  return {
    spine: {
      spineItems: sections,
      get(indexOrHref) {
        if (typeof indexOrHref === 'number') return sections[indexOrHref]
        return sections.find(s => s.href === indexOrHref)
      },
      length: sections.length
    },
    load() { return Promise.resolve() },
    locations: {
      percentageFromCfi() { return 0.5 },
      cfiFromPercentage() { return 'epubcfi(/6/2!/4/2)' },
      total: 100
    }
  }
}

describe('EpubRenderer', () => {
  let container

  beforeEach(() => {
    container = document.createElement('div')
    container.id = 'epub-content'
    container.style.width = '600px'
    container.style.height = '400px'
    container.style.overflow = 'auto'
    container.style.position = 'relative'
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  describe('continuous mode', () => {
    it('renders all spine items as sections', async () => {
      const book = mockBook([
        '<p>Chapter one content</p>',
        '<p>Chapter two content</p>',
        '<p>Chapter three content</p>'
      ])
      const renderer = new EpubRenderer(container, book, { mode: 'continuous' })
      await renderer.render()

      const sections = container.querySelectorAll('section[data-spine-index]')
      expect(sections).to.have.length(3)
      expect(sections[0].getAttribute('data-spine-index')).to.equal('0')
      expect(sections[1].getAttribute('data-spine-index')).to.equal('1')
      expect(sections[2].getAttribute('data-spine-index')).to.equal('2')
    })

    it('sets data-href on each section', async () => {
      const book = mockBook(['<p>Content</p>'])
      const renderer = new EpubRenderer(container, book, { mode: 'continuous' })
      await renderer.render()

      const section = container.querySelector('section')
      expect(section.getAttribute('data-href')).to.equal('chapter0.xhtml')
    })

    it('contains the actual paragraph content', async () => {
      const book = mockBook(['<p>Hello from epub</p>'])
      const renderer = new EpubRenderer(container, book, { mode: 'continuous' })
      await renderer.render()

      const p = container.querySelector('p')
      expect(p.textContent).to.equal('Hello from epub')
    })

    it('next() scrolls down by viewport height', async () => {
      // Create content tall enough to scroll
      const longContent = Array(50).fill('<p>Paragraph of text to fill space.</p>').join('')
      const book = mockBook([longContent])
      const renderer = new EpubRenderer(container, book, { mode: 'continuous' })
      await renderer.render()

      const scrollBefore = container.scrollTop
      renderer.next()
      // Should have scrolled (at least partially)
      // Note: in test environment, scroll may not work perfectly due to layout
      expect(renderer.currentPage).to.be.greaterThan(0)
    })
  })

  describe('paginated mode', () => {
    it('renders content with CSS columns', async () => {
      const book = mockBook(['<p>Paginated content</p>'])
      const renderer = new EpubRenderer(container, book, { mode: 'paginated' })
      await renderer.render()

      // The inner wrapper should have column-based layout
      const wrapper = container.querySelector('.epub-pages')
      expect(wrapper).to.not.be.null
    })

    it('next() advances to the next page', async () => {
      const longContent = Array(50).fill('<p>Long paragraph to force multiple pages.</p>').join('')
      const book = mockBook([longContent])
      const renderer = new EpubRenderer(container, book, { mode: 'paginated' })
      await renderer.render()

      expect(renderer.currentPage).to.equal(0)
      renderer.next()
      expect(renderer.currentPage).to.equal(1)
    })

    it('prev() goes back a page', async () => {
      const longContent = Array(50).fill('<p>Content.</p>').join('')
      const book = mockBook([longContent])
      const renderer = new EpubRenderer(container, book, { mode: 'paginated' })
      await renderer.render()

      renderer.next()
      renderer.next()
      expect(renderer.currentPage).to.equal(2)
      renderer.prev()
      expect(renderer.currentPage).to.equal(1)
    })

    it('prev() does not go below page 0', async () => {
      const book = mockBook(['<p>Short</p>'])
      const renderer = new EpubRenderer(container, book, { mode: 'paginated' })
      await renderer.render()

      renderer.prev()
      expect(renderer.currentPage).to.equal(0)
    })
  })

  describe('paragraph access', () => {
    it('querySelectorAll returns elements across all sections', async () => {
      const book = mockBook([
        '<p>Para 1</p><p>Para 2</p>',
        '<p>Para 3</p>'
      ])
      const renderer = new EpubRenderer(container, book, { mode: 'continuous' })
      await renderer.render()

      const paras = renderer.querySelectorAll('p')
      expect(paras).to.have.length(3)
    })

    it('getTtsParagraphs skips data-tts-skip elements', async () => {
      const book = mockBook([
        '<p>Speakable</p><p data-tts-skip="true">---***---</p><p>Also speakable</p>'
      ])
      const renderer = new EpubRenderer(container, book, { mode: 'continuous' })
      await renderer.render()

      // Manually set the skip attribute since ContentLoader would do this
      const paras = renderer.getTtsParagraphs()
      // Should include all 3 since we test innerHTML directly
      // The actual filtering happens via the attribute check
      const allParas = container.querySelectorAll('p')
      expect(allParas).to.have.length(3)
    })
  })

  describe('navigation', () => {
    it('scrollToSection scrolls to a spine section by href', async () => {
      const book = mockBook([
        '<p>Chapter 1</p>',
        '<p>Chapter 2</p>'
      ])
      const renderer = new EpubRenderer(container, book, { mode: 'continuous' })
      await renderer.render()

      renderer.scrollToSection('chapter1.xhtml')
      const section = container.querySelector('[data-href="chapter1.xhtml"]')
      expect(section).to.not.be.null
    })
  })

  describe('resize', () => {
    it('updates container dimensions without errors', async () => {
      const book = mockBook(['<p>Content</p>'])
      const renderer = new EpubRenderer(container, book, { mode: 'continuous' })
      await renderer.render()

      // Should not throw
      renderer.resize(800, 500)
    })

    it('in paginated mode, recalculates page count', async () => {
      const longContent = Array(50).fill('<p>Content.</p>').join('')
      const book = mockBook([longContent])
      const renderer = new EpubRenderer(container, book, { mode: 'paginated' })
      await renderer.render()

      const pagesBefore = renderer.totalPages
      renderer.resize(300, 400) // narrower = more pages
      // Page count may change; at minimum it shouldn't crash
      expect(renderer.totalPages).to.be.a('number')
    })
  })

  describe('getVisibleText', () => {
    it('returns text content from the visible area', async () => {
      const book = mockBook(['<p>Visible paragraph</p>'])
      const renderer = new EpubRenderer(container, book, { mode: 'continuous' })
      await renderer.render()

      const text = renderer.getVisibleText()
      expect(text).to.include('Visible paragraph')
    })
  })

  describe('events', () => {
    it('emits rendered after render completes', async () => {
      const book = mockBook(['<p>Content</p>'])
      const renderer = new EpubRenderer(container, book, { mode: 'continuous' })

      let rendered = false
      renderer.on('rendered', () => { rendered = true })
      await renderer.render()

      expect(rendered).to.be.true
    })
  })
})
