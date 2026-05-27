<script setup>
import { computed } from 'vue'
import { vehicleTabs } from '../constants/vehicles.js'
const props = defineProps({
  vehicles: Array,
  selVehicle: Object,
  activeCat: { type: String, default: 'all' }
})
const emit = defineEmits(['select', 'changeCat'])

const filtered = computed(() => {
  return props.activeCat === 'all'
    ? props.vehicles
    : props.vehicles.filter(v => v.cat === props.activeCat)
})
</script>

<template>
  <div class="bottom-panel glass">
    <div class="vehicle-tabs">
      <button
        v-for="tab in vehicleTabs"
        :key="tab.key"
        class="vtab"
        :class="{ active: activeCat === tab.key }"
        @click="$emit('changeCat', tab.key)"
      >{{ tab.label }}</button>
    </div>
    <div class="vehicle-grid">
      <div
        v-for="v in filtered"
        :key="v.id"
        class="vcard"
        :class="{ selected: selVehicle.id === v.id }"
        @click="$emit('select', v)"
      >
        <div class="vc-check">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="vc-icon">{{ v.icon }}</div>
        <div class="vc-name">{{ v.name }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bottom-panel {
  position: fixed;
  bottom: 16px; left: 50%;
  transform: translateX(-50%);
  width: auto; max-width: 92vw;
  border-radius: var(--radius-lg);
  z-index: 100;
  display: flex; flex-direction: column;
  overflow: hidden;
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.vehicle-tabs {
  display: flex; gap: 2px;
  padding: 8px 12px 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.vehicle-tabs::-webkit-scrollbar { display: none; }
.vtab {
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--muted);
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.vtab:hover { color: var(--fg); background: rgba(0,0,0,0.03); }
.vtab.active { color: var(--fg); background: rgba(0,0,0,0.05); }

.vehicle-grid {
  display: flex; gap: 6px;
  padding: 8px 12px 12px;
  overflow-x: auto;
  scrollbar-width: thin;
  max-width: 800px;
}
.vehicle-grid::-webkit-scrollbar { height: 4px; }
.vehicle-grid::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
.vcard {
  display: flex; flex-direction: column; align-items: center;
  gap: 4px;
  min-width: 64px; max-width: 64px;
  padding: 8px 4px;
  border-radius: var(--radius-md);
  border: 1.5px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
}
.vcard:hover {
  background: rgba(0,0,0,0.03);
  transform: translateY(-3px);
}
.vcard.selected {
  border-color: var(--accent);
  background: var(--accent-light);
  box-shadow: 0 2px 8px var(--accent-glow);
}
.vcard .vc-icon {
  width: 36px; height: 36px;
  display: grid; place-items: center;
  font-size: 22px;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.vcard:hover .vc-icon { transform: scale(1.2); }
.vcard.selected .vc-icon { transform: scale(1.15); }
.vcard .vc-name {
  font-size: 9px; font-weight: 600;
  color: var(--muted);
  text-align: center;
  line-height: 1.2;
  max-width: 100%;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.vcard.selected .vc-name { color: var(--accent); }
.vcard .vc-check {
  position: absolute;
  top: 4px; right: 4px;
  width: 14px; height: 14px;
  background: var(--accent);
  border-radius: 50%;
  display: none; place-items: center;
}
.vcard.selected .vc-check { display: grid; }
.vc-check svg { width: 8px; height: 8px; color: #fff; }
</style>
