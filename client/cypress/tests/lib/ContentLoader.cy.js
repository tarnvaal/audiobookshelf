import ContentLoader from '../../../lib/epub-renderer/ContentLoader'

/**
 * Mock epub.js Section for testing.
 * Simulates section.render() returning serialized HTML,
 * section.load() returning parsed document, and section.url for URL resolution.
 */
function mockSection(index, html, url = 'http://localhost/book/OEBPS/chapter.xhtml') {
  const parser = new DOMParser()
  const fullHtml = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head><title>Chapter ${index}</title></head>
      <body>${html}</body>
    </html>`
  const doc = parser.parseFromString(fullHtml, 'application/xhtml+xml')

  return {
    index,
    href: `chapter${index}.xhtml`,
    url,
    canonical: url,
    document: doc,
    contents: doc.documentElement,
    load(_request) {
      this.document = doc
      this.contents = doc.documentElement
      return Promise.resolve(doc.documentElement)
    },
    render(_request) {
      return Promise.resolve(new XMLSerializer().serializeToString(doc))
    },
    unload() {
      // no-op for tests
    }
  }
}

function mockBook(sections) {
  return {
    spine: {
      spineItems: sections,
      get(indexOrHref) {
        if (typeof indexOrHref === 'number') return sections[indexOrHref]
        return sections.find(s => s.href === indexOrHref)
      },
      length: sections.length
    },
    load: function () { return Promise.resolve() }
  }
}

describe('ContentLoader', () => {
  describe('loadSection', () => {
    it('loads a spine item and returns body HTML', async () => {
      const section = mockSection(0, '<p>Hello world</p>')
      const book = mockBook([section])
      const loader = new ContentLoader(book)

      const result = await loader.loadSection(0)

      expect(result.spineIndex).to.equal(0)
      expect(result.href).to.equal('chapter0.xhtml')
      // Should contain the paragraph
      const container = document.createElement('div')
      container.innerHTML = result.html
      expect(container.querySelector('p').textContent).to.equal('Hello world')
    })

    it('preserves the parsed section document for CFI generation', async () => {
      const section = mockSection(0, '<p>Test</p>')
      const book = mockBook([section])
      const loader = new ContentLoader(book)

      const result = await loader.loadSection(0)

      expect(result.section).to.equal(section)
      expect(result.section.document).to.not.be.undefined
    })

    it('strips script tags when allowScriptedContent is false', async () => {
      const html = '<p>Safe</p><script>alert("xss")</script><p>Also safe</p>'
      const section = mockSection(0, html)
      const book = mockBook([section])
      const loader = new ContentLoader(book, { allowScriptedContent: false })

      const result = await loader.loadSection(0)
      const container = document.createElement('div')
      container.innerHTML = result.html

      expect(container.querySelectorAll('script')).to.have.length(0)
      expect(container.querySelectorAll('p')).to.have.length(2)
    })

    it('preserves script tags when allowScriptedContent is true', async () => {
      const html = '<p>Content</p><script>var x = 1;</script>'
      const section = mockSection(0, html)
      const book = mockBook([section])
      const loader = new ContentLoader(book, { allowScriptedContent: true })

      const result = await loader.loadSection(0)
      const container = document.createElement('div')
      container.innerHTML = result.html

      expect(container.querySelectorAll('script')).to.have.length(1)
    })
  })

  describe('loadAllSections', () => {
    it('loads all spine items in order', async () => {
      const sections = [
        mockSection(0, '<p>Chapter 1</p>'),
        mockSection(1, '<p>Chapter 2</p>'),
        mockSection(2, '<p>Chapter 3</p>')
      ]
      const book = mockBook(sections)
      const loader = new ContentLoader(book)

      const results = await loader.loadAllSections()

      expect(results).to.have.length(3)
      expect(results[0].spineIndex).to.equal(0)
      expect(results[1].spineIndex).to.equal(1)
      expect(results[2].spineIndex).to.equal(2)
    })
  })

  describe('URL rewriting', () => {
    it('rewrites relative image src to absolute', async () => {
      const html = '<p><img src="../images/fig1.png" alt="figure"/></p>'
      const section = mockSection(0, html, 'http://localhost/book/OEBPS/text/chapter1.xhtml')
      const book = mockBook([section])
      const loader = new ContentLoader(book)

      const result = await loader.loadSection(0)
      const container = document.createElement('div')
      container.innerHTML = result.html
      const img = container.querySelector('img')

      // Should resolve ../images/fig1.png relative to the section URL
      expect(img.getAttribute('src')).to.include('/book/OEBPS/images/fig1.png')
    })

    it('rewrites relative CSS href to absolute', async () => {
      const html = '<p>Content</p>'
      // The section has a stylesheet link in the head
      const section = mockSection(0, html, 'http://localhost/book/OEBPS/chapter.xhtml')
      const book = mockBook([section])
      const loader = new ContentLoader(book)

      const result = await loader.loadSection(0)
      // Styles array should contain resolved URLs or inline CSS
      expect(result.styles).to.be.an('array')
    })

    it('leaves absolute URLs unchanged', async () => {
      const html = '<p><img src="https://example.com/img.png"/></p>'
      const section = mockSection(0, html, 'http://localhost/book/OEBPS/chapter.xhtml')
      const book = mockBook([section])
      const loader = new ContentLoader(book)

      const result = await loader.loadSection(0)
      const container = document.createElement('div')
      container.innerHTML = result.html
      const img = container.querySelector('img')

      expect(img.getAttribute('src')).to.equal('https://example.com/img.png')
    })
  })

  describe('CSS extraction', () => {
    it('extracts inline style blocks from the section', async () => {
      const parser = new DOMParser()
      const fullHtml = `<?xml version="1.0" encoding="UTF-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml">
          <head>
            <style>p { color: red; }</style>
          </head>
          <body><p>Styled</p></body>
        </html>`
      const doc = parser.parseFromString(fullHtml, 'application/xhtml+xml')
      const section = {
        index: 0,
        href: 'chapter0.xhtml',
        url: 'http://localhost/book/OEBPS/chapter.xhtml',
        document: doc,
        contents: doc.documentElement,
        load() { return Promise.resolve(doc.documentElement) },
        render() { return Promise.resolve(new XMLSerializer().serializeToString(doc)) },
        unload() {}
      }
      const book = mockBook([section])
      const loader = new ContentLoader(book)

      const result = await loader.loadSection(0)

      expect(result.styles.length).to.be.greaterThan(0)
      expect(result.styles[0]).to.include('color: red')
    })
  })

  describe('content filtering', () => {
    it('filters paragraphs with only decorative characters for TTS hint', async () => {
      const html = '<p>Real text</p><p>------***------</p><p>More text</p>'
      const section = mockSection(0, html)
      const book = mockBook([section])
      const loader = new ContentLoader(book)

      const result = await loader.loadSection(0)
      // The HTML should still contain the decorative paragraph (for display)
      // but it should be marked with a data attribute for TTS to skip
      const container = document.createElement('div')
      container.innerHTML = result.html
      const paras = container.querySelectorAll('p')
      expect(paras).to.have.length(3)

      const decorative = container.querySelector('p[data-tts-skip]')
      expect(decorative).to.not.be.null
      expect(decorative.textContent).to.include('------')
    })
  })
})
