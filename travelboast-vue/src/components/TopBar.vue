<script setup>
const props = defineProps({
  isPlaying: Boolean
})
const emit = defineEmits(['menu', 'settings', 'play', 'stop', 'export', 'toggleVehicle', 'fitBounds'])
</script>

<template>
  <div class="topbar">
    <div class="topbar-section">
      <button class="tb-btn tb-btn-icon" @click="$emit('menu')" title="路线">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <button class="tb-btn tb-btn-icon" @click="$emit('fitBounds')" title="回到路线">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10v6a2 2 0 0 1-2 2h-6"/><path d="M3 10v6a2 2 0 0 0 2 2h6"/><path d="M13 21l-3-3 3-3"/><path d="M3 10v6a2 2 0 0 0 2 2h6"/><path d="M11 3l3 3-3 3"/><path d="M21 10v6a2 2 0 0 1-2 2h-6"/></svg>
      </button>
      <button class="tb-btn tb-btn-icon" @click="$emit('settings')" title="设置">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
      </button>
    </div>
    
    <div class="topbar-section">
      <button 
        class="tb-btn tb-btn-primary"
        :class="{ playing: isPlaying }"
        @click="isPlaying ? $emit('stop') : $emit('play')"
      >
        <svg v-if="!isPlaying" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><polygon points="6,3 20,12 6,21"/></svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><rect x="5" y="5" width="6" height="14" rx="1"/><rect x="13" y="5" width="6" height="14" rx="1"/></svg>
        <span class="tb-btn-label">{{ isPlaying ? '停止' : '播放' }}</span>
      </button>
      
      <button class="tb-btn tb-btn-icon" @click="$emit('export')" title="导出">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
      </button>
      
      <button class="tb-btn tb-btn-icon" @click="$emit('toggleVehicle')" title="交通工具">
        <span style="font-size: 18px;">🚗</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.topbar {
  position: fixed;
  top: 16px; left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border-radius: 20px;
  z-index: 100;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.08), 0 0 0 0.5px rgba(0, 0, 0, 0.04);
}

.topbar-section {
  display: flex;
  align-items: center;
  gap: 4px;
}

.topbar-section:last-child {
  padding-left: 4px;
  border-left: 1px solid rgba(0, 0, 0, 0.06);
}

.tb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: #1a1d2b;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  border-radius: 14px;
  height: 34px;
  padding: 0 12px;
  white-space: nowrap;
  flex-shrink: 0;
  position: relative;
}

.tb-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 14px;
  opacity: 0;
  transition: opacity 0.2s;
  background: rgba(0, 0, 0, 0.04);
}

.tb-btn:hover::after {
  opacity: 1;
}

.tb-btn:active {
  transform: scale(0.96);
}

.tb-btn-icon {
  width: 34px;
  padding: 0;
}

.tb-btn-icon svg {
  width: 18px;
  height: 18px;
  stroke-width: 1.8;
}

.tb-btn-primary {
  background: #ff6b4a;
  color: #fff;
  box-shadow: 0 2px 10px rgba(255, 107, 74, 0.25);
  border-radius: 16px;
  height: 34px;
  padding: 0 14px;
}

.tb-btn-primary::after {
  background: rgba(0, 0, 0, 0.1);
}

.tb-btn-primary:hover {
  box-shadow: 0 4px 14px rgba(255, 107, 74, 0.35);
  transform: translateY(-1px);
}

.tb-btn-primary:active {
  transform: scale(0.96) translateY(0);
}

.tb-btn-primary.playing {
  background: #dc2626;
  box-shadow: 0 2px 10px rgba(220, 38, 38, 0.25);
}

.tb-btn-label {
  line-height: 1;
}

@media (max-width: 768px) {
  .topbar {
    top: 12px;
    padding: 4px;
    border-radius: 16px;
    gap: 4px;
    max-width: calc(100vw - 16px);
    overflow: hidden;
  }
  
  .tb-btn {
    height: 32px;
    padding: 0 10px;
    border-radius: 12px;
    font-size: 12px;
  }
  
  .tb-btn-primary {
    padding: 0 12px;
    height: 32px;
    border-radius: 14px;
  }
  
  .tb-btn-primary .tb-btn-label {
    display: none;
  }
  
  .tb-btn-icon {
    width: 32px;
  }
  
  .tb-btn-icon svg {
    width: 16px;
    height: 16px;
  }
}
</style>
