<template>
  <div v-if="show" id="reader" :data-theme="ereaderTheme" class="group absolute top-0 left-0 w-full h-full z-60 flex data-[theme=dark]:bg-primary data-[theme=dark]:text-white data-[theme=light]:bg-white data-[theme=light]:text-black data-[theme=sepia]:bg-[rgb(244,236,216)] data-[theme=sepia]:text-[#5b4636]" :class="{ 'reader-player-open': !!streamLibraryItem }">
    <!-- Book content area -->
    <div class="flex-1 relative min-w-0 h-full">
    <div class="absolute top-4 left-4 z-20 flex items-center">
      <button v-if="isEpub" @click="toggleToC" type="button" aria-label="Table of contents menu" class="inline-flex opacity-80 hover:opacity-100">
        <span class="material-symbols text-2xl">menu</span>
      </button>
      <button v-if="hasSettings" @click="openSettings" type="button" aria-label="Ereader settings" class="mx-4 inline-flex opacity-80 hover:opacity-100">
        <span class="material-symbols text-1.5xl">settings</span>
      </button>
      <button v-if="isEpub" @click="toggleBookmarkCurrent" type="button" aria-label="Bookmark this page" class="inline-flex opacity-80 hover:opacity-100">
        <span class="material-symbols text-1.5xl" :class="isCurrentPageBookmarked ? 'fill text-yellow-400' : ''">bookmark</span>
      </button>
      <button v-if="isEpub && ebookBookmarks.length" @click="toggleBookmarksPanel" type="button" aria-label="View bookmarks" class="ml-2 inline-flex opacity-80 hover:opacity-100">
        <span class="material-symbols text-1.5xl">bookmarks</span>
        <span class="text-xs ml-0.5 mt-1">{{ ebookBookmarks.length }}</span>
      </button>
      <button v-if="isEpub" @click="ttsToggle" type="button" aria-label="Read aloud" class="ml-4 inline-flex opacity-80 hover:opacity-100" :title="ttsPlaying ? 'Stop reading' : 'Read aloud'">
        <span class="material-symbols text-1.5xl" :class="ttsPlaying ? 'text-blue-400' : ''">{{ ttsPlaying ? 'stop' : 'play_arrow' }}</span>
      </button>
      <div v-if="ttsPlaying || ttsPaused" class="ml-1 flex items-center gap-1">
        <button @click="ttsPauseResume" type="button" class="inline-flex opacity-80 hover:opacity-100" :title="ttsPaused ? 'Resume' : 'Pause'">
          <span class="material-symbols text-1.5xl">{{ ttsPaused ? 'play_arrow' : 'pause' }}</span>
        </button>
        <button @click="ttsSkip" type="button" class="inline-flex opacity-80 hover:opacity-100" title="Skip paragraph">
          <span class="material-symbols text-1.5xl">skip_next</span>
        </button>
        <select v-model.number="ttsSpeed" @change="saveTtsSettings" class="text-xs bg-transparent border border-gray-600/40 rounded px-1 py-0.5 opacity-80">
          <option v-for="s in [0.5, 0.75, 1, 1.25, 1.5, 2]" :key="s" :value="s">{{ s }}x</option>
        </select>
      </div>
      <button v-if="isEpub" @click="toggleChatPanel" type="button" aria-label="Chat about book" class="ml-4 inline-flex opacity-80 hover:opacity-100">
        <span class="material-symbols text-1.5xl">chat</span>
      </button>
    </div>

    <div class="absolute top-4 left-1/2 transform -translate-x-1/2">
      <h1 :data-type="ebookType" class="text-lg sm:text-xl md:text-2xl mb-1 data-[type=comic]:hidden" style="line-height: 1.15; font-weight: 100">
        <span style="font-weight: 600">{{ abTitle }}</span>
        <span v-if="abAuthor" class="hidden md:inline"> – </span>
        <span v-if="abAuthor" class="hidden md:inline">{{ abAuthor }}</span>
      </h1>
    </div>

    <div class="absolute top-4 right-4 z-20">
      <button @click="close" type="button" aria-label="Close ereader" class="inline-flex opacity-80 hover:opacity-100">
        <span class="material-symbols text-2xl">close</span>
      </button>
    </div>

    <component v-if="componentName" ref="readerComponent" :is="componentName" :library-item="selectedLibraryItem" :player-open="!!streamLibraryItem" :keep-progress="keepProgress" :file-id="ebookFileId" @touchstart="touchstart" @touchend="touchend" @hook:mounted="readerMounted" @reading-status="onReadingStatus" @bookmarks-updated="onBookmarksUpdated" @tts-start-from="ttsStartFrom" />

    <!-- Reading status bar -->
    <div v-if="readingStatus && isEpub" class="absolute bottom-0 left-0 w-full z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" :class="ereaderTheme === 'dark' ? 'bg-primary/90 text-gray-400' : ereaderTheme === 'sepia' ? 'bg-[rgb(230,222,202)]/90 text-[#5b4636]/70' : 'bg-white/90 text-gray-500'">
      <div class="w-full h-0.5 bg-gray-700">
        <div class="h-full bg-blue-500/60 transition-all duration-300" :style="{ width: Math.round(readingStatus.percentage * 100) + '%' }"></div>
      </div>
      <div class="flex items-center justify-between px-4 py-1.5 text-xs">
        <span v-if="readingStatus.chapter" class="truncate max-w-[40%]">{{ readingStatus.chapter }}</span>
        <span v-else></span>
        <div class="flex items-center gap-4 shrink-0">
          <span v-if="readingStatus.sessionMinutes > 0">{{ readingStatus.sessionMinutes }}m this session</span>
          <span v-if="readingStatus.etaMinutes != null">{{ formatEta(readingStatus.etaMinutes) }} left</span>
          <span>{{ Math.round(readingStatus.percentage * 100) }}%</span>
          <span v-if="readingStatus.totalLocations">Loc {{ readingStatus.location }} / {{ readingStatus.totalLocations }}</span>
        </div>
      </div>
    </div>

    <!-- TOC side nav -->
    <div v-if="tocOpen" class="w-full h-full overflow-y-scroll absolute inset-0 bg-black/20 z-20" @click.stop.prevent="toggleToC"></div>
    <div
      v-if="isEpub"
      class="w-96 h-full max-h-full absolute top-0 left-0 shadow-xl transition-transform z-30 group-data-[theme=dark]:bg-primary group-data-[theme=dark]:text-white group-data-[theme=light]:bg-white group-data-[theme=light]:text-black group-data-[theme=sepia]:bg-[rgb(244,236,216)] group-data-[theme=sepia]:text-[#5b4636]"
      :class="tocOpen ? 'translate-x-0' : '-translate-x-96'"
      @click.stop.prevent
    >
      <div class="flex flex-col p-4 h-full">
        <div class="flex items-center mb-2">
          <button @click.stop.prevent="toggleToC" type="button" aria-label="Close table of contents" class="inline-flex opacity-80 hover:opacity-100">
            <span class="material-symbols text-2xl">arrow_back</span>
          </button>

          <p class="text-lg font-semibold ml-2">{{ $strings.HeaderTableOfContents }}</p>
        </div>
        <form @submit.prevent="searchBook" @click.stop.prevent>
          <ui-text-input clearable ref="input" @clear="searchBook" v-model="searchQuery" :placeholder="$strings.PlaceholderSearch" custom-input-class="text-inherit !bg-inherit" class="h-8 w-full text-sm flex mb-2" />
        </form>

        <div class="overflow-y-auto">
          <div v-if="isSearching && !this.searchResults.length" class="w-full h-40 justify-center">
            <p class="text-center text-xl py-4">{{ $strings.MessageNoResults }}</p>
          </div>

          <ul>
            <li v-for="chapter in isSearching ? this.searchResults : chapters" :key="chapter.id" class="py-1">
              <a :href="chapter.href" class="opacity-80 hover:opacity-100" @click.prevent="goToChapter(chapter.href)">{{ chapter.title }}</a>
              <div v-for="searchResults in chapter.searchResults" :key="searchResults.cfi" class="text-sm py-1 pl-4">
                <a :href="searchResults.cfi" class="opacity-50 hover:opacity-100" @click.prevent="goToChapter(searchResults.cfi)">{{ searchResults.excerpt }}</a>
              </div>

              <ul v-if="chapter.subitems.length">
                <li v-for="subchapter in chapter.subitems" :key="subchapter.id" class="py-1 pl-4">
                  <a :href="subchapter.href" class="opacity-80 hover:opacity-100" @click.prevent="goToChapter(subchapter.href)">{{ subchapter.title }}</a>
                  <div v-for="subChapterSearchResults in subchapter.searchResults" :key="subChapterSearchResults.cfi" class="text-sm py-1 pl-4">
                    <a :href="subChapterSearchResults.cfi" class="opacity-50 hover:opacity-100" @click.prevent="goToChapter(subChapterSearchResults.cfi)">{{ subChapterSearchResults.excerpt }}</a>
                  </div>
                </li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Bookmarks panel (right side) -->
    <div v-if="bookmarksPanelOpen && isEpub" class="w-80 h-full max-h-full absolute top-0 right-0 shadow-xl z-30 group-data-[theme=dark]:bg-primary group-data-[theme=dark]:text-white group-data-[theme=light]:bg-white group-data-[theme=light]:text-black group-data-[theme=sepia]:bg-[rgb(244,236,216)] group-data-[theme=sepia]:text-[#5b4636]">
      <div class="flex flex-col p-4 h-full">
        <div class="flex items-center mb-3">
          <button @click="toggleBookmarksPanel" type="button" class="inline-flex opacity-80 hover:opacity-100">
            <span class="material-symbols text-2xl">close</span>
          </button>
          <p class="text-lg font-semibold ml-2">Bookmarks</p>
        </div>
        <div v-if="!ebookBookmarks.length" class="text-sm opacity-60 py-4 text-center">No bookmarks yet</div>
        <div class="overflow-y-auto flex-1">
          <div v-for="(bm, idx) in ebookBookmarks" :key="idx" class="flex items-start justify-between py-2 border-b border-gray-700/30 cursor-pointer hover:opacity-80" @click="goToBookmark(bm.cfi)">
            <div class="flex-1 min-w-0">
              <p class="text-sm truncate">{{ bm.label }}</p>
              <p class="text-xs opacity-50">{{ Math.round(bm.percentage * 100) }}%</p>
            </div>
            <button @click.stop="removeBookmark(bm.cfi)" class="ml-2 opacity-50 hover:opacity-100 shrink-0">
              <span class="material-symbols text-sm">delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ereader settings modal -->
    <modals-modal v-model="showSettings" name="ereader-settings-modal" :width="500" :height="'unset'" :processing="false">
      <template #outer>
        <div class="absolute top-0 left-0 p-5 w-3/4 overflow-hidden">
          <p class="text-xl md:text-3xl text-white truncate">{{ $strings.HeaderEreaderSettings }}</p>
        </div>
      </template>
      <div class="px-2 py-4 md:p-8 w-full text-base rounded-lg bg-bg shadow-lg border border-black-300 relative overflow-x-hidden overflow-y-auto" style="max-height: 80vh">
        <div class="flex items-center mb-4">
          <div class="w-40">
            <p class="text-lg">{{ $strings.LabelTheme }}:</p>
          </div>
          <ui-toggle-btns v-model="ereaderSettings.theme" :items="themeItems.theme" @input="settingsUpdated" />
        </div>
        <div class="flex items-center mb-4">
          <div class="w-40">
            <p class="text-lg">{{ $strings.LabelFontFamily }}:</p>
          </div>
          <ui-toggle-btns v-model="ereaderSettings.font" :items="themeItems.font" @input="settingsUpdated" />
        </div>
        <div class="flex items-center mb-4">
          <div class="w-40">
            <p class="text-lg">{{ $strings.LabelFontScale }}:</p>
          </div>
          <ui-range-input v-model="ereaderSettings.fontScale" :min="5" :max="300" :step="5" @input="settingsUpdated" />
        </div>
        <div class="flex items-center mb-4">
          <div class="w-40">
            <p class="text-lg">{{ $strings.LabelLineSpacing }}:</p>
          </div>
          <ui-range-input v-model="ereaderSettings.lineSpacing" :min="100" :max="300" :step="5" @input="settingsUpdated" />
        </div>
        <div class="flex items-center mb-4">
          <div class="w-40">
            <p class="text-lg">{{ $strings.LabelFontBoldness }}:</p>
          </div>
          <ui-range-input v-model="ereaderSettings.textStroke" :min="0" :max="300" :step="5" @input="settingsUpdated" />
        </div>
        <div class="flex items-center mb-4">
          <div class="w-40">
            <p class="text-lg">Text align:</p>
          </div>
          <ui-toggle-btns v-model="ereaderSettings.textAlign" :items="themeItems.textAlign" @input="settingsUpdated" />
        </div>
        <div class="flex items-center mb-4">
          <div class="w-40">
            <p class="text-lg">Column width:</p>
          </div>
          <ui-range-input v-model="ereaderSettings.maxWidth" :min="30" :max="100" :step="5" @input="settingsUpdated" />
        </div>
        <div class="flex items-center">
          <div class="w-40">
            <p class="text-lg">{{ $strings.LabelLayout }}:</p>
          </div>
          <ui-toggle-btns v-model="ereaderSettings.spread" :items="spreadItems" @input="settingsUpdated" />
        </div>
      </div>
    </modals-modal>
    </div><!-- end book content area -->

    <!-- Chat panel (sidebar or fullscreen) -->
    <div v-if="chatPanelOpen && isEpub"
      :class="chatFullscreen
        ? 'absolute inset-0 z-40 flex flex-col group-data-[theme=dark]:bg-primary group-data-[theme=dark]:text-white group-data-[theme=light]:bg-white group-data-[theme=light]:text-black group-data-[theme=sepia]:bg-[rgb(244,236,216)] group-data-[theme=sepia]:text-[#5b4636]'
        : 'w-[420px] h-full shrink-0 flex flex-col border-l border-gray-700/30 group-data-[theme=dark]:bg-primary group-data-[theme=dark]:text-white group-data-[theme=light]:bg-white group-data-[theme=light]:text-black group-data-[theme=sepia]:bg-[rgb(244,236,216)] group-data-[theme=sepia]:text-[#5b4636]'"
      >
      <!-- Header -->
      <div class="flex items-center justify-between p-3 border-b border-gray-700/30 shrink-0">
        <div class="flex items-center gap-2">
          <button @click="toggleChatPanel" type="button" class="inline-flex opacity-80 hover:opacity-100">
            <span class="material-symbols text-xl">close</span>
          </button>
          <span class="text-sm font-semibold">Chat</span>
        </div>
        <div class="flex items-center gap-3">
          <button @click="chatFullscreen = !chatFullscreen" type="button" class="inline-flex opacity-60 hover:opacity-100" :title="chatFullscreen ? 'Sidebar' : 'Fullscreen'">
            <span class="material-symbols text-lg">{{ chatFullscreen ? 'close_fullscreen' : 'open_in_full' }}</span>
          </button>
          <button @click="clearChat" type="button" class="text-xs opacity-60 hover:opacity-100">Clear</button>
        </div>
      </div>

      <!-- Model + context selector -->
      <div class="p-2 border-b border-gray-700/30 shrink-0 space-y-2">
        <div class="flex items-center gap-2">
          <label class="text-xs opacity-60 shrink-0">Model:</label>
          <select v-model="chatModel" class="text-xs bg-transparent border border-gray-600/40 rounded px-1 py-0.5 flex-1 min-w-0">
            <option v-for="m in ollamaModels" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
        <div class="flex items-center gap-1">
          <label class="text-xs opacity-60 shrink-0">Context:</label>
          <button v-for="ctx in contextModes" :key="ctx.value"
            @click="chatContext = ctx.value"
            class="text-xs px-2 py-0.5 rounded border"
            :class="chatContext === ctx.value ? 'border-blue-500 text-blue-400' : 'border-gray-600/40 opacity-60 hover:opacity-100'">
            {{ ctx.label }}
          </button>
        </div>
        <!-- Range selector -->
        <div v-if="chatContext === 'range' && rangeChapters.length" class="mt-2 space-y-1">
          <!-- Visual bar with chapter markers -->
          <div class="relative h-6 bg-gray-700/30 rounded overflow-hidden cursor-pointer" @mousedown="onRangeBarClick">
            <div v-for="(ch, i) in rangeChapters" :key="i"
              class="absolute top-0 h-full border-l border-gray-500/30"
              :style="{ left: (ch.pct * 100) + '%' }"
              :title="ch.title">
            </div>
            <!-- Selected range highlight -->
            <div class="absolute top-0 h-full bg-blue-500/30"
              :style="{ left: (rangeStart) + '%', width: (rangeEnd - rangeStart) + '%' }">
            </div>
          </div>
          <!-- Dual range sliders -->
          <div class="flex items-center gap-2">
            <input type="range" v-model.number="rangeStart" :min="0" :max="100" :step="1"
              class="flex-1 h-1 accent-blue-500" @input="onRangeChange" />
            <span class="text-xs opacity-60 w-10 text-center">{{ rangeStart }}%</span>
          </div>
          <div class="flex items-center gap-2">
            <input type="range" v-model.number="rangeEnd" :min="0" :max="100" :step="1"
              class="flex-1 h-1 accent-blue-500" @input="onRangeChange" />
            <span class="text-xs opacity-60 w-10 text-center">{{ rangeEnd }}%</span>
          </div>
          <!-- Token budget indicator -->
          <div v-if="tokenBudgetPct != null" class="flex items-center gap-2">
            <div class="flex-1 h-1.5 bg-gray-700/30 rounded overflow-hidden">
              <div class="h-full rounded transition-all" :class="tokenBudgetPct > 90 ? 'bg-red-500' : tokenBudgetPct > 70 ? 'bg-yellow-500' : 'bg-green-500'"
                :style="{ width: Math.min(tokenBudgetPct, 100) + '%' }"></div>
            </div>
            <span class="text-xs opacity-40">{{ tokenBudgetPct > 100 ? 'Over budget' : tokenBudgetPct + '% ctx' }}</span>
          </div>
        </div>
        <div v-if="chatContextPreview" class="text-xs opacity-40 truncate">{{ chatContextPreview }}</div>
      </div>

      <!-- Messages -->
      <div ref="chatMessages" class="flex-1 overflow-y-auto p-3 space-y-3" :class="chatFullscreen ? 'max-w-3xl mx-auto w-full' : ''">
        <div v-for="(msg, idx) in chatMessages" :key="idx" class="text-sm">
          <div v-if="msg.role === 'user'" class="flex justify-end">
            <div class="bg-blue-600/20 rounded-lg px-3 py-2 max-w-[85%]">
              <p class="whitespace-pre-wrap">{{ msg.content }}</p>
            </div>
          </div>
          <div v-else class="flex justify-start">
            <div class="bg-gray-600/20 rounded-lg px-3 py-2 max-w-[85%] chat-markdown" v-html="renderMarkdown(msg.content)">
            </div>
          </div>
        </div>
        <div v-if="chatLoading" class="flex justify-start">
          <div class="bg-gray-600/20 rounded-lg px-3 py-2">
            <span class="text-sm opacity-60">Thinking...</span>
          </div>
        </div>
      </div>

      <!-- Input -->
      <div class="p-2 border-t border-gray-700/30 shrink-0" :class="chatFullscreen ? 'max-w-3xl mx-auto w-full' : ''">
        <form @submit.prevent="sendChat" class="flex gap-2">
          <input v-model="chatInput" type="text" placeholder="Ask about the book..."
            class="flex-1 text-sm bg-transparent border border-gray-600/40 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
            :disabled="chatLoading" />
          <button type="submit" :disabled="chatLoading || !chatInput.trim() || !chatModel"
            class="px-3 py-1.5 text-sm bg-blue-600/30 rounded hover:bg-blue-600/50 disabled:opacity-30">
            <span class="material-symbols text-lg">send</span>
          </button>
        </form>
      </div>
    </div>

  </div>
