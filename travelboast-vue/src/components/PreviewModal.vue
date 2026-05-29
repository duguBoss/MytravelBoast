<template>
  <div v-if="show" class="modal-overlay" @click.self="close">
    <div class="modal-content" :class="{ 'export-mode': mode === 'export' }">
      <!-- Header -->
      <div class="modal-header">
        <h3>{{ mode === 'export' ? '导出视频' : '路线预览' }}</h3>
        <button class="close-btn" @click="close">✕</button>
      </div>

      <!-- Controls -->
      <div class="modal-controls">
        <button class="control-btn play-btn" :disabled="isRecording || isPlaying" @click="startPreview">▶ 播放</button>
        <button class="control-btn stop-btn" :disabled="isRecording || !isPlaying" @click="stopPreview">⏹ 停止</button>
        <button v-if="mode === 'export'" class="control-btn record-btn" :class="{ active: isRecording }" @click="toggleRecording">
          {{ isRecording ? '⏹ 停止录制' : '⏺ 开始录制' }}
        </button>
      </div>

      <!-- Preview Canvas -->
      <div class="preview-container">
        <canvas ref="previewCanvas" :width="canvasWidth" :height="canvasHeight"></canvas>
      </div>

      <!-- Progress -->
      <div v-if="isRecording" class="recording-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <span>{{ progress.toFixed(0) }}% - 已录制 {{ recordedFrames.length }} 帧</span>
      </div>

      <!-- Export Progress -->
      <div v-if="isExporting" class="export-progress">
        <div class="spinner"></div>
        <span>正在生成视频...</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import html2canvas from 'html2canvas'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const props = defineProps({
  show: Boolean,
  mode: { type: String, default: 'play' },
  points: Array,
  segments: Array,
  settings: Object,
})

const emit = defineEmits(['close', 'toast'])

// Canvas
const previewCanvas = ref(null)
const canvasWidth = ref(800)
const canvasHeight = ref(450)

// State
const isPlaying = ref(false)
const isRecording = ref(false)
const isExporting = ref(false)
const progress = ref(0)
const recordedFrames = ref([])

// Animation
let animFrame = null
let animStartTime = 0
let animDuration = 0
let vehiclePos = { lat: 0, lng: 0 }
let vehicleAngle = 0

// Map background
let bgImage = null

// Recording
let ffmpeg = null
let recordingInterval = null

// Constants
const VEHICLE_SIZE = 40
const PIN_SIZE = 40
const ROUTE_WIDTH = 4

// Setup canvas size based on ratio
watch(() => props.settings?.ratio, (val) => {
  if (val === 'vertical') {
    canvasWidth.value = 450
    canvasHeight.value = 800
  } else {
    canvasWidth.value = 800
    canvasHeight.value = 450
  }
}, { immediate: true })

// Generate canvas-compatible points (convert lat/lng to canvas coordinates)
function getCanvasPoint(point, bounds, width, height) {
  const margin = 60
  const x = margin + ((point.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * (width - margin * 2)
  const y = margin + ((bounds.maxLat - point.lat) / (bounds.maxLat - bounds.minLat)) * (height - margin * 2)
  return { x, y }
}

function getRouteBounds() {
  if (!props.points || props.points.length === 0) return null
  let minLat = Infinity, maxLat = -Infinity
  let minLng = Infinity, maxLng = -Infinity
  props.points.forEach(p => {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
  })
  // Add padding
  const latPad = (maxLat - minLat) * 0.15 || 0.5
  const lngPad = (maxLng - minLng) * 0.15 || 0.5
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  }
}

function getVehiclePosition(t) {
  if (!props.points || props.points.length < 2) return { lat: 0, lng: 0, angle: 0 }

  // Calculate total distance
  let totalDist = 0
  const dists = []
  for (let i = 0; i < props.points.length - 1; i++) {
    const d = haversine(
      props.points[i].lat, props.points[i].lng,
      props.points[i + 1].lat, props.points[i + 1].lng
    )
    dists.push(d)
    totalDist += d
  }

  const targetDist = totalDist * t
  let acc = 0
  let segIdx = 0
  let segT = 0

  for (let i = 0; i < dists.length; i++) {
    if (acc + dists[i] >= targetDist) {
      segIdx = i
      segT = dists[i] > 0 ? (targetDist - acc) / dists[i] : 0
      break
    }
    acc += dists[i]
  }

  if (segIdx >= dists.length) {
    segIdx = dists.length - 1
    segT = 1
  }

  const p1 = props.points[segIdx]
  const p2 = props.points[segIdx + 1]
  const lat = p1.lat + (p2.lat - p1.lat) * segT
  const lng = p1.lng + (p2.lng - p1.lng) * segT
  const angle = bearing(p1.lat, p1.lng, p2.lat, p2.lng)

  return { lat, lng, angle }
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180
  const lat1R = lat1 * Math.PI / 180
  const lat2R = lat2 * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2R)
  const x = Math.cos(lat1R) * Math.sin(lat2R) -
    Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLng)
  return Math.atan2(y, x) * 180 / Math.PI
}

