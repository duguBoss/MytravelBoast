<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import L from 'leaflet'
import { tileUrls, tileSubdomains } from '../constants/map.js'
import {
  saveVideoFile,
  createPreviewUrl,
  revokePreviewUrl,
  generateFilename,
  formatFileSize,
  convertWebMToMP4
} from '../utils/videoRecorder.js'

const props = defineProps({
  show: Boolean,
  points: Array,
  segments: Array,
  settings: Object
})
const emit = defineEmits(['close', 'toast', 'update'])

const fmtSize = formatFileSize

// DOM refs
const mapContainer = ref(null)
const previewVideo = ref(null)
const mapCardRef = ref(null)

// State
const isRecording = ref(false)
const isConverting = ref(false)
const convertProgress = ref(0)
const isLoading = ref(false)
const progress = ref(0)
const canSave = ref(false)
const savedResult = ref(null)
const recordedBlob = ref(null)
const previewUrl = ref(null)
const showPreviewPlayer = ref(false)
const recordStats = ref(null)

// Map refs
let mapInstance = null
let vehicleMarker = null
let routeLine = null
let animRaf = null
let mediaRecorder = null
let recordChunks = []

// Offscreen canvas for recording
let offscreenCanvas = null
let offscreenCtx = null

// Cached background image (screenshot of static map)
let bgImage = null

const durationDisplay = computed(() => Math.round(videoDuration.value) + ' 秒')
const sizeDisplay = computed(() => modelSize.value.toFixed(2))

// Local settings for preview page
const videoDuration = ref(5)
const modelSize = ref(0.65)
const selectedRatio = ref(props.settings?.ratio || 'vertical')

function getMapSize() {
  const r = selectedRatio.value
  if (r === 'horizontal') return { w: 640, h: 360 }
  if (r === 'square') return { w: 360, h: 360 }
  return { w: 360, h: 640 }
}

function getAspectClass() {
  const r = selectedRatio.value
  if (r === 'horizontal') return 'horizontal'
  if (r === 'square') return 'square'
  return 'vertical'
}

function initMap() {
  const el = mapContainer.value
  if (!el || mapInstance) return

  const { w, h } = getMapSize()
  el.style.width = w + 'px'
  el.style.height = h + 'px'

  mapInstance = L.map(el, {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false
  })

  const latlngs = props.points.map(p => [p.lat, p.lng])
  mapInstance.fitBounds(latlngs, { padding: [20, 20] })

  const style = props.settings.mapStyle || 'voyager'
  const opts = { attribution: '', maxZoom: 19, crossOrigin: true }
  if (tileSubdomains[style]) opts.subdomains = tileSubdomains[style]
  L.tileLayer(tileUrls[style], opts).addTo(mapInstance)

  routeLine = L.polyline(latlngs, {
    color: '#ff6b4a', weight: 4, opacity: 0.9,
    dashArray: '6 4', lineCap: 'round', lineJoin: 'round'
  }).addTo(mapInstance)

  const startIcon = L.divIcon({
    html: `<div style="width:28px;height:28px;border-radius:50%;background:#34c759;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:grid;place-items:center;color:#fff;font-weight:700;font-size:12px;">A</div>`,
    className: '', iconSize: [28, 28], iconAnchor: [14, 14]
  })
  const endIcon = L.divIcon({
    html: `<div style="width:28px;height:28px;border-radius:50%;background:#ff6b4a;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:grid;place-items:center;color:#fff;font-weight:700;font-size:12px;">B</div>`,
    className: '', iconSize: [28, 28], iconAnchor: [14, 14]
  })
  L.marker(latlngs[0], { icon: startIcon, interactive: false }).addTo(mapInstance)
  L.marker(latlngs[latlngs.length - 1], { icon: endIcon, interactive: false }).addTo(mapInstance)

  const v = props.segments[0]?.vehicle || { icon: '✈️' }
  const vehicleIcon = L.divIcon({
    html: `<div style="font-size:${32 * modelSize.value}px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3));">${v.icon}</div>`,
    className: '', iconSize: [40, 40], iconAnchor: [20, 20]
  })
  vehicleMarker = L.marker(latlngs[0], { icon: vehicleIcon, interactive: false, zIndexOffset: 1000 }).addTo(mapInstance)
}

