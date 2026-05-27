<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  show: Boolean,
  settings: Object
})
const emit = defineEmits(['close', 'update'])

const local = ref({ ...props.settings })

watch(() => props.settings, (s) => { local.value = { ...s } }, { deep: true })

function setOpt(key, val) {
  emit('update', key, val)
}
function toggle(key) {
  emit('update', key, !props.settings[key])
}

function setTilt(v) {
  v = Math.max(0, Math.min(75, Math.round(v * 10) / 10))
  emit('update', 'tilt', v)
}
function setRotation(v) {
  const wrap = ((Math.round(v * 10) / 10) % 360 + 360) % 360
  emit('update', 'rotation', wrap > 180 ? wrap - 360 : wrap)
}

const compassWrap = ref(null)
const compassNeedle = ref(null)
const compassKnob = ref(null)

function updateCompass() {
  const wrap = compassWrap.value
  const needle = compassNeedle.value
  const knob = compassKnob.value
  if (!wrap || !needle || !knob) return
  const rot = props.settings.rotation || 0
  needle.style.transform = `translate(-50%, -100%) rotateZ(${rot}deg)`
  const r = wrap.offsetWidth / 2
  const cx = wrap.offsetWidth / 2
  const cy = wrap.offsetHeight / 2
  const rad = (rot - 90) * Math.PI / 180
  const kx = cx + (r - 14) * Math.cos(rad)
  const ky = cy + (r - 14) * Math.sin(rad)
  knob.style.left = kx + 'px'
  knob.style.top = ky + 'px'
  knob.style.transform = 'translate(-50%, -50%)'
}

onMounted(updateCompass)
watch(() => props.settings.rotation, updateCompass)

function initCompass() {
  const wrap = compassWrap.value
  if (!wrap) return
  let dragging = false
  function calcAngle(clientX, clientY) {
    const rect = wrap.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    let deg = Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI
    deg = (deg + 90) % 360
    if (deg > 180) deg -= 360
    return deg
  }
  wrap.addEventListener('mousedown', (e) => {
    dragging = true
    e.preventDefault()
    setRotation(calcAngle(e.clientX, e.clientY))
  })
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return
    setRotation(calcAngle(e.clientX, e.clientY))
  })
  window.addEventListener('mouseup', () => { dragging = false })
  wrap.addEventListener('touchstart', (e) => {
    dragging = true
    const t = e.touches[0]
    setRotation(calcAngle(t.clientX, t.clientY))
    e.preventDefault()
  }, { passive: false })
  window.addEventListener('touchmove', (e) => {
    if (!dragging) return
    const t = e.touches[0]
    setRotation(calcAngle(t.clientX, t.clientY))
  }, { passive: false })
  window.addEventListener('touchend', () => { dragging = false })
}
onMounted(initCompass)
</script>