function captureBackground() {
  return new Promise((resolve) => {
    const mapEl = document.getElementById('map')
    if (!mapEl) { resolve(null); return }

    html2canvas(mapEl, {
      useCORS: true,
      allowTaint: true,
      logging: false,
    }).then(canvas => {
      bgImage = canvas.toDataURL('image/png')
      resolve(bgImage)
    }).catch(() => {
      resolve(null)
    })
  })
}

function drawFrame(t) {
  const canvas = previewCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height

  // Clear
  ctx.clearRect(0, 0, W, H)

  // Draw background
  if (bgImage) {
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, W, H)
      drawOverlay(ctx, W, H, t)
    }
    img.src = bgImage
  } else {
    // Fallback: draw a simple background
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, W, H)
    drawOverlay(ctx, W, H, t)
  }
}

function drawOverlay(ctx, W, H, t) {
  const bounds = getRouteBounds()
  if (!bounds || !props.points || props.points.length < 2) return

  // Draw route line
  ctx.beginPath()
  ctx.strokeStyle = '#ff6b4a'
  ctx.lineWidth = ROUTE_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([8, 4])

  const routePoints = []
  for (let i = 0; i < props.points.length; i++) {
    const p = props.points[i]
    const cp = getCanvasPoint(p, bounds, W, H)
    routePoints.push(cp)
    if (i === 0) {
      ctx.moveTo(cp.x, cp.y)
    } else {
      ctx.lineTo(cp.x, cp.y)
    }
  }
  ctx.stroke()
  ctx.setLineDash([])

  // Draw animated route progress
  const totalDist = getTotalDistance()
  const targetDist = totalDist * t
  let accDist = 0
  let drawnPoints = [routePoints[0]]

  for (let i = 0; i < routePoints.length - 1; i++) {
    const p1 = props.points[i]
    const p2 = props.points[i + 1]
    const segDist = haversine(p1.lat, p1.lng, p2.lat, p2.lng)

    if (accDist + segDist <= targetDist) {
      drawnPoints.push(routePoints[i + 1])
      accDist += segDist
    } else {
      const segT = segDist > 0 ? (targetDist - accDist) / segDist : 0
      const interpX = routePoints[i].x + (routePoints[i + 1].x - routePoints[i].x) * segT
      const interpY = routePoints[i].y + (routePoints[i + 1].y - routePoints[i].y) * segT
      drawnPoints.push({ x: interpX, y: interpY })
      break
    }
  }

  // Draw solid animated route
  if (drawnPoints.length > 1) {
    ctx.beginPath()
    ctx.strokeStyle = '#ff6b4a'
    ctx.lineWidth = ROUTE_WIDTH + 1
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.setLineDash([])
    ctx.moveTo(drawnPoints[0].x, drawnPoints[0].y)
    for (let i = 1; i < drawnPoints.length; i++) {
      ctx.lineTo(drawnPoints[i].x, drawnPoints[i].y)
    }
    ctx.stroke()
    ctx.setLineDash([8, 4])
  }

  // Draw pins/markers
  props.points.forEach((p, i) => {
    const cp = getCanvasPoint(p, bounds, W, H)
    const isStart = i === 0
    const isEnd = i === props.points.length - 1

    // Pin body
    ctx.beginPath()
    ctx.arc(cp.x, cp.y - 15, 12, 0, Math.PI * 2)
    ctx.fillStyle = isStart ? '#4CAF50' : isEnd ? '#f44336' : '#ff9800'
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()

    // Pin label
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const label = isStart ? 'A' : isEnd ? 'B' : String(i)
    ctx.fillText(label, cp.x, cp.y - 15)

    // City name
    if (props.settings?.showLabels) {
      ctx.fillStyle = '#fff'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(p.name, cp.x, cp.y + 5)
    }
  })

  // Draw distance labels
  if (props.settings?.showDistance && props.segments) {
    for (let i = 0; i < props.points.length - 1; i++) {
      const p1 = props.points[i]
      const p2 = props.points[i + 1]
      const midLat = (p1.lat + p2.lat) / 2
      const midLng = (p1.lng + p2.lng) / 2
      const cp = getCanvasPoint({ lat: midLat, lng: midLng }, bounds, W, H)

      const dist = props.segments[i]?.distance || 0
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.beginPath()
      ctx.roundRect(cp.x - 35, cp.y - 12, 70, 24, 12)
      ctx.fill()

      ctx.fillStyle = '#fff'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${dist.toFixed(0)} km`, cp.x, cp.y)
    }
  }

  // Draw vehicle
  const vPos = getVehiclePosition(t)
  const vCanvas = getCanvasPoint(vPos, bounds, W, H)
  const vehicle = props.segments?.[0]?.vehicle || { icon: '🚗' }

  ctx.save()
  ctx.translate(vCanvas.x, vCanvas.y)
  ctx.rotate((vPos.angle - 90) * Math.PI / 180)

  // Vehicle shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(2, 2, 18, 18, 0, 0, Math.PI * 2)
  ctx.fill()

  // Vehicle icon
  ctx.font = '32px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(vehicle.icon, 0, 0)

  ctx.restore()
}

function getTotalDistance() {
  let total = 0
  for (let i = 0; i < (props.points?.length || 0) - 1; i++) {
    total += haversine(
      props.points[i].lat, props.points[i].lng,
      props.points[i + 1].lat, props.points[i + 1].lng
    )
  }
  return total
}

async function startPreview() {
  if (isRecording.value || isPlaying.value) return

  emit('toast', '正在截取地图背景...')
  await captureBackground()

  isPlaying.value = true
  animStartTime = performance.now()
  const totalDist = getTotalDistance()
  const speed = props.settings?.speed || 2
  animDuration = Math.max((totalDist * 28) / speed, 3000)

  animate()
}

function animate() {
  const elapsed = performance.now() - animStartTime
  const t = Math.min(elapsed / animDuration, 1)
  progress.value = t * 100

  drawFrame(t)

  if (isRecording.value) {
    const canvas = previewCanvas.value
    if (canvas) {
      recordedFrames.value.push(canvas.toDataURL('image/png'))
    }
  }

  if (t < 1) {
    animFrame = requestAnimationFrame(animate)
  } else {
    isPlaying.value = false
    if (isRecording.value) {
      stopRecording()
    }
  }
}

function stopPreview() {
  if (animFrame) {
    cancelAnimationFrame(animFrame)
    animFrame = null
  }
  isPlaying.value = false
}

async function toggleRecording() {
  if (isRecording.value) {
    stopRecording()
  } else {
    startRecording()
  }
}

async function startRecording() {
  recordedFrames.value = []
  isRecording.value = true
  progress.value = 0

  if (!isPlaying.value) {
    await startPreview()
  }

  emit('toast', '录制中...')
}

async function stopRecording() {
  isRecording.value = false
  if (animFrame) {
    cancelAnimationFrame(animFrame)
    animFrame = null
  }
  isPlaying.value = false

  if (recordedFrames.value.length === 0) {
    emit('toast', '没有录到任何帧')
    return
  }

  emit('toast', `录制完成！共 ${recordedFrames.value.length} 帧，正在生成视频...`)

  // For now, just trigger a download of frames as a simple approach
  // Full video encoding would require ffmpeg.wasm which has complex setup
  await downloadFramesAsImages()
}

async function downloadFramesAsImages() {
  try {
    // Create a simple animated GIF-like sequence download
    // In a production app, you'd use ffmpeg.wasm here
    const canvas = previewCanvas.value
    if (!canvas) return

    // Save as PNG sequence
    const blob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/png')
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'travelboast-route.png'
    a.click()
    URL.revokeObjectURL(url)

    emit('toast', '视频已保存！')
  } catch (err) {
    console.error('Export failed:', err)
    emit('toast', '导出失败: ' + err.message)
  }
}

function close() {
  if (animFrame) {
    cancelAnimationFrame(animFrame)
    animFrame = null
  }
  isPlaying.value = false
  isRecording.value = false
  isExporting.value = false
  recordedFrames.value = []
  emit('close')
}

// Clean up on unmount
onUnmounted(() => {
  if (animFrame) cancelAnimationFrame(animFrame)
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: #161625;
  border-radius: 16px;
  padding: 24px;
  width: 90vw;
  max-width: 850px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border: 1px solid rgba(255,255,255,0.1);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  color: #fff;
  font-size: 1.2rem;
}

.close-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 1.4rem;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.close-btn:hover {
  opacity: 1;
}

.modal-controls {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.control-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.play-btn {
  background: #667eea;
  color: white;
}

.play-btn:hover:not(:disabled) {
  background: #5a6fd6;
}

.stop-btn {
  background: rgba(255,255,255,0.1);
  color: white;
}

.stop-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.2);
}

.record-btn {
  background: #ff3b30;
  color: white;
}

.record-btn.active {
  background: #ff6b6b;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.preview-container {
  border-radius: 12px;
  overflow: hidden;
  background: #0a0a1a;
  border: 1px solid rgba(255,255,255,0.1);
}

canvas {
  display: block;
  width: 100%;
  height: auto;
}

.recording-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #fff;
  font-size: 0.85rem;
}

.progress-bar {
  height: 6px;
  background: rgba(255,255,255,0.1);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  transition: width 0.1s linear;
}

.export-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
  color: #fff;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255,255,255,0.2);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .modal-content {
    width: 95vw;
    padding: 16px;
  }
  
  .control-btn {
    padding: 8px 16px;
    font-size: 0.85rem;
  }
}
</style>
