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
  <div class="settings-drawer" :class="{ show }" @click.self="$emit('close')">
    <div class="settings-panel">
      <div class="panel-header">
        <button class="close-btn" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="close-icon"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <div class="header-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="header-icon"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
          <span>设置</span>
        </div>
        <div style="width:40px;"></div>
      </div>
      
      <div class="panel-content">
        <div class="section">
          <div class="section-title">视频设置</div>
          
          <div class="setting-row">
            <div class="setting-label">
              <span class="label-text">视频比例</span>
            </div>
            <div class="option-group">
              <button class="option-btn" :class="{ active: settings.ratio === 'vertical' }" @click="setOpt('ratio', 'vertical')">
                <div class="option-preview vertical"></div>
                <span>竖屏</span>
              </button>
              <button class="option-btn" :class="{ active: settings.ratio === 'horizontal' }" @click="setOpt('ratio', 'horizontal')">
                <div class="option-preview horizontal"></div>
                <span>横屏</span>
              </button>
              <button class="option-btn" :class="{ active: settings.ratio === 'square' }" @click="setOpt('ratio', 'square')">
                <div class="option-preview square"></div>
                <span>方形</span>
              </button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span class="label-text">播放速度</span>
            </div>
            <div class="speed-slider">
              <button class="speed-chip" :class="{ active: settings.speed === 0.5 }" @click="setOpt('speed', 0.5)">0.5×</button>
              <button class="speed-chip" :class="{ active: settings.speed === 1 }" @click="setOpt('speed', 1)">1×</button>
              <button class="speed-chip" :class="{ active: settings.speed === 2 }" @click="setOpt('speed', 2)">2×</button>
              <button class="speed-chip" :class="{ active: settings.speed === 3 }" @click="setOpt('speed', 3)">3×</button>
              <button class="speed-chip" :class="{ active: settings.speed === 4 }" @click="setOpt('speed', 4)">4×</button>
            </div>
          </div>

          <div class="slider-group">
            <div class="slider-label">
              <span>视频时长</span>
              <span class="slider-value">{{ settings.videoDuration }} 秒</span>
            </div>
            <input type="range" min="5" max="60" :value="settings.videoDuration" step="1" class="custom-slider" :style="{ '--pct': ((settings.videoDuration - 5) / 55 * 100) + '%' }" @input="e => setOpt('videoDuration', parseFloat(e.target.value))">
            <div class="slider-presets">
              <button class="preset-btn" :class="{ active: settings.videoDuration === 10 }" @click="setOpt('videoDuration', 10)">10s</button>
              <button class="preset-btn" :class="{ active: settings.videoDuration === 15 }" @click="setOpt('videoDuration', 15)">15s</button>
              <button class="preset-btn" :class="{ active: settings.videoDuration === 30 }" @click="setOpt('videoDuration', 30)">30s</button>
              <button class="preset-btn" :class="{ active: settings.videoDuration === 60 }" @click="setOpt('videoDuration', 60)">60s</button>
            </div>
          </div>

          <div class="slider-group">
            <div class="slider-label">
              <span>交通工具大小</span>
              <span class="slider-value">{{ settings.vehicleScale.toFixed(2) }}</span>
            </div>
            <input type="range" min="0.3" max="1.5" :value="settings.vehicleScale" step="0.05" class="custom-slider" :style="{ '--pct': ((settings.vehicleScale - 0.3) / 1.2 * 100) + '%' }" @input="e => setOpt('vehicleScale', parseFloat(e.target.value))">
            <div class="slider-presets">
              <button class="preset-btn" :class="{ active: settings.vehicleScale === 0.5 }" @click="setOpt('vehicleScale', 0.5)">小</button>
              <button class="preset-btn" :class="{ active: settings.vehicleScale === 0.65 }" @click="setOpt('vehicleScale', 0.65)">中</button>
              <button class="preset-btn" :class="{ active: settings.vehicleScale === 1 }" @click="setOpt('vehicleScale', 1)">大</button>
              <button class="preset-btn" :class="{ active: settings.vehicleScale === 1.3 }" @click="setOpt('vehicleScale', 1.3)">超大</button>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">地图样式</div>
          
          <div class="map-style-grid">
            <button class="map-style-card" :class="{ active: settings.mapStyle === 'voyager' }" @click="setOpt('mapStyle', 'voyager')">
              <div class="style-preview voyager"></div>
              <span>探索地图</span>
            </button>
            <button class="map-style-card" :class="{ active: settings.mapStyle === 'dark' }" @click="setOpt('mapStyle', 'dark')">
              <div class="style-preview dark"></div>
              <span>深色</span>
            </button>
            <button class="map-style-card" :class="{ active: settings.mapStyle === 'satellite' }" @click="setOpt('mapStyle', 'satellite')">
              <div class="style-preview satellite"></div>
              <span>卫星地图</span>
            </button>
            <button class="map-style-card" :class="{ active: settings.mapStyle === 'minimal' }" @click="setOpt('mapStyle', 'minimal')">
              <div class="style-preview minimal"></div>
              <span>极简</span>
            </button>
          </div>
        </div>

        <div class="section">
          <div class="section-title">显示选项</div>
          
          <div class="toggle-list">
            <div class="toggle-item">
              <div class="toggle-info">
                <span class="toggle-name">显示距离</span>
                <span class="toggle-desc">显示各路段的距离</span>
              </div>
              <div class="toggle-switch" :class="{ on: settings.showDistance }" @click="toggle('showDistance')">
                <div class="toggle-thumb"></div>
              </div>
            </div>
            
            <div class="toggle-item">
              <div class="toggle-info">
                <span class="toggle-name">显示地名</span>
                <span class="toggle-desc">显示途经点的名称标签</span>
              </div>
              <div class="toggle-switch" :class="{ on: settings.showLabels }" @click="toggle('showLabels')">
                <div class="toggle-thumb"></div>
              </div>
            </div>
            
            <div class="toggle-item">
              <div class="toggle-info">
                <span class="toggle-name">显示国旗</span>
                <span class="toggle-desc">在途经点显示国家/地区旗帜</span>
              </div>
              <div class="toggle-switch" :class="{ on: settings.showFlags }" @click="toggle('showFlags')">
                <div class="toggle-thumb"></div>
              </div>
            </div>

            <div class="toggle-item">
              <div class="toggle-info">
                <span class="toggle-name">3D 交通工具</span>
                <span class="toggle-desc">使用 3D 模型渲染交通工具</span>
              </div>
              <div class="toggle-switch" :class="{ on: settings.use3D }" @click="toggle('use3D')">
                <div class="toggle-thumb"></div>
              </div>
            </div>

            <div class="toggle-item">
              <div class="toggle-info">
                <span class="toggle-name">3D 倾斜视角</span>
                <span class="toggle-desc">启用地图的 3D 倾斜效果</span>
              </div>
              <div class="toggle-switch" :class="{ on: settings.view3D }" @click="toggle('view3D')">
                <div class="toggle-thumb"></div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="settings.view3D" class="section">
          <div class="section-title">3D 视角设置</div>
          
          <div class="slider-group">
            <div class="slider-label">
              <span>倾斜角度</span>
              <span class="slider-value">{{ settings.tilt }}°</span>
            </div>
            <input type="range" min="0" max="75" :value="settings.tilt" step="0.5" class="custom-slider" :style="{ '--pct': (settings.tilt / 75 * 100) + '%' }" @input="e => setTilt(parseFloat(e.target.value))">
            <div class="slider-presets">
              <button class="preset-btn" :class="{ active: settings.tilt === 30 }" @click="setTilt(30)">30°</button>
              <button class="preset-btn" :class="{ active: settings.tilt === 45 }" @click="setTilt(45)">45°</button>
              <button class="preset-btn" :class="{ active: settings.tilt === 55 }" @click="setTilt(55)">55°</button>
            </div>
          </div>

          <div class="slider-group">
            <div class="slider-label">
              <span>旋转角度</span>
              <span class="slider-value">{{ settings.rotation }}°</span>
            </div>
            <input type="range" min="-180" max="180" :value="settings.rotation" step="1" class="custom-slider" :style="{ '--pct': ((settings.rotation + 180) / 360 * 100) + '%' }" @input="e => setRotation(parseFloat(e.target.value))">
            <div class="slider-presets">
              <button class="preset-btn" :class="{ active: settings.rotation === 0 }" @click="setRotation(0)">北</button>
              <button class="preset-btn" :class="{ active: settings.rotation === -90 }" @click="setRotation(-90)">东</button>
              <button class="preset-btn" :class="{ active: settings.rotation === -180 || settings.rotation === 180 }" @click="setRotation(180)">南</button>
              <button class="preset-btn" :class="{ active: settings.rotation === 90 }" @click="setRotation(90)">西</button>
            </div>
          </div>

          <div class="compass-section">
            <div class="compass-label">方向罗盘（拖拽圆点旋转）</div>
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
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 200;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  pointer-events: none;
  background: transparent;
  transition: background-color 0.3s ease;
}