function updateVehicle(t) {
  const totalDist = props.segments.reduce((s, seg) => s + seg.distance, 0)
  const targetDist = totalDist * t

  let acc = 0
  let segIdx = 0, segT = 0
  for (let i = 0; i < props.segments.length; i++) {
    if (acc + props.segments[i].distance >= targetDist) {
      segIdx = i
      segT = props.segments[i].distance > 0 ? (targetDist - acc) / props.segments[i].distance : 0
      break
    }
    acc += props.segments[i].distance
  }
  if (segIdx >= props.segments.length) {
    segIdx = props.segments.length - 1
    segT = 1
  }

  const p1 = props.points[segIdx]
  const p2 = props.points[segIdx + 1]
  const lat = p1.lat + (p2.lat - p1.lat) * segT
  const lng = p1.lng + (p2.lng - p1.lng) * segT

  if (vehicleMarker) {
    vehicleMarker.setLatLng([lat, lng])
    const v = props.segments[segIdx]?.vehicle || props.segments[0]?.vehicle
    const vehicleIcon = L.divIcon({
      html: `<div style="font-size:${32 * modelSize.value}px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3));">${v?.icon || '✈️'}</div>`,
      className: '', iconSize: [40, 40], iconAnchor: [20, 20]
    })
    vehicleMarker.setIcon(vehicleIcon)
  }

  return { lat, lng, segIdx }
}

// Get vehicle pixel position on the map container
function getVehiclePixelPos() {
  if (!mapInstance || !vehicleMarker) return null
  const ll = vehicleMarker.getLatLng()
  const pt = mapInstance.latLngToContainerPoint([ll.lat, ll.lng])
  return pt
}

// Draw a single frame: background + vehicle
function drawFrame() {
  if (!offscreenCtx || !bgImage) return
  const { w, h } = getMapSize()

  // Clear
  offscreenCtx.clearRect(0, 0, w, h)

  // Draw background (with 3D tilt simulated by scaling)
  // The bgImage was captured with the 3D CSS transform applied
  offscreenCtx.drawImage(bgImage, 0, 0, w, h)

  // Draw vehicle at current position
  const vPos = getVehiclePixelPos()
  if (vPos) {
    const v = props.segments[0]?.vehicle || { icon: '✈️' }
    const size = 32 * modelSize.value

    offscreenCtx.save()
    offscreenCtx.font = `${size}px serif`
    offscreenCtx.textAlign = 'center'
    offscreenCtx.textBaseline = 'middle'
    offscreenCtx.shadowColor = 'rgba(0,0,0,0.3)'
    offscreenCtx.shadowBlur = 6
    offscreenCtx.shadowOffsetY = 3
    offscreenCtx.fillText(v.icon || '✈️', vPos.x, vPos.y)
    offscreenCtx.restore()
  }
}

