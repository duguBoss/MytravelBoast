<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  vehicles: Array,
  selVehicle: Object,
  activeCat: String,
  visible: Boolean
})
const emit = defineEmits(['select', 'changeCat', 'close'])

const categories = [
  { key: 'all', label: '全部' },
  { key: 'land', label: '陆地' },
  { key: 'air', label: '空中' },
  { key: 'sea', label: '海上' },
  { key: 'fun', label: '趣味' }
]

const filteredVehicles = computed(() => {
  if (props.activeCat === 'all') return props.vehicles
  return props.vehicles.filter(v => v.category === props.activeCat)
})
</script>

<template>
  <Transition name="vehicle-drawer">
    <div v-if="visible" class="vehicle-drawer-overlay" @click.self="$emit('close')">
      <div class="vehicle-drawer">
        <div class="vehicle-drawer-header">
          <h3>选择交通工具</h3>
          <button class="drawer-close" @click="$emit('close')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        
        <!-- Categories -->
        <div class="vehicle-categories">
          <button
            v-for="cat in categories"
            :key="cat.key"
            class="cat-btn"
            :class="{ active: activeCat === cat.key }"
            @click="$emit('changeCat', cat.key)"
          >
            {{ cat.label }}
          </button>
        </div>
        
        <!-- Vehicle Grid -->
        <div class="vehicle-grid">
          <div
            v-for="v in filteredVehicles"
            :key="v.id"
            class="vehicle-card"
            :class="{ selected: selVehicle?.id === v.id }"
            @click="$emit('select', v)"
          >
            <div class="vehicle-card-icon">{{ v.icon }}</div>
            <div class="vehicle-card-name">{{ v.name }}</div>
            <div v-if="selVehicle?.id === v.id" class="vehicle-card-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.vehicle-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.vehicle-drawer {
  width: 100%;
  max-width: 560px;
  max-height: 75vh;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(24px) saturate(1.6);
  -webkit-backdrop-filter: blur(24px) saturate(1.6);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 -4px 30px rgba(0, 0, 0, 0.1), 0 0 0 0.5px rgba(0, 0, 0, 0.04);
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.vehicle-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.vehicle-drawer-header h3 {
  font-size: 16px;
  font-weight: 700;
  color: #1a1d2b;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.drawer-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.06);
  color: #6b7089;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.drawer-close svg {
  width: 16px;
  height: 16px;
}

.drawer-close:hover {
  background: rgba(0, 0, 0, 0.1);
  color: #1a1d2b;
}

.vehicle-categories {
  display: flex;
  gap: 6px;
  padding: 12px 20px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.vehicle-categories::-webkit-scrollbar {
  display: none;
}

.cat-btn {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.03);
  color: #6b7089;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.cat-btn.active {
  background: #ff6b4a;
  color: #fff;
  border-color: #ff6b4a;
  box-shadow: 0 2px 8px rgba(255, 107, 74, 0.25);
}

.cat-btn:hover:not(.active) {
  background: rgba(0, 0, 0, 0.06);
  color: #1a1d2b;
}

.vehicle-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
  padding: 8px 20px 20px;
  overflow-y: auto;
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.15) transparent;
}

.vehicle-grid::-webkit-scrollbar {
  width: 4px;
}

.vehicle-grid::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
}

.vehicle-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.03);
  border: 1.5px solid transparent;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
}

.vehicle-card:hover {
  background: rgba(0, 0, 0, 0.06);
  transform: translateY(-2px);
}

.vehicle-card.selected {
  background: #fff0ec;
  border-color: #ff6b4a;
  box-shadow: 0 2px 10px rgba(255, 107, 74, 0.15);
}

.vehicle-card.selected .vehicle-card-icon {
  transform: scale(1.1);
}

.vehicle-card-icon {
  font-size: 28px;
  line-height: 1;
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.vehicle-card-name {
  font-size: 11px;
  font-weight: 600;
  color: #6b7089;
  text-align: center;
  line-height: 1.2;
}

.vehicle-card.selected .vehicle-card-name {
  color: #ff6b4a;
}

.vehicle-card-check {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ff6b4a;
  color: #fff;
  display: grid;
  place-items: center;
}

.vehicle-card-check svg {
  width: 10px;
  height: 10px;
}

/* Drawer animation */
.vehicle-drawer-enter-active {
  transition: all 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.vehicle-drawer-leave-active {
  transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}

.vehicle-drawer-enter-from,
.vehicle-drawer-leave-to {
  opacity: 0;
  transform: translateY(30px);
}

.vehicle-drawer-enter-from .vehicle-drawer,
.vehicle-drawer-leave-to .vehicle-drawer {
  transform: translateY(100%);
}

/* Desktop: side drawer */
@media (min-width: 769px) {
  .vehicle-drawer-overlay {
    align-items: center;
    justify-content: center;
  }
  
  .vehicle-drawer {
    max-width: 480px;
    border-radius: 20px;
    max-height: 80vh;
  }
}

@media (max-width: 768px) {
  .vehicle-drawer {
    max-height: 70vh;
    border-radius: 20px 20px 0 0;
  }
  
  .vehicle-grid {
    grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
    gap: 6px;
    padding: 8px 16px 16px;
  }
  
  .vehicle-card {
    padding: 10px 6px;
  }
  
  .vehicle-card-icon {
    font-size: 24px;
  }
  
  .vehicle-card-name {
    font-size: 10px;
  }
}
</style>
