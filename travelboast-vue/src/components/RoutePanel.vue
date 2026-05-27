<script setup>
const props = defineProps({
  points: Array,
  segments: Array,
  selSegment: Number,
  totalDist: String,
  open: Boolean
})
const emit = defineEmits(['select', 'delete', 'add', 'clear', 'setSegmentVehicle'])

function typeLabel(i, len) {
  if (i === 0) return '起点'
  if (i === len - 1) return '终点'
  return '途经点'
}
function pinCls(i, len) {
  if (i === 0) return 'start'
  if (i === len - 1) return 'end'
  return 'stop'
}
function pinLabel(i, len) {
  if (i === 0) return 'A'
  if (i === len - 1) return 'B'
  return String(i)
}
</script>

<template>
  <div class="left-panel glass" :class="{ open }">
    <div class="panel-header">
      <span>旅行路线</span>
      <span class="panel-sub">{{ totalDist }}</span>
    </div>
    <div class="route-scroll">
      <template v-for="(p, i) in points" :key="p.id">
        <div
          class="route-node"
          :class="{ active: selSegment === i }"
          @click="$emit('select', i)"
        >
          <div class="node-pin" :class="pinCls(i, points.length)">{{ pinLabel(i, points.length) }}</div>
          <div class="node-info">
            <div class="node-name">{{ p.name }}</div>
            <div class="node-meta">{{ typeLabel(i, points.length) }} · {{ p.lat.toFixed(2) }}, {{ p.lng.toFixed(2) }}</div>
          </div>
          <button
            v-if="i > 0 && i < points.length - 1"
            class="btn btn-icon route-del"
            @click.stop="$emit('delete', p.id)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div class="node-vehicle">{{ (segments[i] && segments[i].vehicle) ? segments[i].vehicle.icon : '' }}</div>
        </div>
        <div v-if="i < points.length - 1" class="segment-row">
          <div class="segment-vehicle" @click="$emit('setSegmentVehicle', i)">
            <span class="seg-icon">{{ segments[i].vehicle.icon }}</span>
            <span>{{ segments[i].vehicle.name }}</span>
          </div>
          <span class="segment-dist">{{ segments[i].distance.toFixed(0) }} km</span>
        </div>
      </template>
    </div>
    <div class="panel-footer">
      <button class="btn" @click="$emit('add')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        添加点
      </button>
      <button class="btn btn-icon" title="清除" @click="$emit('clear')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.left-panel {
  position: fixed;
  top: 72px; left: 16px;
  width: 300px;
  max-height: calc(100vh - 280px);
  border-radius: var(--radius-lg);
  z-index: 100;
  display: flex; flex-direction: column;
  overflow: hidden;
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.panel-header {
  padding: 14px 16px 10px;
  font-family: var(--font-display);
  font-weight: 600; font-size: 14px;
  display: flex; justify-content: space-between; align-items: center;
}
.panel-sub {
  font-size: 11px; color: var(--muted);
  font-weight: 500;
  font-family: var(--font-body);
}
.route-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 10px 10px;
  scrollbar-width: thin;
}
.route-scroll::-webkit-scrollbar { width: 4px; }
.route-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

.route-node {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  margin-bottom: 2px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
  position: relative;
}
.route-node:hover { background: rgba(0,0,0,0.03); }
.route-node.active {
  background: var(--accent-light);
  border-color: rgba(255,107,74,0.12);
}
.node-pin {
  width: 26px; height: 26px;
  border-radius: 50%;
  display: grid; place-items: center;
  font-size: 10px; font-weight: 700;
  color: #fff; flex-shrink: 0;
  border: 2px solid #fff;
  box-shadow: var(--shadow-sm);
}
.node-pin.start { background: var(--success); }
.node-pin.end { background: var(--accent); }
.node-pin.stop { background: var(--muted); }
.node-info { flex: 1; min-width: 0; }
.node-name {
  font-weight: 600; font-size: 13px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.node-meta {
  font-size: 10px; color: var(--muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.node-vehicle {
  font-size: 18px;
  opacity: 0.7;
  transition: transform 0.2s;
}
.route-node:hover .node-vehicle { transform: scale(1.2); opacity: 1; }

.segment-row {
  display: flex; align-items: center;
  padding: 2px 0 2px 22px;
  position: relative;
}
.segment-row::before {
  content: '';
  position: absolute;
  left: 18px; top: -4px; bottom: -4px;
  width: 2px;
  background: repeating-linear-gradient(to bottom, var(--border) 0, var(--border) 4px, transparent 4px, transparent 8px);
}
.segment-vehicle {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg);
  font-size: 11px; font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}
.segment-vehicle:hover {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
}
.segment-vehicle .seg-icon { font-size: 14px; }
.segment-dist {
  font-size: 10px; color: var(--muted);
  margin-left: auto; padding-left: 8px;
}

.panel-footer {
  padding: 10px;
  border-top: 1px solid var(--border);
  display: flex; gap: 8px;
}
.panel-footer .btn { flex: 1; font-size: 12px; height: 32px; }

.route-del {
  width: 24px; height: 24px;
  opacity: 0;
  transition: opacity 0.15s;
}
.route-node:hover .route-del { opacity: 1; }
</style>