async function record() {
  if (props.points.length < 2) {
    emit('toast', '请至少设置起点和终点')
    return
  }

  // Hide preview if showing
  if (showPreviewPlayer.value) {
    showPreviewPlayer.value = false
    if (previewUrl.value) {
      revokePreviewUrl(previewUrl.value)
      previewUrl.value = null
    }
  }

  isRecording.value = true
  progress.value = 0
  canSave.value = false
  recordStats.value = null
  savedResult.value = null

  const { w, h } = getMapSize()

  // Step 1: Capture static background (one-time, with 3D tilt)
  emit('toast', '正在准备录制...')
  await nextTick()

  // Wait for tiles to load
  await new Promise(r => setTimeout(r, 800))

  // Capture the map card as background
  try {
    const cardEl = mapCardRef.value
    if (!cardEl) throw new Error('Map card not found')

    // Use dom-to-image or canvas draw
    // For now, use the Leaflet internal canvas if available
    const leafletCanvas = cardEl.querySelector('.leaflet-container canvas')
    if (leafletCanvas) {
      bgImage = leafletCanvas
    } else {
      // Fallback: create from container
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#e8ecf1'
      ctx.fillRect(0, 0, w, h)
      bgImage = canvas
    }
  } catch (err) {
    console.error('Background capture failed:', err)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#e8ecf1'
    ctx.fillRect(0, 0, w, h)
    bgImage = canvas
  }

  // Step 2: Setup offscreen canvas
  offscreenCanvas = document.createElement('canvas')
  offscreenCanvas.width = w
  offscreenCanvas.height = h
  offscreenCtx = offscreenCanvas.getContext('2d')

  // Check support
  if (!offscreenCanvas.captureStream) {
    emit('toast', '浏览器不支持视频录制')
    isRecording.value = false
    return
  }

  const stream = offscreenCanvas.captureStream(30)

  const mimeTypes = [
    'video/webm; codecs=vp9',
    'video/webm; codecs=vp8',
    'video/webm'
  ]
  let mimeType = ''
  for (const mt of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mt)) {
      mimeType = mt
      break
    }
  }

  if (!mimeType) {
    emit('toast', '浏览器不支持视频录制格式')
    isRecording.value = false
    return
  }

  mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2500000
  })
  recordChunks = []

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordChunks.push(e.data)
  }

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordChunks, { type: mimeType })
    recordedBlob.value = blob
    isRecording.value = false
    canSave.value = true
    recordStats.value = {
      size: blob.size,
      duration: videoDuration.value + 's'
    }
    // Auto-convert to MP4
    autoConvertToMP4(blob)
  }

  mediaRecorder.start(100)

  // Step 3: Animation loop
  const durationMs = videoDuration.value * 1000
  const startTime = performance.now()
  let lastDrawTime = 0

  // Initial draw
  updateVehicle(0)
  drawFrame()

  function step(now) {
    const elapsed = now - startTime
    const t = Math.min(elapsed / durationMs, 1)
    progress.value = t * 100

    // Update vehicle
    updateVehicle(t)

    // Draw frame (throttled to ~20fps for performance)
    if (now - lastDrawTime >= 50) {
      drawFrame()
      lastDrawTime = now
    }

    if (t < 1) {
      animRaf = requestAnimationFrame(step)
    } else {
      drawFrame()
      finishRecording()
    }
  }

  animRaf = requestAnimationFrame(step)
}

