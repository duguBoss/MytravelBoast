<script setup>
defineProps({
  isPlaying: Boolean
})
const emit = defineEmits(['menu', 'settings', 'play', 'stop', 'export'])
</script>

<template>
  <div class="topbar glass">
    <div class="logo">
      <div class="logo-icon">✈</div>
      <span>TravelBoast</span>
    </div>
    <div class="topbar-divider"></div>
    <button class="btn btn-icon" title="路线" @click="$emit('menu')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <button class="btn btn-icon" title="设置" @click="$emit('settings')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
    <div class="topbar-divider"></div>
    
    <!-- Play button -->
    <button 
      v-if="!isPlaying"
      class="btn btn-primary" 
      @click="$emit('play')"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      播放
    </button>
    
    <!-- Stop button -->
    <button 
      v-if="isPlaying"
      class="btn btn-danger" 
      @click="$emit('stop')"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
      停止
    </button>
    
    <button class="btn btn-primary" @click="$emit('export')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      导出
    </button>
  </div>
</template>

<style scoped>
.topbar {
  position: fixed;
  top: 16px; left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-xl);
  z-index: 100;
  max-width: 92vw;
  overflow: hidden;
}
.logo {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-display);
  font-weight: 700; font-size: 16px;
  letter-spacing: -0.02em;
  padding: 0 6px;
  white-space: nowrap;
}
.logo-icon {
  width: 30px; height: 30px;
  background: var(--accent);
  border-radius: var(--radius-sm);
  display: grid; place-items: center;
  color: #fff; font-size: 14px;
  box-shadow: 0 2px 8px var(--accent-glow);
}
.topbar-divider {
  width: 1px; height: 24px;
  background: var(--border);
  flex-shrink: 0;
}
.btn-danger {
  background: #dc2626 !important;
  color: #fff !important;
}
</style>