<template>
  <div class="settings-drawer glass" :class="{ show }">
    <div class="panel-header">
      <span>设置</span>
      <button class="btn btn-icon" @click="$emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="drawer-body">
      <div class="s-row">
        <label class="s-label">视频比例</label>
        <div class="s-pills">
          <button class="pill" :class="{ active: settings.ratio === 'vertical' }" @click="setOpt('ratio', 'vertical')">9:16</button>
          <button class="pill" :class="{ active: settings.ratio === 'horizontal' }" @click="setOpt('ratio', 'horizontal')">16:9</button>
          <button class="pill" :class="{ active: settings.ratio === 'square' }" @click="setOpt('ratio', 'square')">1:1</button>
        </div>
      </div>
      <div class="s-row">
        <label class="s-label">播放速度</label>
        <div class="s-pills">
          <button class="pill" :class="{ active: settings.speed === 0.5 }" @click="setOpt('speed', 0.5)">0.5×</button>
          <button class="pill" :class="{ active: settings.speed === 1 }" @click="setOpt('speed', 1)">1×</button>
          <button class="pill" :class="{ active: settings.speed === 2 }" @click="setOpt('speed', 2)">2×</button>
          <button class="pill" :class="{ active: settings.speed === 3 }" @click="setOpt('speed', 3)">3×</button>
          <button class="pill" :class="{ active: settings.speed === 4 }" @click="setOpt('speed', 4)">4×</button>
        </div>
      </div>
      <div class="s-row">
        <label class="s-label">模型大小</label>
        <div class="s-pills">
          <button class="pill" :class="{ active: settings.size === 'small' }" @click="setOpt('size', 'small')">小</button>
          <button class="pill" :class="{ active: settings.size === 'medium' }" @click="setOpt('size', 'medium')">中</button>
          <button class="pill" :class="{ active: settings.size === 'large' }" @click="setOpt('size', 'large')">大</button>
        </div>
      </div>
      <div class="s-row">
        <label class="s-label">地图样式</label>
        <div class="s-pills">
          <button class="pill" :class="{ active: settings.mapStyle === 'voyager' }" @click="setOpt('mapStyle', 'voyager')">清新</button>
          <button class="pill" :class="{ active: settings.mapStyle === 'dark' }" @click="setOpt('mapStyle', 'dark')">深色</button>
          <button class="pill" :class="{ active: settings.mapStyle === 'satellite' }" @click="setOpt('mapStyle', 'satellite')">卫星</button>
          <button class="pill" :class="{ active: settings.mapStyle === 'minimal' }" @click="setOpt('mapStyle', 'minimal')">极简</button>
        </div>
      </div>

      <div class="s-toggle">
        <span style="font-size:13px;font-weight:500;">显示距离</span>
        <div class="toggle-track" :class="{ on: settings.showDistance }" @click="toggle('showDistance')"></div>
      </div>
      <div class="s-toggle">
        <span style="font-size:13px;font-weight:500;">显示国旗</span>
        <div class="toggle-track" :class="{ on: settings.showFlags }" @click="toggle('showFlags')"></div>
      </div>
      <div class="s-toggle">
        <span style="font-size:13px;font-weight:500;">3D 交通工具</span>
        <div class="toggle-track" :class="{ on: settings.use3D }" @click="toggle('use3D')"></div>
      </div>
      <div class="s-toggle">
        <span style="font-size:13px;font-weight:500;">显示地名标签</span>
        <div class="toggle-track" :class="{ on: settings.showLabels }" @click="toggle('showLabels')"></div>
      </div>
      <div class="s-toggle">
        <span style="font-size:13px;font-weight:500;">3D 倾斜视角</span>
        <div class="toggle-track" :class="{ on: settings.view3D }" @click="toggle('view3D')"></div>
      </div>

      <div v-show="settings.view3D" class="s-row">
        <label class="s-label">倾斜角度</label>
        <div class="angle-control">
          <button class="angle-btn" @click="setTilt((settings.tilt || 55) - 10)">−10°</button>
          <button class="angle-btn" @click="setTilt((settings.tilt || 55) - 1)">−1°</button>
          <input type="number" class="angle-input" :value="settings.tilt" min="0" max="75" step="0.1" @change="e => setTilt(parseFloat(e.target.value) || 0)">
          <span class="angle-unit">°</span>
          <button class="angle-btn" @click="setTilt((settings.tilt || 55) + 1)">+1°</button>
          <button class="angle-btn" @click="setTilt((settings.tilt || 55) + 10)">+10°</button>
        </div>
        <input type="range" min="0" max="75" :value="settings.tilt" step="0.1" class="angle-slider" @input="e => setTilt(parseFloat(e.target.value))">
        <div class="angle-presets">
          <button class="preset-chip" :class="{ active: settings.tilt === 30 }" @click="setTilt(30)">30°</button>
          <button class="preset-chip" :class="{ active: settings.tilt === 45 }" @click="setTilt(45)">45°</button>
          <button class="preset-chip" :class="{ active: settings.tilt === 55 }" @click="setTilt(55)">55°</button>
          <button class="preset-chip" :class="{ active: settings.tilt === 60 }" @click="setTilt(60)">60°</button>
          <button class="preset-chip" :class="{ active: settings.tilt === 75 }" @click="setTilt(75)">75°</button>
        </div>

        <label class="s-label" style="margin-top:14px;">旋转角度</label>
        <div class="angle-control">
          <button class="angle-btn" @click="setRotation((settings.rotation || 0) - 45)">−45°</button>
          <button class="angle-btn" @click="setRotation((settings.rotation || 0) - 5)">−5°</button>
          <input type="number" class="angle-input" :value="settings.rotation" min="-180" max="180" step="0.1" @change="e => setRotation(parseFloat(e.target.value) || 0)">
          <span class="angle-unit">°</span>
          <button class="angle-btn" @click="setRotation((settings.rotation || 0) + 5)">+5°</button>
          <button class="angle-btn" @click="setRotation((settings.rotation || 0) + 45)">+45°</button>
        </div>
        <input type="range" min="-180" max="180" :value="settings.rotation" step="0.1" class="angle-slider" @input="e => setRotation(parseFloat(e.target.value))">
        <div class="angle-presets">
          <button class="preset-chip" :class="{ active: settings.rotation === 0 }" @click="setRotation(0)">北</button>
          <button class="preset-chip" :class="{ active: settings.rotation === -90 }" @click="setRotation(-90)">东</button>
          <button class="preset-chip" :class="{ active: settings.rotation === -180 }" @click="setRotation(-180)">南</button>
          <button class="preset-chip" :class="{ active: settings.rotation === 90 }" @click="setRotation(90)">西</button>
        </div>

        <label class="s-label" style="margin-top:14px;">方向罗盘（拖拽圆点旋转）</label>
        <div class="compass-wrap" ref="compassWrap">
          <div class="compass-ring">
            <span class="compass-n">N</span>
            <span class="compass-e">E</span>
            <span class="compass-s">S</span>
            <span class="compass-w">W</span>
          </div>
          <div class="compass-needle" ref="compassNeedle"></div>
          <div class="compass-knob" ref="compassKnob"></div>
        </div>
        <div class="compass-hint">拖拽圆点或按住 Shift + 拖拽地图旋转</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-drawer {
  position: fixed;
  top: 16px; right: 16px;
  width: 300px; max-height: calc(100vh - 32px);
  border-radius: var(--radius-lg);
  z-index: 200;
  display: none; flex-direction: column;
  overflow: hidden;
  opacity: 0;
  transform: translateX(20px);
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.settings-drawer.show {
  display: flex;
  opacity: 1;
  transform: translateX(0);
}
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
  scrollbar-width: thin;
}
.drawer-body::-webkit-scrollbar { width: 4px; }
.drawer-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
.s-row { margin-bottom: 16px; }
.s-label {
  display: block;
  font-weight: 600; font-size: 11px;
  color: var(--muted);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.s-pills {
  display: flex; gap: 6px; flex-wrap: wrap;
}
.pill {
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg);
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.pill:hover { border-color: var(--muted); }
.pill.active {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
}
.s-toggle {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0;
}
.toggle-track {
  width: 44px; height: 24px;
  border-radius: 12px;
  background: var(--border);
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}
.toggle-track::after {
  content: '';
  position: absolute;
  top: 2px; left: 2px;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s;
}
.toggle-track.on { background: var(--accent); }
.toggle-track.on::after { transform: translateX(20px); }

.angle-control {
  display: flex; align-items: center; gap: 4px;
  margin-bottom: 8px;
}
.angle-btn {
  height: 28px; padding: 0 7px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--muted);
  font-family: var(--font-body);
  font-size: 10px; font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}
