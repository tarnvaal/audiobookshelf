/**
 * Book DNA fingerprinting — compute textual metrics from extracted book text.
 */

/**
 * Compute all fingerprint metrics from full text and chapter texts.
 * @param {string} fullText - complete book text
 * @param {Array<{text: string}>} chapters - per-chapter text
 * @returns {object} metrics
 */
function computeFingerprint(fullText, chapters) {
  const words = tokenize(fullText)
  const totalWords = words.length
  if (totalWords < 100) {
    return null // Not enough text to analyze
  }

  const sentences = splitSentences(fullText)
  const paragraphs = fullText.split(/\n\n+/).filter(p => p.trim().length > 20)

  // 1. Average sentence length
  const avgSentenceLength = sentences.length > 0
    ? words.length / sentences.length
    : 0

  // 2. Vocabulary density (unique words / total words)
  const uniqueWords = new Set(words.map(w => w.toLowerCase()))
  const vocabDensity = uniqueWords.size / totalWords

  // 3. Dialogue ratio
  const dialogueRatio = computeDialogueRatio(fullText)

  // 4. Paragraph length stats
  const paraWordCounts = paragraphs.map(p => tokenize(p).length)
  const paragraphLengthMean = mean(paraWordCounts)
  const paragraphLengthStddev = stddev(paraWordCounts)

  // 5. Pacing variance (action verb density per chapter)
  const pacingPerChapter = chapters.map(ch => {
    const chWords = tokenize(ch.text)
    if (chWords.length < 10) return 0
    const actionCount = chWords.filter(w => ACTION_VERBS.has(w.toLowerCase())).length
    return actionCount / chWords.length
  })
  const pacingVariance = variance(pacingPerChapter)

  // 6. Descriptive density
  const descriptiveWords = words.filter(w => isDescriptiveWord(w.toLowerCase()))
  const descriptiveDensity = descriptiveWords.length / totalWords

  // 7. Average word length
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / totalWords

  // 8. Sentence complexity (words per sentence stddev — varied = complex)
  const sentenceWordCounts = sentences.map(s => tokenize(s).length)
  const sentenceComplexity = stddev(sentenceWordCounts)

  // Distinctive words (top 20 by frequency, excluding stopwords)
  const wordFreq = {}
  for (const w of words) {
    const lw = w.toLowerCase()
    if (STOP_WORDS.has(lw) || lw.length < 3) continue
    wordFreq[lw] = (wordFreq[lw] || 0) + 1
  }
  const distinctiveWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count, tfidf: count / totalWords }))

  return {
    avgSentenceLength: round(avgSentenceLength, 2),
    vocabDensity: round(vocabDensity, 4),
    dialogueRatio: round(dialogueRatio, 4),
    paragraphLengthMean: round(paragraphLengthMean, 2),
    paragraphLengthStddev: round(paragraphLengthStddev, 2),
    pacingVariance: round(pacingVariance, 6),
    descriptiveDensity: round(descriptiveDensity, 4),
    avgWordLength: round(avgWordLength, 2),
    sentenceComplexity: round(sentenceComplexity, 2),
    totalWords,
    totalSentences: sentences.length,
    totalParagraphs: paragraphs.length,
    totalChapters: chapters.length,
    distinctiveWords,
    // 9-dimensional vector for similarity scoring
    vector: [
      avgSentenceLength,
      vocabDensity,
      dialogueRatio,
      paragraphLengthMean,
      paragraphLengthStddev,
      pacingVariance,
      descriptiveDensity,
      avgWordLength,
      sentenceComplexity
    ]
  }
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Normalize vectors across a set of fingerprints using min-max scaling.
 * Returns new vectors (doesn't mutate originals).
 */
function normalizeVectors(fingerprints) {
  if (fingerprints.length < 2) return fingerprints.map(f => ({ ...f }))

  const dim = fingerprints[0].vector.length
  const mins = new Array(dim).fill(Infinity)
  const maxs = new Array(dim).fill(-Infinity)

  for (const f of fingerprints) {
    for (let i = 0; i < dim; i++) {
      if (f.vector[i] < mins[i]) mins[i] = f.vector[i]
      if (f.vector[i] > maxs[i]) maxs[i] = f.vector[i]
    }
  }

  return fingerprints.map(f => ({
    ...f,
    normalizedVector: f.vector.map((v, i) => {
      const range = maxs[i] - mins[i]
      return range > 0 ? (v - mins[i]) / range : 0
    })
  }))
}

// ── Helpers ──

function tokenize(text) {
  return text.split(/\s+/).filter(w => w.length > 0)
}

function splitSentences(text) {
  return text.split(/[.!?]+\s+/).filter(s => s.trim().length > 5)
}

function computeDialogueRatio(text) {
  const dialogueMatches = text.match(/[""\u201C\u201D][^""\u201C\u201D]{2,}[""\u201C\u201D]/g)
  if (!dialogueMatches) return 0
  const dialogueLength = dialogueMatches.reduce((sum, m) => sum + m.length, 0)
  return dialogueLength / text.length
}

function isDescriptiveWord(word) {
  // Suffix-based heuristic for adjectives/adverbs
  const suffixes = ['ly', 'ful', 'ous', 'ive', 'ish', 'less', 'able', 'ible', 'ical', 'eous', 'ious']
  return suffixes.some(s => word.endsWith(s) && word.length > s.length + 2)
}

function mean(arr) {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function variance(arr) {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length
}

function stddev(arr) {
  return Math.sqrt(variance(arr))
}

function round(n, decimals) {
  const f = Math.pow(10, decimals)
  return Math.round(n * f) / f
}

// Common action verbs for pacing analysis
const ACTION_VERBS = new Set([
  'run', 'ran', 'jump', 'jumped', 'hit', 'strike', 'struck', 'fight', 'fought',
  'kill', 'killed', 'die', 'died', 'fall', 'fell', 'throw', 'threw', 'catch',
  'caught', 'grab', 'grabbed', 'push', 'pushed', 'pull', 'pulled', 'cut',
  'slash', 'slashed', 'stab', 'stabbed', 'shoot', 'shot', 'fire', 'fired',
  'charge', 'charged', 'attack', 'attacked', 'defend', 'defended', 'block',
  'blocked', 'dodge', 'dodged', 'flee', 'fled', 'chase', 'chased', 'rush',
  'rushed', 'crash', 'crashed', 'slam', 'slammed', 'smash', 'smashed',
  'explode', 'exploded', 'burst', 'shatter', 'shattered', 'break', 'broke',
  'tear', 'tore', 'rip', 'ripped', 'scream', 'screamed', 'shout', 'shouted',
  'cry', 'cried', 'yell', 'yelled', 'roar', 'roared', 'sprint', 'sprinted',
  'leap', 'leapt', 'dive', 'dived', 'climb', 'climbed', 'swing', 'swung',
  'kick', 'kicked', 'punch', 'punched', 'wrestle', 'wrestled', 'drag', 'dragged',
  'seize', 'seized', 'snatch', 'snatched', 'hurl', 'hurled', 'launch', 'launched'
])

// Common English stopwords
const STOP_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for',
  'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his',
  'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my',
  'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
  'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like',
  'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your',
  'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look',
  'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two',
  'how', 'our', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give',
  'day', 'most', 'us', 'was', 'were', 'had', 'has', 'been', 'did', 'are', 'is',
  'am', 'said', 'more', 'very', 'well', 'still', 'own', 'may', 'much', 'too'
])

module.exports = { computeFingerprint, cosineSimilarity, normalizeVectors }
