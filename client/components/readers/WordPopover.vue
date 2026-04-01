<template>
  <div v-if="visible" class="fixed z-50 w-72 rounded-lg shadow-xl p-3 text-sm" :style="popoverStyle" :class="themeClasses" v-click-outside="close">
    <div class="flex justify-between items-center mb-1">
      <span class="font-bold text-base">{{ word }}</span>
      <button @click="close" class="opacity-60 hover:opacity-100">
        <span class="material-symbols text-sm">close</span>
      </button>
    </div>
    <div v-if="loading" class="text-xs opacity-60">Looking up...</div>
    <div v-else-if="!definitions.length" class="text-xs opacity-60">No definition found</div>
    <div v-else>
      <div v-for="(def, i) in definitions" :key="i" class="mb-1.5">
        <span class="text-xs opacity-50 italic mr-1">{{ def.pos }}</span>
        <span class="text-xs">{{ def.definition }}</span>
      </div>
    </div>
    <div class="flex items-center gap-2 mt-2">
      <button v-if="!saved" @click="$emit('save', word, definitions[0])" class="text-xs px-2 py-1 rounded border border-blue-500/40 hover:bg-blue-500/20">
        + Save
      </button>
      <span v-else class="text-xs opacity-50">Saved</span>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    visible: Boolean,
    word: { type: String, default: '' },
    definitions: { type: Array, default: () => [] },
    loading: Boolean,
    saved: Boolean,
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    theme: { type: String, default: 'dark' }
  },
  computed: {
    themeClasses() {
      if (this.theme === 'sepia') return 'bg-[rgb(230,222,202)] text-[#5b4636] border border-[#5b4636]/20'
      if (this.theme === 'light') return 'bg-white text-black border border-gray-300'
      return 'bg-gray-800 text-gray-200 border border-gray-600'
    },
    popoverStyle() {
      // Clamp to viewport
      const w = 288 // w-72
      const maxX = window.innerWidth - w - 8
      const maxY = window.innerHeight - 200
      return {
        left: Math.max(8, Math.min(this.x - w / 2, maxX)) + 'px',
        top: Math.min(this.y + 20, maxY) + 'px'
      }
    }
  },
  methods: {
    close() {
      this.$emit('close')
    }
  }
}
</script>