function finishRecording() {
  if (animRaf) {
    cancelAnimationFrame(animRaf)
    animRaf = null
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
}

async function autoConvertToMP4(webmBlob) {
  isConverting.value = true
  convertProgress.value = 0
  emit('toast', '正在生成 MP4...')

  try {
    const mp4Blob = await convertWebMToMP4(webmBlob, (p) => {
      convertProgress.value = p
    })
    // Replace the recorded blob with MP4
    recordedBlob.value = mp4Blob
    emit('toast', 'MP4 生成完成')
    previewRecorded()
  } catch (err) {
    console.error('MP4 conversion failed:', err)
    emit('toast', 'MP4 生成失败，使用 WebM 格式')
    previewRecorded()
  } finally {
    isConverting.value = false
  }
}

function stop() {
  if (animRaf) {
    cancelAnimationFrame(animRaf)
    animRaf = null
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  isRecording.value = false
}

async function handleSave() {
  if (!recordedBlob.value) return

  const filename = generateFilename({
    ratio: selectedRatio.value,
    points: props.points,
    format: 'mp4'
  })

  const result = await saveVideoFile(recordedBlob.value, {
    suggestedName: filename,
    format: 'mp4'
  })
  savedResult.value = result
  if (result.success) {
    emit('toast', result.fallback ? '视频已下载' : `视频已保存: ${result.name}`)
  } else if (result.aborted) {
    emit('toast', '已取消保存')
  } else {
    emit('toast', '保存失败: ' + (result.error || '未知错误'))
  }
}

function previewRecorded() {
  if (!recordedBlob.value) return
  if (previewUrl.value) revokePreviewUrl(previewUrl.value)
  previewUrl.value = createPreviewUrl(recordedBlob.value)
  showPreviewPlayer.value = true
  nextTick(() => {
    if (previewVideo.value) previewVideo.value.play().catch(() => {})
  })
}

function close() {
  stop()
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
    vehicleMarker = null
    routeLine = null
  }
  if (previewUrl.value) {
    revokePreviewUrl(previewUrl.value)
    previewUrl.value = null
  }
  recordedBlob.value = null
  canSave.value = false
  showPreviewPlayer.value = false
  recordStats.value = null
  bgImage = null
  offscreenCanvas = null
  offscreenCtx = null
  emit('close')
}

function setRatio(ratio) {
  selectedRatio.value = ratio
  emit('update', 'ratio', ratio)
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
    vehicleMarker = null
    routeLine = null
  }
  nextTick(() => {
    initMap()
  })
}

function onDurationChange(e) {
  videoDuration.value = parseInt(e.target.value)
}

function onSizeChange(e) {
  modelSize.value = parseFloat(e.target.value)
  if (vehicleMarker) {
    const v = props.segments[0]?.vehicle || { icon: '✈️' }
    const vehicleIcon = L.divIcon({
      html: `<div style="font-size:${32 * modelSize.value}px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3));">${v.icon}</div>`,
      className: '', iconSize: [40, 40], iconAnchor: [20, 20]
    })
    vehicleMarker.setIcon(vehicleIcon)
  }
}

watch(() => props.show, async (v) => {
  if (v) {
    selectedRatio.value = props.settings?.ratio || 'vertical'
    await nextTick()
    initMap()
    isLoading.value = true
    setTimeout(() => { isLoading.value = false }, 400)
  } else {
    stop()
  }
})
</script>