.settings-drawer.show {
  pointer-events: auto;
  background-color: rgba(0, 0, 0, 0.5);
}

.settings-panel {
  width: 100%;
  max-width: 380px;
  height: 100%;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 249, 251, 0.99) 100%);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.15);
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-drawer.show .settings-panel {
  transform: translateX(0);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(255, 255, 255, 0.6);
  position: relative;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 700;
  color: #1a1d2b;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.header-icon {
  width: 22px;
  height: 22px;
  color: #ff6b4a;
}

.close-btn {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  border: none;
  background: rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 1;
}

.close-btn:hover {
  background: rgba(255, 107, 74, 0.1);
  transform: scale(1.05);
}

.close-btn:active {
  transform: scale(0.95);
}

.close-icon {
  width: 20px;
  height: 20px;
  color: #666;
  transition: color 0.2s;
}

.close-btn:hover .close-icon {
  color: #ff6b4a;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.panel-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.section {
  margin-bottom: 32px;
}

.section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  color: #8a8f9e;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 16px;
}

.setting-row {
  margin-bottom: 20px;
}

.setting-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.label-text {
  font-size: 15px;
  font-weight: 600;
  color: #1a1d2b;
}

.option-group {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.option-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 10px;
  border-radius: 16px;
  border: 2px solid transparent;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: all 0.2s ease;
}

