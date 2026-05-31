<script setup>
import { ref, computed, nextTick } from 'vue'
import { countryFlags } from '../constants/map.js'
import { getFlag } from '../utils/helpers.js'

const props = defineProps({
  points: Array,
  segments: Array,
  selSegment: Number,
  totalDist: String,
  open: Boolean
})
const emit = defineEmits(['select', 'delete', 'add', 'clear', 'setSegmentVehicle', 'editPoint', 'movePoint'])

const groupedSegments = computed(() => {
  return props.points.map((p, i) => ({
    point: p,
    isStart: i === 0,
    isEnd: i === props.points.length - 1,
    segment: props.segments[i],
    flag: props.segments[i] ? getFlag(props.segments[i]?.vehicle?.name, countryFlags) : ''
  }))
})

// Inline editing and global search geocoding state
const editingId = ref(null)
const editName = ref('')
const editInput = ref(null)

function startEdit(point) {
  editingId.value = point.id
  editName.value = point.name
  nextTick(() => {
    const el = editInput.value
    if (el) {
      if (Array.isArray(el) && el[0]) el[0].focus()
      else if (el.focus) el.focus()
    }
  })
}

function saveEdit(point) {
  if (editingId.value !== point.id) return
  const id = editingId.value
  editingId.value = null
  if (editName.value.trim() && editName.value.trim() !== point.name) {
    emit('editPoint', id, editName.value.trim())
  }
}
</script>

<template>
  <div class="route-panel glass" :class="{ open }">
    <div class="rp-header">
      <div class="rp-header-info">
        <div class="rp-total-dist">{{ totalDist }}</div>
        <div class="rp-route-count">{{ points.length }} 个途经点</div>
      </div>
      <div class="rp-actions">
        <button class="rp-btn rp-btn-icon" @click="$emit('add')" title="添加途经点">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
        </button>
        <button class="rp-btn rp-btn-danger rp-btn-icon" @click="$emit('clear')" title="清除路线">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      </div>
    </div>
    
    <div class="rp-list">
      <div
        v-for="(item, i) in groupedSegments"
        :key="item.point.id"
        class="rp-item"
        :class="{ active: selSegment === i }"
        @click="$emit('select', i)"
      >
        <div class="rp-item-marker">
          <div class="rp-dot" :class="{ start: item.isStart, end: item.isEnd }">
            {{ item.isStart ? 'A' : item.isEnd ? 'B' : i }}
          </div>
          <div v-if="!item.isEnd" class="rp-line"></div>
        </div>
        <div class="rp-item-content">
          <div class="rp-item-header">
            <div class="rp-item-name-wrap">
              <input
                v-if="editingId === item.point.id"
                ref="editInput"
                type="text"
                v-model="editName"
                class="rp-item-input"
                placeholder="搜索或输入新地名..."
                @blur="saveEdit(item.point)"
                @keydown.enter="saveEdit(item.point)"
                @click.stop
              />
              <span v-else class="rp-item-name" @click.stop="startEdit(item.point)" title="点击修改地名或搜索">
                {{ item.point.name }}
                <svg class="rp-edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </span>
            </div>
            <span v-if="item.flag" class="rp-item-flag">{{ item.flag }}</span>
          </div>
          <div v-if="item.segment" class="rp-item-segment">
            <span class="rp-seg-vehicle">{{ item.segment.vehicle?.icon }} {{ item.segment.vehicle?.name }}</span>
            <span class="rp-seg-dist">{{ item.segment.distance.toFixed(0) }} km</span>
          </div>
        </div>
        <div class="rp-item-controls" @click.stop>
          <button
            v-if="i > 0"
            class="rp-control-arrow"
            @click="emit('movePoint', i, -1)"
            title="上移"
          >
            ▲
          </button>
          <button
            v-if="i < points.length - 1"
            class="rp-control-arrow"
            @click="emit('movePoint', i, 1)"
            title="下移"
          >
            ▼
          </button>
        </div>
        <button
          v-if="!item.isStart && !item.isEnd"
          class="rp-btn rp-btn-remove"
          @click.stop="$emit('delete', item.point.id)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.route-panel {
  position: fixed;
  top: 72px; left: 16px;
  width: 280px;
  max-height: calc(100vh - 140px);
  border-radius: 18px;
  z-index: 50;
  transform: translateX(calc(-100% - 24px));
  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.route-panel.open {
  transform: translateX(0);
}