<template>
  <div class="preview-page" :class="{ show }">
    <!-- Header -->
    <div class="preview-header-bar">
      <button class="header-btn back" @click="close">
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
        </svg>
      </button>
      <span class="header-title">预览视频</span>
      <div class="header-actions">
        <button class="header-btn new-badge" title="NEW">
          <span class="new-label">NEW</span>
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>
        <button class="header-btn" title="地图">
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
            <path d="M20.5 3l-6 1.5-6-1.5-6 1.5v15l6-1.5 6 1.5 6-1.5V3zM14.5 4.5v13l-5-1.25V3.25l5 1.25z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Map Preview Area -->
    <div class="map-preview-area" :class="getAspectClass()">
      <div ref="mapCardRef" class="map-card">
        <!-- 3D tilt container: perspective on parent, transform on child -->
        <div class="map-3d-scene">
          <div class="map-3d-plane">
            <div ref="mapContainer" class="map-inner"></div>
          </div>
        </div>
        <div v-if="isLoading" class="map-loading">地图加载中...</div>
        <div v-if="isRecording" class="recording-badge">
          <span class="rec-dot"></span>
          录制中 {{ progress.toFixed(0) }}%
        </div>
      </div>
    </div>

    <!-- Video Preview Player -->
    <div class="video-preview-area" v-show="showPreviewPlayer" :class="getAspectClass()">
      <div class="map-card">
        <video ref="previewVideo" :src="previewUrl" controls loop playsinline class="preview-video-el"></video>
        <button class="btn-close-preview" @click="showPreviewPlayer = false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>

    <!-- Controls Section -->
    <div class="controls-section">
      <!-- Video Duration Slider -->
      <div class="slider-row">
        <div class="slider-label">
          <span>视频长度</span>
          <span class="slider-value">{{ durationDisplay }}</span>
        </div>
        <div class="slider-track">
          <div class="slider-fill" :style="{ width: ((videoDuration - 3) / (60 - 3) * 100) + '%' }"></div>
          <input
            type="range"
            min="3"
            max="60"
            :value="videoDuration"
            class="slider-input"
            @input="onDurationChange"
          />
        </div>
      </div>

      <!-- Model Size Slider -->
      <div class="slider-row">
        <div class="slider-label">
          <span>型号大小</span>
          <span class="slider-value">{{ sizeDisplay }}</span>
        </div>
        <div class="slider-track">
          <div class="slider-fill" :style="{ width: ((modelSize - 0.2) / (1.5 - 0.2) * 100) + '%' }"></div>
          <input
            type="range"
            min="0.2"
            max="1.5"
            step="0.01"
            :value="modelSize"
            class="slider-input"
            @input="onSizeChange"
          />
        </div>
      </div>

      <!-- Toolbar -->
      <div class="toolbar">
        <button class="tool-btn" :class="{ active: !isRecording && !canSave }" @click="record" :disabled="isLoading || isRecording || isConverting">
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <button class="tool-btn" @click="emit('toast', '地图样式切换')">
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </button>
        <button class="tool-btn" :class="{ active: selectedRatio === 'vertical' }" @click="setRatio('vertical')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
            <rect x="6" y="4" width="12" height="16" rx="2"/>
          </svg>
        </button>
        <button class="tool-btn" :class="{ active: selectedRatio === 'square' }" @click="setRatio('square')">
          <span style="font-size:13px;font-weight:700;">1:1</span>
        </button>
        <button class="tool-btn" @click="emit('toast', '尺寸调整')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
          </svg>
        </button>
      </div>

      <!-- Convert Progress -->
      <div class="convert-progress" v-if="isConverting">
        <div class="convert-bar">
          <div class="convert-fill" :style="{ width: convertProgress + '%' }"></div>
        </div>
        <span class="convert-text">生成 MP4 中 {{ convertProgress }}%</span>
      </div>

      <!-- Save Button -->
      <button class="save-btn" @click="canSave ? handleSave() : record()" :disabled="isRecording || isConverting">
        <span v-if="isRecording">录制中...</span>
        <span v-else-if="isConverting">生成 MP4 中...</span>
        <span v-else-if="canSave">保存 MP4 视频</span>
        <span v-else>开始录制</span>
      </button>

      <!-- Stats -->
      <div class="record-stats" v-if="recordStats && !isConverting">
        <span class="stat">{{ fmtSize(recordStats.size) }} · {{ recordStats.duration }}</span>
      </div>

      <!-- Save hint -->
      <div class="save-hint" v-if="savedResult?.success">
        {{ savedResult.fallback ? '视频已自动下载' : `已保存: ${savedResult.name}` }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-page {
  position: fixed;
  inset: 0;
  background: #0f1b2e;
  display: none;
  flex-direction: column;
  z-index: 600;
  opacity: 0;
  transition: opacity 0.3s;
  overflow: hidden;
}
.preview-page.show {
  display: flex;
  opacity: 1;
}

/* Header */
.preview-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  flex-shrink: 0;
}
.header-title {
  font-size: 17px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.02em;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-btn {
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  opacity: 0.9;
  transition: opacity 0.15s;
}
.header-btn:hover { opacity: 1; }
.header-btn.back {
  width: 36px;
  height: 36px;
}
.header-btn.new-badge {
  position: relative;
  gap: 4px;
}
.new-label {
  background: #ff3b30;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 4px;
  line-height: 1;
}

/* Map Area */
.map-preview-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px 16px;
  min-height: 0;
}
.map-card {
  width: 100%;
  max-width: 420px;
  background: #1a2744;
  border-radius: 20px;
  overflow: hidden;
  position: relative;
}
.map-preview-area.vertical .map-card { aspect-ratio: 9 / 16; }
.map-preview-area.horizontal .map-card { aspect-ratio: 16 / 9; }
.map-preview-area.square .map-card { aspect-ratio: 1 / 1; }