.angle-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-light);
}
.angle-input {
  width: 52px; height: 28px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border);
  background: var(--surface-solid);
  color: var(--fg);
  font-family: var(--font-body);
  font-size: 13px; font-weight: 600;
  text-align: center;
  outline: none;
  transition: border-color 0.15s;
  -moz-appearance: textfield;
}
.angle-input::-webkit-outer-spin-button,
.angle-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.angle-input:focus { border-color: var(--accent); }
.angle-unit {
  font-size: 12px; font-weight: 600;
  color: var(--muted);
  margin-left: -2px;
}
.angle-slider {
  width: 100%;
  height: 6px;
  accent-color: var(--accent);
  cursor: pointer;
  margin: 4px 0 8px;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
}
.angle-slider::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(to right, var(--accent) 0%, var(--accent) var(--pct, 50%), var(--border) var(--pct, 50%), var(--border) 100%);
}
.angle-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px; height: 18px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  margin-top: -6px;
  cursor: grab;
  transition: transform 0.1s;
}
.angle-slider::-webkit-slider-thumb:active {
  transform: scale(1.25);
  cursor: grabbing;
}
.angle-presets {
  display: flex; gap: 5px; flex-wrap: wrap;
}
.preset-chip {
  padding: 3px 9px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--muted);
  font-family: var(--font-body);
  font-size: 11px; font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.preset-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.preset-chip.active {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
}

.compass-wrap {
  width: 110px; height: 110px;
  margin: 6px auto 4px;
  position: relative;
  border-radius: 50%;
  background: conic-gradient(from 0deg, rgba(255,107,74,0.06) 0deg, transparent 90deg, rgba(255,107,74,0.06) 180deg, transparent 270deg, rgba(255,107,74,0.06) 360deg);
  border: 1.5px solid var(--border);
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}
.compass-wrap:active { cursor: grabbing; }
.compass-ring {
  position: absolute; inset: 0;
  border-radius: 50%;
}
.compass-ring span {
  position: absolute;
  font-size: 9px; font-weight: 700;
  color: var(--muted);
}
.compass-n { top: 5px; left: 50%; transform: translateX(-50%); color: var(--accent) !important; }
.compass-e { top: 50%; right: 5px; transform: translateY(-50%); }
.compass-s { bottom: 5px; left: 50%; transform: translateX(-50%); }
.compass-w { top: 50%; left: 5px; transform: translateY(-50%); }
.compass-needle {
  position: absolute;
  top: 50%; left: 50%;
  width: 2px; height: 40%;
  background: var(--accent);
  transform-origin: bottom center;
  transform: translate(-50%, -100%);
  border-radius: 1px;
  pointer-events: none;
  transition: transform 0.15s linear;
}
.compass-needle::after {
  content: '';
  position: absolute;
  top: -4px; left: 50%;
  transform: translateX(-50%);
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-bottom: 6px solid var(--accent);
}
.compass-knob {
  position: absolute;
  top: 12%; left: 50%;
  width: 14px; height: 14px;
  background: var(--accent);
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  transform: translate(-50%, -50%);
  cursor: grab;
  transition: transform 0.15s linear, top 0.15s linear, left 0.15s linear;
  pointer-events: auto;
}
.compass-knob:active { cursor: grabbing; transform: translate(-50%, -50%) scale(1.2); }
.compass-hint {
  text-align: center;
  font-size: 10px; color: var(--muted);
  margin-top: 6px;
}
</style>
