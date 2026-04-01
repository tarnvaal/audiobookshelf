import PositionTracker from '../../../lib/epub-renderer/PositionTracker'

function mockSection(index) {
  return {
    index,
    href: `chapter${index}.xhtml`,
    cfiFromElement(el) {
      // Walk up to find position in body for a deterministic CFI
      const body = el.ownerDocument?.body || el.closest('body')
      if (!body) return null
      const children = Array.from(body.querySelectorAll('*'))
      const pos = children.indexOf(el)
      return `epubcfi(/6/${(index + 1) * 2}!/4/2/${(pos + 1) * 2})`
    },
    cfiFromRange(range) {
      return `epubcfi(/6/${(index + 1) * 2}!/4/2/1:0)`
    }
  }
}

function mockLocations() {
  return {
    total: 100,
    percentageFromCfi(cfi) {
      // Extract spine index from CFI for a rough percentage
      const match = cfi.match(/\/6\/(\d+)/)
      if (!match) return 0
      return parseInt(match[1]) / 20 // rough mapping
    },
    cfiFromPercentage(pct) {
      const spineNum = Math.floor(pct * 20)
      return `epubcfi(/6/${spineNum}!/4/2)`
    },
    locationFromCfi(cfi) {
      const match = cfi.match(/\/6\/(\d+)/)
      if (!match) return 0
      return parseInt(match[1]) * 5
    }
  }
}

function buildContainer(sectionContents) {
  const container = document.createElement('div')
  container.id = 'epub-content'
  container.style.width = '600px'
  container.style.height = '400px'
  container.style.overflow = 'auto'
  container.style.position = 'relative'
  document.body.appendChild(container)

  const sections = []
  sectionContents.forEach((html, i) => {
    const section = document.createElement('section')
    section.setAttribute('data-spine-index', String(i))
    section.setAttribute('data-href', `chapter${i}.xhtml`)
    section.innerHTML = html
    container.appendChild(section)
    sections.push(mockSection(i))
  })

  return { container, sections }
}

describe('PositionTracker', () => {
  let container

  afterEach(() => {
    if (container) {
      container.remove()
      container = null
    }
  })

  describe('getCurrentPosition', () => {
    it('returns spine index and CFI for the first visible element', () => {
      const { container: c, sections } = buildContainer([
        '<p>First paragraph</p><p>Second paragraph</p>',
        '<p>Third paragraph</p>'
      ])
      container = c

      const tracker = new PositionTracker(container, sections, mockLocations())
      const pos = tracker.getCurrentPosition()

      expect(pos).to.have.property('spineIndex')
      expect(pos).to.have.property('cfi')
      expect(pos).to.have.property('percentage')
      expect(pos.spineIndex).to.equal(0)
      expect(pos.cfi).to.be.a('string')
      expect(pos.cfi).to.include('epubcfi')
    })

    it('returns correct spine index when scrolled to second section', () => {
      const { container: c, sections } = buildContainer([
        '<div style="height:800px"><p>Tall first section</p></div>',
        '<p>Second section content</p>'
      ])
      container = c

      // Scroll past the first section entirely
      container.scrollTop = 850

      const tracker = new PositionTracker(container, sections, mockLocations())
      const pos = tracker.getCurrentPosition()

      expect(pos.spineIndex).to.equal(1)
    })
  })

  describe('percentage tracking', () => {
    it('returns a percentage between 0 and 1', () => {
      const { container: c, sections } = buildContainer([
        '<p>Content</p>'
      ])
      container = c

      const tracker = new PositionTracker(container, sections, mockLocations())
      const pos = tracker.getCurrentPosition()

      expect(pos.percentage).to.be.a('number')
      expect(pos.percentage).to.be.at.least(0)
      expect(pos.percentage).to.be.at.most(1)
    })
  })

  describe('getCfiForElement', () => {
    it('generates a CFI for a given DOM element', () => {
      const { container: c, sections } = buildContainer([
        '<p>Target paragraph</p>'
      ])
      container = c

      const tracker = new PositionTracker(container, sections, mockLocations())
      const p = container.querySelector('p')
      const cfi = tracker.getCfiForElement(p)

      expect(cfi).to.be.a('string')
      expect(cfi).to.include('epubcfi')
    })

    it('returns null for elements not in a spine section', () => {
      const { container: c, sections } = buildContainer([
        '<p>Content</p>'
      ])
      container = c

      const tracker = new PositionTracker(container, sections, mockLocations())
      const orphan = document.createElement('p')
      const cfi = tracker.getCfiForElement(orphan)

      expect(cfi).to.be.null
    })
  })

  describe('getPercentageForCfi', () => {
    it('returns percentage from locations', () => {
      const { container: c, sections } = buildContainer([
        '<p>Content</p>'
      ])
      container = c

      const tracker = new PositionTracker(container, sections, mockLocations())
      const pct = tracker.getPercentageForCfi('epubcfi(/6/4!/4/2)')

      expect(pct).to.be.a('number')
      expect(pct).to.be.at.least(0)
    })
  })

  describe('getLocationForCfi', () => {
    it('returns location number from locations', () => {
      const { container: c, sections } = buildContainer([
        '<p>Content</p>'
      ])
      container = c

      const tracker = new PositionTracker(container, sections, mockLocations())
      const loc = tracker.getLocationForCfi('epubcfi(/6/4!/4/2)')

      expect(loc).to.be.a('number')
    })
  })

  describe('findFirstVisibleElement', () => {
    it('returns the first paragraph-level element visible in viewport', () => {
      const { container: c, sections } = buildContainer([
        '<p>First visible</p><p>Second visible</p>'
      ])
      container = c

      const tracker = new PositionTracker(container, sections, mockLocations())
      const el = tracker.findFirstVisibleElement()

      expect(el).to.not.be.null
      expect(el.textContent).to.equal('First visible')
    })
  })

  describe('events', () => {
    it('emits relocated when position changes on scroll', (done) => {
      const tallContent = Array(50).fill('<p>Paragraph.</p>').join('')
      const { container: c, sections } = buildContainer([tallContent])
      container = c

      const tracker = new PositionTracker(container, sections, mockLocations())
      tracker.startTracking()

      tracker.on('relocated', (pos) => {
        expect(pos).to.have.property('cfi')
        expect(pos).to.have.property('percentage')
        tracker.stopTracking()
        done()
      })

      // Trigger scroll
      container.scrollTop = 200
    })
  })
})