</template>

<script>
export default {
  data() {
    return {
      touchstartX: 0,
      touchstartY: 0,
      touchendX: 0,
      touchendY: 0,
      touchstartTime: 0,
      touchIdentifier: null,
      chapters: [],
      isSearching: false,
      searchResults: [],
      searchQuery: '',
      tocOpen: false,
      showSettings: false,
      readingStatus: null,
      ebookBookmarks: [],
      bookmarksPanelOpen: false,
      chatPanelOpen: false,
      chatFullscreen: false,
      chatMessages: [],
      chatInput: '',
      chatLoading: false,
      chatModel: '',
      chatContext: 'page',
      ollamaModels: [],
      modelContextLength: null,
      rangeStart: 0,
      rangeEnd: 10,
      rangeChapters: [],
      rangePreviewLength: 0,
      // TTS state
      ttsPlaying: false,
      ttsPaused: false,
      ttsParagraphs: [],
      ttsCurrentIndex: 0,
      ttsAudio: null,
      ttsSpeed: 1,
      ttsVoice: 'af_bella',
      ttsAbortController: null,
      ttsClickMode: false,
      ttsBuffer: {},         // { [index]: { blob, url } } — prefetched audio
      ttsBufferPending: {},  // { [index]: Promise } — in-flight fetches
      ttsBufferAhead: 3,     // how many paragraphs to prefetch
      ereaderSettings: {
        theme: 'dark',
        font: 'serif',
        fontScale: 100,
        lineSpacing: 115,
        fontBoldness: 100,
        spread: 'auto',
        textStroke: 0,
        maxWidth: 70,
        textAlign: 'justify'
      }
    }
  },
  watch: {
    show(newVal) {
      if (newVal) {
        this.init()
      }
    },
    chatModel() {
      this.loadModelInfo()
    },
    chatContext(val) {
      if (val === 'range') this.loadRangeChapters()
    }
  },
  computed: {
    show: {
      get() {
        return this.$store.state.showEReader
      },
      set(val) {
        this.$store.commit('setShowEReader', val)
      }
    },
    ereaderTheme() {
      if (this.isEpub) return this.ereaderSettings.theme
      return 'dark'
    },
    contextModes() {
      return [
        { label: 'Page', value: 'page' },
        { label: 'Chapter', value: 'chapter' },
        { label: 'Selection', value: 'selection' },
        { label: 'Range', value: 'range' }
      ]
    },
    estimatedTokens() {
      return Math.round(this.rangePreviewLength / 4)
    },
    tokenBudgetPct() {
      if (!this.modelContextLength) return null
      // Reserve ~2k tokens for system prompt + conversation
      const available = this.modelContextLength - 2000
      return Math.min(100, Math.round((this.estimatedTokens / available) * 100))
    },
    chatContextPreview() {
      if (this.chatContext === 'page') return 'Sending current visible text'
      if (this.chatContext === 'chapter') return `Sending full chapter: ${this.readingStatus?.chapter || 'unknown'}`
      if (this.chatContext === 'selection') return 'Sending selected text (highlight text first)'
      if (this.chatContext === 'range') {
        const tokens = this.estimatedTokens
        const budget = this.tokenBudgetPct
        let info = `~${tokens.toLocaleString()} tokens`
        if (budget != null) info += ` (${budget}% of context window)`
        return info
      }
      return ''
    },
    isCurrentPageBookmarked() {
      if (!this.readingStatus?.currentCfi || !this.ebookBookmarks.length) return false
      return this.ebookBookmarks.some(b => b.cfi === this.readingStatus.currentCfi)
    },
    spreadItems() {
      return [
        {
          text: this.$strings.LabelLayoutSinglePage,
          value: 'none'
        },
        {
          text: this.$strings.LabelLayoutSplitPage,
          value: 'auto'
        },
        {
          text: 'Continuous',
          value: 'continuous'
        }
      ]
    },
    themeItems() {
      return {
        theme: [
          {
            text: this.$strings.LabelThemeDark,
            value: 'dark'
          },
          {
            text: this.$strings.LabelThemeSepia,
            value: 'sepia'
          },
          {
            text: this.$strings.LabelThemeLight,
            value: 'light'
          }
        ],
        font: [
          {
            text: 'Sans',
            value: 'sans-serif'
          },
          {
            text: 'Serif',
            value: 'serif'
          },
          {
            text: 'Georgia',
            value: 'Georgia, serif'
          },
          {
            text: 'Literata',
            value: 'Literata, serif'
          },
          {
            text: 'OpenDyslexic',
            value: 'OpenDyslexic, sans-serif'
          }
        ],
        textAlign: [
          {
            text: 'Justify',
            value: 'justify'
          },
          {
            text: 'Left',
            value: 'left'
          }
        ]
      }
    },
    componentName() {
      if (this.ebookType === 'epub') return 'readers-epub-reader'
      else if (this.ebookType === 'mobi') return 'readers-mobi-reader'
      else if (this.ebookType === 'pdf') return 'readers-pdf-reader'
      else if (this.ebookType === 'comic') return 'readers-comic-reader'
      return null
    },
    streamLibraryItem() {
      return this.$store.state.streamLibraryItem
    },
    hasSettings() {
      return this.isEpub
    },
    abTitle() {
      return this.mediaMetadata.title
    },
    abAuthor() {
      return this.mediaMetadata.authorName
    },
    selectedLibraryItem() {
      return this.$store.state.selectedLibraryItem || {}
    },
    media() {
      return this.selectedLibraryItem.media || {}
    },
    mediaMetadata() {
      return this.media.metadata || {}
    },
    libraryId() {
      return this.selectedLibraryItem.libraryId
    },
    folderId() {
      return this.selectedLibraryItem.folderId
    },
    ebookFile() {
      // ebook file id is passed when reading a supplementary ebook
      if (this.ebookFileId) {
        return this.selectedLibraryItem.libraryFiles.find((lf) => lf.ino === this.ebookFileId)
      }
      return this.media.ebookFile
    },
    ebookFormat() {
      if (!this.ebookFile) return null
      // Use file extension for supplementary ebook
      if (!this.ebookFile.ebookFormat) {
        return this.ebookFile.metadata.ext.toLowerCase().slice(1)
      }
      return this.ebookFile.ebookFormat
    },
    ebookType() {
      if (this.isMobi) return 'mobi'
      else if (this.isEpub) return 'epub'
      else if (this.isPdf) return 'pdf'
      else if (this.isComic) return 'comic'
      return null
    },
    isEpub() {
      return this.ebookFormat == 'epub'
    },
    isMobi() {
      return this.ebookFormat == 'mobi' || this.ebookFormat == 'azw3'
    },
    isPdf() {
      return this.ebookFormat == 'pdf'
    },
    isComic() {
      return this.ebookFormat == 'cbz' || this.ebookFormat == 'cbr'
    },
    keepProgress() {
      return this.$store.state.ereaderKeepProgress
    },
    ebookFileId() {
      return this.$store.state.ereaderFileId
    },
    isDarkTheme() {
      return this.ereaderSettings.theme === 'dark'
    }
  },
  methods: {
    goToChapter(uri) {
      this.toggleToC()
      this.$refs.readerComponent.goToChapter(uri)
    },
    readerMounted() {
      if (this.isEpub) {
        this.loadEreaderSettings()
      }
    },
    settingsUpdated() {
      this.$refs.readerComponent?.updateSettings?.(this.ereaderSettings)
      localStorage.setItem('ereaderSettings', JSON.stringify(this.ereaderSettings))
    },
    onReadingStatus(status) {
      this.readingStatus = status
    },
    onBookmarksUpdated(bookmarks) {
      this.ebookBookmarks = bookmarks || []
    },
    toggleBookmarkCurrent() {
      if (!this.readingStatus?.currentCfi) return
      const cfi = this.readingStatus.currentCfi
      if (this.isCurrentPageBookmarked) {
        this.$refs.readerComponent?.removeBookmark?.(cfi)
      } else {
        this.$refs.readerComponent?.addBookmark?.(cfi)
      }
    },
    toggleBookmarksPanel() {
      this.bookmarksPanelOpen = !this.bookmarksPanelOpen
    },
    goToBookmark(cfi) {
      this.$refs.readerComponent?.goToBookmark?.(cfi)
      this.bookmarksPanelOpen = false
    },
    removeBookmark(cfi) {
      this.$refs.readerComponent?.removeBookmark?.(cfi)
    },
    formatEta(minutes) {
      if (minutes == null) return ''
      if (minutes < 60) return `${minutes}m`
      const h = Math.floor(minutes / 60)
      const m = minutes % 60
      return m > 0 ? `${h}h ${m}m` : `${h}h`
    },
    toggleChatPanel() {
      this.chatPanelOpen = !this.chatPanelOpen
      if (this.chatPanelOpen && !this.ollamaModels.length) {
        this.loadOllamaModels()
      }
      if (this.chatPanelOpen) {
        this.loadChatHistory()
      }
      // Trigger reader resize after DOM updates
      this.$nextTick(() => {
        this.$refs.readerComponent?.resize?.()
      })
    },
    async loadOllamaModels() {
      try {
        const resp = await this.$axios.$get('/api/ollama/tags')
        this.ollamaModels = (resp.models || []).map(m => m.name)
        if (this.ollamaModels.length && !this.chatModel) {
          const saved = localStorage.getItem('ebookChatModel')
          this.chatModel = saved && this.ollamaModels.includes(saved) ? saved : this.ollamaModels[0]
        }
        if (this.chatModel) this.loadModelInfo()
      } catch (e) {
        console.error('Failed to load Ollama models:', e)
        this.ollamaModels = []
      }
    },
    async loadModelInfo() {
      if (!this.chatModel) return
      try {
        const resp = await this.$axios.$post('/api/ollama/show', { model: this.chatModel })
        this.modelContextLength = resp.model_info?.['llama.context_length']
          || resp.model_info?.['context_length']
          || null
      } catch (e) {
        this.modelContextLength = null
      }
    },
    loadRangeChapters() {
      const reader = this.$refs.readerComponent
      if (!reader?.chapters?.length) return
      this.rangeChapters = reader.chapters.map(ch => ({
        title: ch.title,
        pct: ch.start || 0
      }))
      // Set range end to current reading position
      if (this.readingStatus?.percentage) {
        this.rangeEnd = Math.round(this.readingStatus.percentage * 100)
      }
      this.onRangeChange()
    },
    async onRangeChange() {
      // Clamp
      if (this.rangeStart >= this.rangeEnd) this.rangeStart = Math.max(0, this.rangeEnd - 1)
      // Estimate text length for the selected range
      const reader = this.$refs.readerComponent
      if (!reader?.book) return
      const spine = reader.book.spine
      if (!spine) return
      // Rough estimate: total spine items, figure out which fall in range
      let totalChars = 0
      const startPct = this.rangeStart / 100
      const endPct = this.rangeEnd / 100
      const totalItems = spine.items?.length || spine.length || 0
      const startIdx = Math.floor(startPct * totalItems)
      const endIdx = Math.ceil(endPct * totalItems)
      // Estimate ~3000 chars per spine item on average
      totalChars = (endIdx - startIdx) * 3000
      this.rangePreviewLength = totalChars
    },
    onRangeBarClick(e) {
      const rect = e.target.getBoundingClientRect()
      const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100)
      // Move whichever handle is closer
      const distStart = Math.abs(pct - this.rangeStart)
      const distEnd = Math.abs(pct - this.rangeEnd)
      if (distStart < distEnd) {
        this.rangeStart = pct
      } else {
        this.rangeEnd = pct
      }
      this.onRangeChange()
    },
    loadChatHistory() {
      const itemId = this.selectedLibraryItem?.id
      if (!itemId) return
      try {
        const data = localStorage.getItem(`ebookChat-${itemId}`)
        this.chatMessages = data ? JSON.parse(data) : []
      } catch (e) {
        this.chatMessages = []
      }
    },
    saveChatHistory() {
      const itemId = this.selectedLibraryItem?.id
      if (!itemId) return
      localStorage.setItem(`ebookChat-${itemId}`, JSON.stringify(this.chatMessages))
    },
    clearChat() {
      this.chatMessages = []
      this.saveChatHistory()
    },
    async sendChat() {
      const query = this.chatInput.trim()
      if (!query || !this.chatModel) return

      // Get context text from the reader
      const contextText = await this.getChatContext()
      if (!contextText && this.chatContext === 'selection') {
        this.chatMessages.push({ role: 'assistant', content: 'No text selected. Highlight some text in the reader first.' })
        return
      }

      this.chatInput = ''
      this.chatMessages.push({ role: 'user', content: query })
      this.chatLoading = true
      this.scrollChatToBottom()

      // Save selected model
      localStorage.setItem('ebookChatModel', this.chatModel)

      // Build messages for Ollama
      const systemMsg = {
        role: 'system',
        content: `You are a reading companion helping discuss a book. The user is reading "${this.abTitle}"${this.abAuthor ? ` by ${this.abAuthor}` : ''}. Answer questions about the text provided. Be concise and direct.`
      }
      const contextMsg = contextText ? {
        role: 'system',
        content: `[Book context — ${this.chatContext}]\n\n${contextText}`
      } : null

      // Send recent conversation (last 10 messages) plus new query
      const recentMessages = this.chatMessages.slice(-11)
      const messages = [systemMsg, contextMsg, ...recentMessages].filter(Boolean)

      try {
        const resp = await this.$axios.$post('/api/ollama/chat', {
          model: this.chatModel,
          messages
        }, { timeout: 300000 })
        if (resp.error) {
          this.chatMessages.push({ role: 'assistant', content: `Ollama error: ${resp.error}` })
        } else {
          const reply = resp.message?.content || 'No response received'
          this.chatMessages.push({ role: 'assistant', content: reply })
        }
      } catch (e) {
        const errMsg = e.response?.data?.error || e.message || 'Request failed'
        this.chatMessages.push({ role: 'assistant', content: `Error: ${errMsg}` })
      }

      this.chatLoading = false
      this.saveChatHistory()
      this.scrollChatToBottom()
    },
    async getChatContext() {
      const reader = this.$refs.readerComponent
      if (!reader) return ''

      if (this.chatContext === 'selection') {
        // Get selected text from the epub iframe
        const contents = reader.rendition?.getContents?.() || []
        for (const c of contents) {
          const doc = c.document || c.content?.ownerDocument
          if (doc) {
            const sel = doc.getSelection?.()
            if (sel && sel.toString().trim()) return sel.toString().trim()
          }
        }
        return ''
      }

      if (this.chatContext === 'page') {
        // Get visible text from current view
        const contents = reader.rendition?.getContents?.() || []
        const texts = []
        for (const c of contents) {
          const doc = c.document || c.content?.ownerDocument
          if (doc?.body) texts.push(doc.body.innerText || doc.body.textContent || '')
        }
        return texts.join('\n').trim().slice(0, 8000)
      }

      if (this.chatContext === 'chapter') {
        try {
          const currentSection = reader.rendition?.location?.start?.href
          if (!currentSection) return ''
          const item = reader.book.spine.get(currentSection)
          if (!item) return ''
          await item.load(reader.book.load.bind(reader.book))
          const text = item.document?.body?.innerText || item.document?.body?.textContent || ''
          item.unload()
          return this.fitToContext(text.trim())
        } catch (e) {
          console.error('Failed to load chapter text:', e)
          return ''
        }
      }

      if (this.chatContext === 'range') {
        try {
          const spine = reader.book.spine
          const totalItems = spine.items?.length || spine.length || 0
          const startIdx = Math.floor((this.rangeStart / 100) * totalItems)
          const endIdx = Math.ceil((this.rangeEnd / 100) * totalItems)
          const texts = []
          for (let i = startIdx; i < endIdx && i < totalItems; i++) {
            const item = spine.get(i)
            if (!item) continue
            await item.load(reader.book.load.bind(reader.book))
            const text = item.document?.body?.innerText || item.document?.body?.textContent || ''
            item.unload()
            if (text.trim()) texts.push(text.trim())
          }
          return this.fitToContext(texts.join('\n\n---\n\n'))
        } catch (e) {
          console.error('Failed to load range text:', e)
          return ''
        }
      }

      return ''
    },
    renderMarkdown(text) {
      if (!text) return ''
      let html = text
        // Escape HTML
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      // Code blocks
      html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      // Inline code
      html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
      // Tables
      html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm, (match, header, sep, body) => {
        const headers = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('')
        const rows = body.trim().split('\n').map(row => {
          const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('')
          return `<tr>${cells}</tr>`
        }).join('')
        return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`
      })
      // Headers
      html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>')
      html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>')
      html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>')
      // Bold + italic
      html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Unordered lists
      html = html.replace(/^[*\-] (.+)$/gm, '<li>$1</li>')
      html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
      // Numbered lists
      html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      // Horizontal rules
      html = html.replace(/^---+$/gm, '<hr>')
      // Paragraphs (double newlines)
      html = html.replace(/\n\n+/g, '</p><p>')
      // Single newlines to <br> (outside of pre/table)
      html = html.replace(/\n/g, '<br>')
      return `<p>${html}</p>`
    },
    fitToContext(text) {
      if (!text) return ''
      // Estimate max chars from model context window
      // Reserve ~2k tokens for system prompt + conversation, 1 token ≈ 4 chars
      const maxTokens = this.modelContextLength ? this.modelContextLength - 2000 : 30000
      const maxChars = maxTokens * 4
      if (text.length <= maxChars) return text
      // Truncate from the end, keeping a note
      const truncated = text.slice(0, maxChars)
      const lastPara = truncated.lastIndexOf('\n')
      const clean = lastPara > maxChars * 0.8 ? truncated.slice(0, lastPara) : truncated
      return clean + '\n\n[Text truncated to fit model context window]'
    },
    scrollChatToBottom() {
      this.$nextTick(() => {
        const el = this.$refs.chatMessages
        if (el) el.scrollTop = el.scrollHeight
      })
    },
    // ── TTS methods ──
    async ttsToggle() {
      if (this.ttsPlaying || this.ttsPaused) {
        this.ttsStop()
        return
      }
      this.loadTtsSettings()
      await this.ttsStart(0)
    },
    async ttsStart(fromIndex) {
      const reader = this.$refs.readerComponent
      if (!reader) return

      this.ttsParagraphs = reader.getTtsParagraphs()
      if (!this.ttsParagraphs.length) return

      this.ttsCurrentIndex = Math.min(fromIndex, this.ttsParagraphs.length - 1)
      this.ttsPlaying = true
      this.ttsPaused = false
      this.ttsClearBuffer()

      reader.ttsInstallClickHandlers()

      // Kick off prefetch for current + next N paragraphs
      this.ttsFillBuffer()
      await this.ttsPlayCurrent()
    },
    ttsStop() {
      this.ttsPlaying = false
      this.ttsPaused = false
      if (this.ttsAudio) {
        this.ttsAudio.pause()
        this.ttsAudio = null
      }
      if (this.ttsAbortController) {
        this.ttsAbortController.abort()
        this.ttsAbortController = null
      }
      this.ttsClearBuffer()
      const reader = this.$refs.readerComponent
      if (reader) {
        reader.ttsClearHighlight()
        reader.ttsRemoveClickHandlers()
      }
    },
    ttsClearBuffer() {
      // Revoke any buffered object URLs
      for (const key in this.ttsBuffer) {
        if (this.ttsBuffer[key]?.url) URL.revokeObjectURL(this.ttsBuffer[key].url)
      }
      this.ttsBuffer = {}
      this.ttsBufferPending = {}
    },
    ttsFillBuffer() {
      if (!this.ttsPlaying) return
      for (let i = this.ttsCurrentIndex; i < Math.min(this.ttsCurrentIndex + this.ttsBufferAhead, this.ttsParagraphs.length); i++) {
        if (this.ttsBuffer[i] || this.ttsBufferPending[i]) continue
        this.ttsBufferPending[i] = this.ttsFetchParagraph(i)
      }
    },
    async ttsFetchParagraph(index) {
      if (index >= this.ttsParagraphs.length) return null
      const para = this.ttsParagraphs[index]
      try {
        const data = await this.$axios.$post('/api/tts/speech', {
          input: para.text,
          voice: this.ttsVoice,
          speed: this.ttsSpeed
        }, { responseType: 'arraybuffer' })
        const blob = new Blob([data], { type: 'audio/mpeg' })
        const url = URL.createObjectURL(blob)
        const entry = { blob, url }
        this.ttsBuffer[index] = entry
        delete this.ttsBufferPending[index]
        return entry
      } catch (e) {
        console.error(`TTS fetch failed for paragraph ${index}:`, e)
        delete this.ttsBufferPending[index]
        return null
      }
    },
    async ttsGetAudio(index) {
      // Return from buffer if ready, otherwise wait for in-flight or fetch fresh
      if (this.ttsBuffer[index]) return this.ttsBuffer[index]
      if (this.ttsBufferPending[index]) return await this.ttsBufferPending[index]
      // Not buffered and not pending — fetch now
      return await this.ttsFetchParagraph(index)
    },
    ttsPauseResume() {
      if (!this.ttsAudio) return
      if (this.ttsPaused) {
        this.ttsAudio.play()
        this.ttsPaused = false
      } else {
        this.ttsAudio.pause()
        this.ttsPaused = true
      }
    },
    async ttsSkip() {
      if (this.ttsAudio) {
        this.ttsAudio.pause()
        this.ttsAudio = null
      }
      this.ttsCurrentIndex++
      if (this.ttsCurrentIndex >= this.ttsParagraphs.length) {
        const advanced = await this.ttsAdvancePage()
        if (!advanced) { this.ttsStop(); return }
      }
      this.ttsFillBuffer()
      await this.ttsPlayCurrent()
    },
    async ttsPlayCurrent() {
      if (!this.ttsPlaying || this.ttsCurrentIndex >= this.ttsParagraphs.length) {
        this.ttsStop()
        return
      }

      const para = this.ttsParagraphs[this.ttsCurrentIndex]
      const reader = this.$refs.readerComponent

      if (reader && para.el) {
        reader.ttsHighlight(para.el)
        reader.ttsSaveProgress(para.el)
      }

      const audio = await this.ttsGetAudio(this.ttsCurrentIndex)
      if (!audio || !this.ttsPlaying) {
        if (this.ttsPlaying) this.ttsStop()
        return
      }

      // Clean up this entry from the buffer (we're consuming it)
      delete this.ttsBuffer[this.ttsCurrentIndex]

      this.ttsAudio = new Audio(audio.url)

      this.ttsAudio.onended = async () => {
        URL.revokeObjectURL(audio.url)
        if (!this.ttsPlaying) return
        this.ttsCurrentIndex++
        if (this.ttsCurrentIndex >= this.ttsParagraphs.length) {
          const advanced = await this.ttsAdvancePage()
          if (!advanced) { this.ttsStop(); return }
        }
        // Refill buffer from new position
        this.ttsFillBuffer()
        await this.ttsPlayCurrent()
      }

      this.ttsAudio.onerror = (e) => {
        console.error('TTS audio playback error:', e)
        URL.revokeObjectURL(audio.url)
        this.ttsStop()
      }

      try {
        await this.ttsAudio.play()
      } catch (e) {
        console.error('TTS play error:', e)
        this.ttsStop()
      }
    },
    async ttsAdvancePage() {
      const reader = this.$refs.readerComponent
      if (!reader || !reader.hasNext) return false

      // Clear buffer since paragraph references will change
      this.ttsClearBuffer()

      await reader.next()
      await new Promise((resolve) => setTimeout(resolve, 500))

      this.ttsParagraphs = reader.getTtsParagraphs()
      this.ttsCurrentIndex = 0

      if (!this.ttsParagraphs.length) return false

      reader.ttsInstallClickHandlers()
      // Prefetch for the new page
      this.ttsFillBuffer()
      return true
    },
    ttsStartFrom(paragraphIndex) {
      if (!this.ttsPlaying && !this.ttsPaused) {
        this.loadTtsSettings()
        this.ttsStart(paragraphIndex)
      } else {
        if (this.ttsAudio) {
          this.ttsAudio.pause()
          this.ttsAudio = null
        }
        // Clear buffer since we're jumping
        this.ttsClearBuffer()
        const reader = this.$refs.readerComponent
        if (reader) this.ttsParagraphs = reader.getTtsParagraphs()
        this.ttsCurrentIndex = paragraphIndex
        this.ttsPaused = false
        this.ttsFillBuffer()
        this.ttsPlayCurrent()
      }
    },
    loadTtsSettings() {
      try {
        const saved = localStorage.getItem('ttsSettings')
        if (saved) {
          const s = JSON.parse(saved)
          if (s.speed) this.ttsSpeed = s.speed
          if (s.voice) this.ttsVoice = s.voice
        }
      } catch (e) {}
    },
    saveTtsSettings() {
      localStorage.setItem('ttsSettings', JSON.stringify({
        speed: this.ttsSpeed,
        voice: this.ttsVoice
      }))
    },
    // ── end TTS methods ──
    toggleToC() {
      this.tocOpen = !this.tocOpen
      this.chapters = this.$refs.readerComponent.chapters
    },
    openSettings() {
      this.showSettings = true
    },
    hotkey(action) {
      if (!this.$refs.readerComponent) return

      if (action === this.$hotkeys.EReader.NEXT_PAGE) {
        this.next()
      } else if (action === this.$hotkeys.EReader.PREV_PAGE) {
        this.prev()
      } else if (action === this.$hotkeys.EReader.CLOSE) {
        this.close()
      }
    },
    async searchBook() {
      if (this.searchQuery.length > 1) {
        this.searchResults = await this.$refs.readerComponent.searchBook(this.searchQuery)
        this.isSearching = true
      } else {
        this.isSearching = false
        this.searchResults = []
      }
    },
    next() {
      if (this.$refs.readerComponent?.next) this.$refs.readerComponent.next()
    },
    prev() {
      if (this.$refs.readerComponent?.prev) this.$refs.readerComponent.prev()
    },
    handleGesture() {
      // Touch must be less than 1s. Must be > 60px drag and X distance > Y distance
      const touchTimeMs = Date.now() - this.touchstartTime
      if (touchTimeMs >= 1000) {
        console.log('Touch too long', touchTimeMs)
        return
      }

      const touchDistanceX = Math.abs(this.touchendX - this.touchstartX)
      const touchDistanceY = Math.abs(this.touchendY - this.touchstartY)
      const touchDistance = Math.sqrt(Math.pow(this.touchstartX - this.touchendX, 2) + Math.pow(this.touchstartY - this.touchendY, 2))
      if (touchDistance < 60) {
        return
      }

      if (touchDistanceX < 60 || touchDistanceY > touchDistanceX) {
        return
      }

      if (this.touchendX < this.touchstartX) {
        this.next()
      }
      if (this.touchendX > this.touchstartX) {
        this.prev()
      }
    },
    touchstart(e) {
      // Ignore rapid touch
      if (this.touchstartTime && Date.now() - this.touchstartTime < 250) {
        return
      }

      this.touchstartX = e.touches[0].screenX
      this.touchstartY = e.touches[0].screenY
      this.touchstartTime = Date.now()
      this.touchIdentifier = e.touches[0].identifier
    },
    touchend(e) {
      if (this.touchIdentifier !== e.changedTouches[0].identifier) {
        return
      }

      this.touchendX = e.changedTouches[0].screenX
      this.touchendY = e.changedTouches[0].screenY
      this.handleGesture()
    },
    registerListeners() {
      this.$eventBus.$on('reader-hotkey', this.hotkey)
      document.body.addEventListener('touchstart', this.touchstart)
      document.body.addEventListener('touchend', this.touchend)
    },
    unregisterListeners() {
      this.$eventBus.$off('reader-hotkey', this.hotkey)
      document.body.removeEventListener('touchstart', this.touchstart)
      document.body.removeEventListener('touchend', this.touchend)
    },
    loadEreaderSettings() {
      try {
        const settings = localStorage.getItem('ereaderSettings')
        if (settings) {
          const _ereaderSettings = JSON.parse(settings)
          for (const key in this.ereaderSettings) {
            if (_ereaderSettings[key] !== undefined) {
              this.ereaderSettings[key] = _ereaderSettings[key]
            }
          }
          this.settingsUpdated()
        }
      } catch (error) {
        console.error('Failed to load ereader settings', error)
      }
    },
    init() {
      this.registerListeners()
    },
    close() {
      this.ttsStop()
      this.unregisterListeners()
      this.isSearching = false
      this.searchQuery = ''
      this.show = false
    }
  },
  mounted() {
    if (this.show) this.init()
  },
  beforeDestroy() {
    this.unregisterListeners()
  }
}
</script>

<style>
#reader {
  height: 100%;
}
#reader.reader-player-open {
  height: calc(100% - 164px);
}
@media (max-height: 400px) {
  #reader.reader-player-open {
    height: 100%;
  }
}
.chat-markdown h2, .chat-markdown h3, .chat-markdown h4 {
  font-weight: 600;
  margin: 0.75em 0 0.25em;
}
.chat-markdown h2 { font-size: 1.1em; }
.chat-markdown h3 { font-size: 1em; }
.chat-markdown h4 { font-size: 0.95em; }
.chat-markdown strong { font-weight: 600; }
.chat-markdown em { font-style: italic; }
.chat-markdown code {
  background: rgba(255,255,255,0.08);
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-size: 0.9em;
}
.chat-markdown pre {
  background: rgba(0,0,0,0.3);
  padding: 0.5em;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0.5em 0;
}
.chat-markdown pre code {
  background: none;
  padding: 0;
}
.chat-markdown table {
  border-collapse: collapse;
  margin: 0.5em 0;
  font-size: 0.85em;
  width: 100%;
}
.chat-markdown th, .chat-markdown td {
  border: 1px solid rgba(255,255,255,0.15);
  padding: 0.3em 0.5em;
  text-align: left;
}
.chat-markdown th {
  font-weight: 600;
  background: rgba(255,255,255,0.05);
}
.chat-markdown ul, .chat-markdown ol {
  padding-left: 1.5em;
  margin: 0.3em 0;
}
.chat-markdown li {
  margin: 0.15em 0;
}
.chat-markdown hr {
  border: none;
  border-top: 1px solid rgba(255,255,255,0.15);
  margin: 0.5em 0;
}
.chat-markdown p {
  margin: 0.3em 0;
}
</style>