.option-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.option-btn.active {
  border-color: #ff6b4a;
  background: linear-gradient(135deg, #fff5f2 0%, #fff 100%);
  box-shadow: 0 4px 14px rgba(255, 107, 74, 0.15);
}

.option-preview {
  width: 36px;
  border-radius: 6px;
  background: linear-gradient(135deg, #ff6b4a 0%, #ff8f73 100%);
  box-shadow: 0 2px 6px rgba(255, 107, 74, 0.2);
}

.option-preview.vertical {
  height: 64px;
}

.option-preview.horizontal {
  height: 22px;
  width: 48px;
}

.option-preview.square {
  width: 36px;
  height: 36px;
}

.option-btn span {
  font-size: 12px;
  font-weight: 600;
  color: #666;
}

.option-btn.active span {
  color: #ff6b4a;
}

.speed-slider {
  display: flex;
  gap: 8px;
}

.speed-chip {
  flex: 1;
  padding: 10px 0;
  border-radius: 14px;
  border: 2px solid #e5e7eb;
  background: #fff;
  font-size: 14px;
  font-weight: 700;
  color: #666;
  cursor: pointer;
  transition: all 0.2s ease;
}

.speed-chip:hover {
  border-color: #d1d5db;
  background: #f9fafb;
}

.speed-chip.active {
  border-color: #ff6b4a;
  background: linear-gradient(135deg, #ff6b4a 0%, #ff8f73 100%);
  color: #fff;
  box-shadow: 0 4px 12px rgba(255, 107, 74, 0.25);
}

.map-style-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.map-style-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px 8px;
  border-radius: 16px;
  border: 2px solid transparent;
  background: #fff;
  cursor: pointer;
  transition: all 0.2s ease;
}

.map-style-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}

.map-style-card.active {
  border-color: #ff6b4a;
  background: linear-gradient(135deg, #fff5f2 0%, #fff 100%);
}

.style-preview {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.style-preview.voyager {
  background: linear-gradient(135deg, #e8f4f8 0%, #d4edda 50%, #fff3cd 100%);
}

.style-preview.dark {
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
}

.style-preview.satellite {
  background: linear-gradient(135deg, #86efac 0%, #2dd4bf 30%, #38bdf8 70%, #a78bfa 100%);
}

.style-preview.minimal {
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
}

.map-style-card span {
  font-size: 12px;
  font-weight: 600;
  color: #666;
}

.map-style-card.active span {
  color: #ff6b4a;
}

.toggle-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-radius: 16px;
  background: #fff;
  transition: background 0.2s ease;
}

.toggle-item:hover {
  background: #f8fafc;
}

.toggle-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.toggle-name {
  font-size: 15px;
  font-weight: 600;
  color: #1a1d2b;
}

.toggle-desc {
  font-size: 12px;
  color: #94a3b8;
}

.toggle-switch {
  width: 52px;
  height: 28px;
  border-radius: 14px;
  background: #e5e7eb;
  position: relative;
  cursor: pointer;
  transition: all 0.25s ease;
}

.toggle-switch.on {
  background: linear-gradient(135deg, #ff6b4a 0%, #ff8f73 100%);
  box-shadow: 0 4px 12px rgba(255, 107, 74, 0.25);
}

.toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  transition: transform 0.25s ease;
}

.toggle-switch.on .toggle-thumb {
  transform: translateX(24px);
}

.slider-group {
  margin-bottom: 24px;
}

.slider-group:last-child {
  margin-bottom: 16px;
}

.slider-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.slider-label span {
  font-size: 15px;
  font-weight: 600;
  color: #1a1d2b;
}

.slider-value {
  font-size: 14px;
  font-weight: 700;
  color: #ff6b4a;
}

.custom-slider {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(to right, #ff6b4a 0%, #ff6b4a var(--pct, 50%), #e5e7eb var(--pct, 50%), #e5e7eb 100%);
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
  margin-bottom: 12px;
}

.custom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  border: 3px solid #ff6b4a;
  box-shadow: 0 4px 12px rgba(255, 107, 74, 0.25);
  margin-top: -8px;
  cursor: grab;
  transition: transform 0.15s ease;
}

.custom-slider::-webkit-slider-thumb:active {
  transform: scale(1.25);
  cursor: grabbing;
}

.slider-presets {
  display: flex;
  gap: 8px;
}

.preset-btn {
  flex: 1;
  padding: 8px 0;
  border-radius: 10px;
  border: none;
  background: #f1f5f9;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-btn:hover {
  background: #e2e8f0;
  color: #475569;
}

.preset-btn.active {
  background: linear-gradient(135deg, #ff6b4a 0%, #ff8f73 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(255, 107, 74, 0.2);
}

.compass-section {
  margin-top: 8px;
}

.compass-label {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 12px;
}

.compass-wrap {
  width: 140px;
  height: 140px;
  margin: 0 auto;
  position: relative;
  border-radius: 50%;
  background: conic-gradient(from 0deg, rgba(255,107,74,0.06) 0deg, transparent 90deg, rgba(255,107,74,0.06) 180deg, transparent 270deg, rgba(255,107,74,0.06) 360deg);
  border: 2px solid #e5e7eb;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
}

.compass-wrap:active {
  cursor: grabbing;
}

.compass-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}

.compass-ring span {
  position: absolute;
  font-size: 11px;
  font-weight: 800;
  color: #94a3b8;
}

.compass-n {
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  color: #ff6b4a !important;
  font-size: 13px !important;
}

.compass-e {
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
}

.compass-s {
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
}

.compass-w {
  top: 50%;
  left: 10px;
  transform: translateY(-50%);
}

.compass-needle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 3px;
  height: 45%;
  background: linear-gradient(to bottom, #ff6b4a 0%, #ff8f73 100%);
  transform-origin: bottom center;
  transform: translate(-50%, -100%);
  border-radius: 2px;
  pointer-events: none;
  transition: transform 0.15s linear;
  box-shadow: 0 2px 8px rgba(255, 107, 74, 0.3);
}

.compass-needle::after {
  content: '';
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 8px solid #ff6b4a;
}

.compass-knob {
  position: absolute;
  top: 10%;
  left: 50%;
  width: 18px;
  height: 18px;
  background: linear-gradient(135deg, #ff6b4a 0%, #ff8f73 100%);
  border-radius: 50%;
  border: 3px solid #fff;
  box-shadow: 0 4px 12px rgba(255, 107, 74, 0.4);
  transform: translate(-50%, -50%);
  cursor: grab;
  transition: transform 0.15s linear, top 0.15s linear, left 0.15s linear, box-shadow 0.15s;
  pointer-events: auto;
}

.compass-knob:active {
  cursor: grabbing;
  transform: translate(-50%, -50%) scale(1.25);
  box-shadow: 0 6px 16px rgba(255, 107, 74, 0.5);
}

@media (max-width: 640px) {
  .settings-panel {
    max-width: 100%;
    border-radius: 0;
  }
}
</style>