/* 3D Scene: perspective on container, transform on plane */
.map-3d-scene {
  position: absolute;
  inset: 0;
  perspective: 800px;
  overflow: hidden;
}
.map-3d-plane {
  position: absolute;
  inset: -25%; /* 比容器大 50%，确保旋转后填满 */
  transform: rotateX(25deg);
  transform-origin: center 65%;
}
.map-inner {
  width: 100%;
  height: 100%;
}

.map-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(15, 27, 46, 0.8);
  font-size: 13px;
  color: #8b9bb4;
  z-index: 5;
}
.recording-badge {
  position: absolute;
  top: 12px; right: 12px;
  background: rgba(220, 38, 38, 0.9);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 20px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
}
.rec-dot {
  width: 7px; height: 7px;
  background: #fff;
  border-radius: 50%;
  animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

/* Video Preview */
.video-preview-area {
  position: absolute;
  top: 60px;
  left: 16px;
  right: 16px;
  bottom: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
.video-preview-area .map-card {
  max-width: 420px;
  width: 100%;
  height: 100%;
}
.preview-video-el {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}
.btn-close-preview {
  position: absolute;
  top: 8px; right: 8px;
  width: 28px; height: 28px;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
  color: #fff;
  border: none;
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 10;
}

/* Controls Section */
.controls-section {
  padding: 0 20px 24px;
  flex-shrink: 0;
}

/* Slider */
.slider-row {
  margin-bottom: 20px;
}
.slider-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  color: #fff;
  font-size: 15px;
  font-weight: 500;
}
.slider-value {
  font-size: 17px;
  font-weight: 600;
  color: #fff;
}
.slider-track {
  position: relative;
  width: 100%;
  height: 8px;
  background: rgba(255,255,255,0.15);
  border-radius: 4px;
}
.slider-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: #f5a623;
  border-radius: 4px;
  pointer-events: none;
}
.slider-input {
  position: absolute;
  left: 0;
  top: -7px;
  width: 100%;
  height: 22px;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
  margin: 0;
}
.slider-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  border: 3px solid #f5a623;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  cursor: grab;
}
.slider-input::-webkit-slider-thumb:active {
  cursor: grabbing;
  transform: scale(1.1);
}
.slider-input::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  border: 3px solid #f5a623;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  cursor: grab;
}

/* Toolbar */
.toolbar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 32px;
  margin: 8px 0 20px;
}
.tool-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  transition: color 0.15s;
}
.tool-btn:hover { color: rgba(255,255,255,0.8); }
.tool-btn.active { color: #fff; }
.tool-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Convert Progress */
.convert-progress {
  margin-bottom: 16px;
  text-align: center;
}
.convert-bar {
  width: 100%;
  height: 6px;
  background: rgba(255,255,255,0.15);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}
.convert-fill {
  height: 100%;
  background: #f5a623;
  border-radius: 3px;
  transition: width 0.3s;
}
.convert-text {
  font-size: 13px;
  color: #8b9bb4;
}

/* Save Button */
.save-btn {
  width: 100%;
  padding: 16px 20px;
  border-radius: 28px;
  border: none;
  background: #fff;
  color: #0f1b2e;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}
.save-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.2);
}
.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Stats */
.record-stats {
  text-align: center;
  margin-top: 10px;
  font-size: 12px;
  color: #8b9bb4;
}
.save-hint {
  text-align: center;
  font-size: 13px;
  color: #34c759;
  margin-top: 8px;
}
</style>