.rp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.5);
}

.rp-header-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rp-total-dist {
  font-size: 18px;
  font-weight: 700;
  color: var(--fg);
  font-family: var(--font-display);
  line-height: 1.2;
}

.rp-route-count {
  font-size: 11px;
  color: var(--muted);
  font-weight: 500;
}

.rp-actions {
  display: flex;
  gap: 4px;
}

.rp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  flex-shrink: 0;
}

.rp-btn-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.04);
  color: var(--muted);
}

.rp-btn-icon svg {
  width: 16px;
  height: 16px;
}

.rp-btn-icon:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--fg);
}

.rp-btn-danger:hover {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.rp-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.1) transparent;
}

.rp-list::-webkit-scrollbar {
  width: 3px;
}

.rp-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.rp-item {
  display: flex;
  align-items: stretch;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
}

.rp-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.rp-item.active {
  background: rgba(255, 107, 74, 0.06);
}

.rp-item.active .rp-dot {
  box-shadow: 0 0 0 4px rgba(255, 107, 74, 0.2);
}

.rp-item-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.rp-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 11px;
  color: #fff;
  border: 2.5px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  font-family: var(--font-display);
  z-index: 1;
  flex-shrink: 0;
}

.rp-dot.start {
  background: #34c759;
}

.rp-dot.end {
  background: #ff6b4a;
}

.rp-dot:not(.start):not(.end) {
  background: #6b7089;
}

.rp-line {
  width: 2px;
  flex: 1;
  min-height: 20px;
  background: linear-gradient(to bottom, rgba(255, 107, 74, 0.4), rgba(255, 107, 74, 0.1));
  margin-top: 4px;
}

.rp-item-content {
  flex: 1;
  min-width: 0;
  padding: 2px 0;
}

.rp-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rp-item-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rp-item-flag {
  font-size: 16px;
  flex-shrink: 0;
}

.rp-item-segment {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  gap: 8px;
}

.rp-seg-vehicle {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}

.rp-seg-dist {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  white-space: nowrap;
}

.rp-btn-remove {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  align-self: center;
  opacity: 0;
  transition: all 0.2s;
}

.rp-btn-remove svg {
  width: 14px;
  height: 14px;
}

.rp-item:hover .rp-btn-remove {
  opacity: 1;
}

.rp-btn-remove:hover {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

@media (max-width: 768px) {
  .route-panel {
    width: calc(100vw - 32px);
    left: 16px;
    top: 64px;
    max-height: calc(100vh - 130px);
    border-radius: 16px;
  }
  
  .rp-item {
    padding: 8px 14px;
  }
}

.rp-item-name-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.rp-item-input {
  width: 100%;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1.5px solid var(--accent);
  font-size: 13px;
  font-weight: 600;
  outline: none;
  background: #ffffff;
  color: var(--fg);
}

.rp-edit-icon {
  width: 11px;
  height: 11px;
  color: var(--muted);
  opacity: 0;
  transition: opacity 0.2s;
  margin-left: 5px;
  flex-shrink: 0;
}

.rp-item:hover .rp-edit-icon {
  opacity: 0.7;
}

.rp-item-name {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rp-item-controls {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.2s;
}

.rp-item:hover .rp-item-controls {
  opacity: 1;
}

.rp-control-arrow {
  border: none;
  background: rgba(0, 0, 0, 0.04);
  color: var(--muted);
  font-size: 8px;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all 0.2s;
}

.rp-control-arrow:hover {
  background: var(--accent-light);
  color: var(--accent);
}
</style>
