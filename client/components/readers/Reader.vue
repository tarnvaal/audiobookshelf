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

    <component v-if="componentName" ref="readerComponent" :is="componentName" :library-item="selectedLibraryItem" :player-open="!!streamLibraryItem" :keep-progress="keepProgress" :file-id="ebookFileId" @touchstart="touchstart" @touchend="touchend" @hook:mounted="readerMounted" @reading-status="onReadingStatus" @bookmarks-updated="onBookmarksUpdated" />

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
            <div class="bg-gray-600/20 rounded-lg px-3 py-2 max-w-[85%]">
              <p class="whitespace-pre-wrap">{{ msg.content }}</p>
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
        { label: 'Selection', value: 'selection' }
      ]
    },
    chatContextPreview() {
      if (this.chatContext === 'page') return 'Sending current visible text'
      if (this.chatContext === 'chapter') return `Sending full chapter: ${this.readingStatus?.chapter || 'unknown'}`
      if (this.chatContext === 'selection') return 'Sending selected text (highlight text first)'
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
          // Restore saved model or pick first
          const saved = localStorage.getItem('ebookChatModel')
          this.chatModel = saved && this.ollamaModels.includes(saved) ? saved : this.ollamaModels[0]
        }
      } catch (e) {
        console.error('Failed to load Ollama models:', e)
        this.ollamaModels = []
      }
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
        // Load the current chapter's full text
        try {
          const currentSection = reader.rendition?.location?.start?.href
          if (!currentSection) return ''
          const item = reader.book.spine.get(currentSection)
          if (!item) return ''
          await item.load(reader.book.load.bind(reader.book))
          const text = item.document?.body?.innerText || item.document?.body?.textContent || ''
          item.unload()
          return text.trim().slice(0, 30000)
        } catch (e) {
          console.error('Failed to load chapter text:', e)
          return ''
        }
      }

      return ''
    },
    scrollChatToBottom() {
      this.$nextTick(() => {
        const el = this.$refs.chatMessages
        if (el) el.scrollTop = el.scrollHeight
      })
    },
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
</style>
