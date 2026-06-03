<script setup>
const props = defineProps({
  isPlaying: Boolean
})
const emit = defineEmits(['menu', 'settings', 'play', 'stop', 'export', 'toggleVehicle', 'fitBounds'])
</script>

<template>
  <div class="topbar">
    <div class="topbar-section">
      <div class="topbar-logo">
        <img src="/logo.png" alt="MyTravelBoast" />
      </div>
      <button class="tb-btn" @click="$emit('menu')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        <span class="tb-text">路线</span>
      </button>
      <button class="tb-btn" @click="$emit('fitBounds')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="22" y1="12" x2="18" y2="12"></line>
          <line x1="6" y1="12" x2="2" y2="12"></line>
          <line x1="12" y1="6" x2="12" y2="2"></line>
          <line x1="12" y1="22" x2="12" y2="18"></line>
        </svg>
        <span class="tb-text">视角</span>
      </button>
      <button class="tb-btn" @click="$emit('settings')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span class="tb-text">设置</span>
      </button>
    </div>
    
    <div class="topbar-section">
      <button 
        class="tb-btn tb-btn-primary"
        :class="{ playing: isPlaying }"
        @click="isPlaying ? $emit('stop') : $emit('play')"
      >
        <svg v-if="!isPlaying" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><polygon points="6,3 20,12 6,21"/></svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>
        <span class="tb-text tb-btn-label">{{ isPlaying ? '停止预览' : '播放预览' }}</span>
      </button>
      
      <button class="tb-btn" @click="$emit('toggleVehicle')">
        <span style="font-size: 16px;">🚗</span>
        <span class="tb-text">模型</span>
      </button>

      <button class="tb-btn" @click="$emit('export')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span class="tb-text">导出</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.topbar {
  position: fixed;
  top: 24px; left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 24px;
  z-index: 100;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(24px) saturate(1.8);
  -webkit-backdrop-filter: blur(24px) saturate(1.8);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08);
}

.topbar-section {
  display: flex;
  align-items: center;
  gap: 6px;
}

.topbar-logo {
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 12px 0 6px;
}
.topbar-logo img {
  height: 100%;
  object-fit: contain;
}

.topbar-section:last-child {
  padding-left: 12px;
  border-left: 1px solid rgba(0, 0, 0, 0.1);
}

.tb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: #334155;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  border-radius: 16px;
  height: 40px;
  padding: 0 14px;
  white-space: nowrap;
  flex-shrink: 0;
  position: relative;
}

.tb-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 16px;
  opacity: 0;
  transition: opacity 0.2s;
  background: rgba(0, 0, 0, 0.06);
}

.tb-btn:hover {
  color: #0f172a;
}

.tb-btn:hover::after {
  opacity: 1;
}

.tb-btn:active {
  transform: scale(0.96);
}

.tb-btn svg {
  width: 18px;
  height: 18px;
  stroke-width: 2.2;
}

.tb-btn-primary {
  background: linear-gradient(135deg, #ff7a59, #ff5238);
  color: #fff;
  box-shadow: 0 4px 16px rgba(255, 107, 74, 0.3);
  border-radius: 18px;
  height: 40px;
  padding: 0 20px;
}

.tb-btn-primary::after {
  background: rgba(0, 0, 0, 0.15);
}

.tb-btn-primary:hover {
  color: #fff;
  box-shadow: 0 6px 20px rgba(255, 107, 74, 0.4);
  transform: translateY(-2px);
}

.tb-btn-primary:active {
  transform: scale(0.96) translateY(0);
}

.tb-btn-primary.playing {
  background: linear-gradient(135deg, #f43f5e, #e11d48);
  box-shadow: 0 4px 16px rgba(225, 29, 72, 0.3);
}

.tb-btn-label {
  line-height: 1;
}

@media (max-width: 768px) {
  .topbar {
    top: 12px;
    padding: 6px;
    border-radius: 20px;
    gap: 6px;
    max-width: calc(100vw - 24px);
    overflow-x: auto;
  }
  
  .tb-btn {
    height: 36px;
    padding: 0 10px;
    border-radius: 14px;
    font-size: 13px;
  }
  
  .tb-btn-primary {
    padding: 0 16px;
    height: 36px;
    border-radius: 16px;
  }
}
</style>
