const StreamZip = require('../libs/nodeStreamZip')
const path = require('path')

/**
 * Extract full text from an epub file by reading the ZIP directly.
 * Returns { chapters: [{ title, text }], fullText: string, totalWords: number }
 */
async function extractEpubText(epubPath) {
  const zip = new StreamZip.async({ file: epubPath })

  try {
    // 1. Find the OPF file via container.xml
    const containerXml = await zip.entryData('META-INF/container.xml')
    const containerStr = containerXml.toString('utf8')
    const opfMatch = containerStr.match(/full-path="([^"]+)"/)
    if (!opfMatch) throw new Error('Could not find OPF path in container.xml')
    const opfPath = opfMatch[1]
    const opfDir = path.dirname(opfPath)

    // 2. Parse the OPF for manifest and spine
    const opfData = await zip.entryData(opfPath)
    const opfStr = opfData.toString('utf8')

    // Extract manifest items (id -> href mapping)
    const manifest = {}
    const itemRegex = /<item\s+[^>]*id="([^"]*)"[^>]*href="([^"]*)"[^>]*(?:media-type="([^"]*)")?[^>]*\/?>/g
    let match
    while ((match = itemRegex.exec(opfStr)) !== null) {
      manifest[match[1]] = {
        href: match[2],
        mediaType: match[3] || ''
      }
    }
    // Also catch items where media-type comes before href
    const itemRegex2 = /<item\s+[^>]*media-type="([^"]*)"[^>]*href="([^"]*)"[^>]*id="([^"]*)"[^>]*\/?>/g
    while ((match = itemRegex2.exec(opfStr)) !== null) {
      if (!manifest[match[3]]) {
        manifest[match[3]] = { href: match[2], mediaType: match[1] }
      }
    }

    // Extract spine order (list of idrefs)
    const spineItems = []
    const spineRegex = /<itemref\s+[^>]*idref="([^"]*)"[^>]*\/?>/g
    while ((match = spineRegex.exec(opfStr)) !== null) {
      spineItems.push(match[1])
    }

    // 3. Extract text from each spine item
    const chapters = []
    for (const idref of spineItems) {
      const item = manifest[idref]
      if (!item) continue
      // Only process HTML/XHTML content
      if (item.mediaType && !item.mediaType.includes('html') && !item.mediaType.includes('xml')) continue

      const filePath = opfDir ? `${opfDir}/${item.href}` : item.href
      try {
        const data = await zip.entryData(filePath)
        const html = data.toString('utf8')
        const text = stripHtmlTags(html)
        if (text.trim().length > 0) {
          chapters.push({ href: item.href, text: text.trim() })
        }
      } catch (e) {
        // Skip missing entries
      }
    }

    const fullText = chapters.map(c => c.text).join('\n\n')
    const totalWords = fullText.split(/\s+/).filter(w => w.length > 0).length

    return { chapters, fullText, totalWords }
  } finally {
    await zip.close()
  }
}

/**
 * Strip HTML tags and decode common entities.
 */
function stripHtmlTags(html) {
  // Remove everything inside <head>...</head>
  let text = html.replace(/<head[\s>][\s\S]*?<\/head>/gi, '')
  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, ' ')
  // Decode common entities
  text = text.replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim()
  // Restore paragraph breaks (approximate from block elements)
  return text
}

module.exports = { extractEpubText }
