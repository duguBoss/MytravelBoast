<template>
  <div v-if="show" class="modal-overlay" @click.self="close">
    <div class="modal-content" :class="{ 'export-mode': mode === 'export' }">
      <div class="modal-header">
        <h3>{{ mode === 'export' ? '导出视频' : '路线预览' }}</h3>
        <button class="close-btn" @click="close">✕</button>
      </div>

      <div class="modal-controls">
        <button class="control-btn play-btn" :disabled="isRecording || isPlaying" @click="startPreview">▶ 播放</button>
        <button class="control-btn stop-btn" :disabled="isRecording || !isPlaying" @click="stopPreview">⏹ 停止</button>
        <button v-if="mode === 'export'" class="control-btn record-btn" :class="{ active: isRecording }" @click="toggleRecording">
          {{ isRecording ? '⏹ 停止录制' : '⏺ 开始录制' }}
        </button>
      </div>

      <div class="preview-container">
        <canvas ref="previewCanvas" :width="canvasWidth" :height="canvasHeight"></canvas>
      </div>

      <div class="controls-section" v-if="mode === 'export'">
        <!-- 视频时长 -->
        <div class="control-slider">
          <div class="slider-label">
            <span>视频时长</span>
            <span class="slider-value">{{ localSettings.videoDuration }} 秒</span>
          </div>
          <input type="range" min="5" max="60" :value="localSettings.videoDuration" step="1" 
                 class="custom-slider" @input="e => updateLocal('videoDuration', parseFloat(e.target.value))">
        </div>

        <!-- 交通工具大小 -->
        <div class="control-slider">
          <div class="slider-label">
            <span>交通工具大小</span>
            <span class="slider-value">{{ localSettings.vehicleScale.toFixed(2) }}</span>
          </div>
          <input type="range" min="0.3" max="1.5" :value="localSettings.vehicleScale" step="0.05" 
                 class="custom-slider" @input="e => updateLocal('vehicleScale', parseFloat(e.target.value))">
        </div>

        <!-- 视频质量 -->
        <div class="control-slider">
          <div class="slider-label">
            <span>视频质量</span>
            <span class="slider-value">{{ qualityLabels[localSettings.videoQuality] }}</span>
          </div>
          <div class="quality-buttons">
            <button v-for="(label, key) in qualityLabels" :key="key"
                    class="quality-btn" :class="{ active: localSettings.videoQuality === key }"
                    @click="updateLocal('videoQuality', key)">
              {{ label }}
            </button>
          </div>
        </div>

        <!-- 水印开关 -->
        <div class="toggle-row">
          <span>显示水印</span>
          <label class="toggle-switch">
            <input type="checkbox" :checked="localSettings.showWatermark" 
                   @change="e => updateLocal('showWatermark', e.target.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div v-if="isRecording" class="recording-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <span>{{ progress.toFixed(0) }}% - {{ frameInfo }}</span>
      </div>

      <div v-if="isExporting" class="export-progress">
        <div class="spinner"></div>
        <span>{{ exportStatus }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import html2canvas from 'html2canvas'
import { recordVideo, saveVideoFile, generateFilename, getPresetForRatio, convertWebMToMP4 } from '../utils/videoRecorder.js'

const props = defineProps({
  show: Boolean,
  mode: { type: String, default: 'play' },
  points: Array,
  segments: Array,
  settings: Object,
  mapInstance: Object,
})

const emit = defineEmits(['close', 'toast', 'update:settings'])

const qualityLabels = { draft: '草稿', standard: '标准', high: '高清' }

const previewCanvas = ref(null)
const canvasWidth = ref(800)
const canvasHeight = ref(450)

const isPlaying = ref(false)
const isRecording = ref(false)
const isExporting = ref(false)
const progress = ref(0)
const frameInfo = ref('')
const exportStatus = ref('')
const mapBackground = ref(null)

let animFrame = null
let animStartTime = 0
let animDuration = 0

let smoothCamX = 0
let smoothCamY = 0
let smoothCamZoom = 1

const ROUTE_WIDTH = 4

const localSettings = ref({
  videoDuration: 15,
  vehicleScale: 0.65,
  videoQuality: 'standard',
  showWatermark: true,
})

watch(() => props.settings, (val) => {
  if (val) {
    localSettings.value.videoDuration = val.videoDuration ?? 15
    localSettings.value.vehicleScale = val.vehicleScale ?? 0.65
  }
}, { immediate: true, deep: true })

watch(() => props.settings?.ratio, (val) => {
  if (val === 'vertical') {
    canvasWidth.value = 450
    canvasHeight.value = 800
  } else if (val === 'square') {
    canvasWidth.value = 600
    canvasHeight.value = 600
  } else {
    canvasWidth.value = 800
    canvasHeight.value = 450
  }
}, { immediate: true })

watch(() => props.show, (val) => {
  if (val) {
    loadMapBackground()
  }
})

function updateLocal(key, value) {
  localSettings.value[key] = value
  emit('update:settings', { ...props.settings, [key]: value })
}

function latLngToCanvas(lat, lng, W, H) {
  if (!props.mapInstance) return { x: W / 2, y: H / 2 }
  const map = props.mapInstance
  const mSize = map.getSize()
  const pt = map.latLngToContainerPoint([lat, lng])
  return {
    x: pt.x * (W / mSize.x),
    y: pt.y * (H / mSize.y)
  }
}

function getVehiclePosition(t) {
  if (!props.points || props.points.length < 2) return { lat: 0, lng: 0, angle: 0 }

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

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function getCameraState(t, W, H) {
  if (!props.points || props.points.length < 2) {
    return { x: W / 2, y: H / 2, zoom: 1 }
  }

  const startPos = props.points[0]
  const endPos = props.points[props.points.length - 1]
  const startCanvas = latLngToCanvas(startPos.lat, startPos.lng, W, H)
  const endCanvas = latLngToCanvas(endPos.lat, endPos.lng, W, H)

  const vPos = getVehiclePosition(t)
  const vCanvas = latLngToCanvas(vPos.lat, vPos.lng, W, H)

  const routeCenterX = (startCanvas.x + endCanvas.x) / 2
  const routeCenterY = (startCanvas.y + endCanvas.y) / 2

  let camX, camY, zoom

  if (t < 0.08) {
    const phase = easeOutCubic(t / 0.08)
    camX = startCanvas.x
    camY = startCanvas.y
    zoom = 2.8 - phase * 0.6
  } else if (t < 0.2) {
    const phase = easeInOutCubic((t - 0.08) / 0.12)
    camX = startCanvas.x + (vCanvas.x - startCanvas.x) * phase
    camY = startCanvas.y + (vCanvas.y - startCanvas.y) * phase
    zoom = 2.2 - phase * 0.6
  } else if (t < 0.8) {
    const lookAhead = Math.min(t + 0.05, 1)
    const aheadPos = getVehiclePosition(lookAhead)
    const aheadCanvas = latLngToCanvas(aheadPos.lat, aheadPos.lng, W, H)

    camX = vCanvas.x * 0.6 + aheadCanvas.x * 0.4
    camY = vCanvas.y * 0.6 + aheadCanvas.y * 0.4

    const distFromCenter = Math.sqrt(Math.pow(vCanvas.x - routeCenterX, 2) + Math.pow(vCanvas.y - routeCenterY, 2))
    const maxDist = Math.sqrt(W * W + H * H) / 3
    const distRatio = Math.min(distFromCenter / maxDist, 1)
    zoom = 1.6 - distRatio * 0.3
  } else if (t < 0.92) {
    const phase = easeInOutCubic((t - 0.8) / 0.12)
    camX = vCanvas.x + (endCanvas.x - vCanvas.x) * phase
    camY = vCanvas.y + (endCanvas.y - vCanvas.y) * phase
    zoom = 1.3 + phase * 0.9
  } else {
    const phase = easeInOutCubic((t - 0.92) / 0.08)
    camX = endCanvas.x
    camY = endCanvas.y
    zoom = 2.2 + phase * 0.6
  }

  return { x: camX, y: camY, zoom }
}

async function loadMapBackground() {
  try {
    const mapEl = document.getElementById('map')
    if (!mapEl) return

    emit('toast', '正在加载地图背景...')

    const canvas = await html2canvas(mapEl, {
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: null,
      scale: 2,
    })

    mapBackground.value = canvas

    const W = canvasWidth.value
    const H = canvasHeight.value
    const startCam = getCameraState(0, W, H)
    smoothCamX = startCam.x
    smoothCamY = startCam.y
    smoothCamZoom = startCam.zoom

    emit('toast', '地图加载完成')
  } catch (err) {
    console.error('加载地图失败:', err)
    emit('toast', '地图加载失败')
    mapBackground.value = null
  }
}

function drawFrame(ctx, W, H, t) {
  ctx.clearRect(0, 0, W, H)

  const targetCam = getCameraState(t, W, H)

  const smoothFactor = 0.12
  smoothCamX += (targetCam.x - smoothCamX) * smoothFactor
  smoothCamY += (targetCam.y - smoothCamY) * smoothFactor
  smoothCamZoom += (targetCam.zoom - smoothCamZoom) * smoothFactor

  const camX = smoothCamX
  const camY = smoothCamY
  const zoom = smoothCamZoom

  ctx.save()

  ctx.translate(W / 2, H / 2)
  ctx.scale(zoom, zoom)
  ctx.translate(-camX, -camY)

  if (mapBackground.value) {
    ctx.drawImage(mapBackground.value, 0, 0, W, H)
  } else {
    const gradient = ctx.createLinearGradient(0, 0, W, H)
    gradient.addColorStop(0, '#1a1a2e')
    gradient.addColorStop(0.5, '#16213e')
    gradient.addColorStop(1, '#0f3460')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, W, H)
  }

  if (props.points && props.points.length >= 2) {
    drawRoute(ctx, W, H, t)
    drawPins(ctx, W, H)
    drawDistanceLabels(ctx, W, H)
    drawVehicle(ctx, W, H, t)
  }

  ctx.restore()

  drawVignette(ctx, W, H, zoom)

  if (localSettings.value.showWatermark !== false) {
    drawWatermark(ctx, W, H)
  }
}

function drawVignette(ctx, W, H, zoom) {
  const intensity = Math.min((zoom - 1) * 0.15, 0.35)
  if (intensity <= 0) return

  const gradient = ctx.createRadialGradient(
    W / 2, H / 2, Math.min(W, H) * 0.3,
    W / 2, H / 2, Math.max(W, H) * 0.7
  )
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, `rgba(0,0,0,${intensity})`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, W, H)
}

function drawWatermark(ctx, W, H) {
  ctx.save()
  
  const padding = 16
  const fontSize = 14
  
  ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  
  const text1 = 'TravelBoast'
  const text2 = 'Made with ❤️'
  
  const w1 = ctx.measureText(text1).width
  const w2 = ctx.measureText(text2).width
  const maxWidth = Math.max(w1, w2)
  
  const boxX = W - maxWidth - padding * 2 - 8
  const boxY = H - fontSize * 2.8 - padding
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.beginPath()
  ctx.roundRect(boxX, boxY, maxWidth + padding * 2, fontSize * 2.8, 8)
  ctx.fill()
  
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.fillText(text1, boxX + padding, boxY + padding)
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
  ctx.font = `${fontSize - 2}px sans-serif`
  ctx.fillText(text2, boxX + padding, boxY + padding + fontSize + 4)
  
  ctx.restore()
}

function drawRoute(ctx, W, H, t) {
  const routePoints = []
  for (let i = 0; i < props.points.length; i++) {
    routePoints.push(latLngToCanvas(props.points[i].lat, props.points[i].lng, W, H))
  }

  ctx.beginPath()
  ctx.strokeStyle = 'rgba(255, 107, 74, 0.25)'
  ctx.lineWidth = ROUTE_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([8, 4])
  ctx.moveTo(routePoints[0].x, routePoints[0].y)
  for (let i = 1; i < routePoints.length; i++) {
    ctx.lineTo(routePoints[i].x, routePoints[i].y)
  }
  ctx.stroke()
  ctx.setLineDash([])

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

  if (drawnPoints.length > 1) {
    ctx.beginPath()
    ctx.strokeStyle = '#ff6b4a'
    ctx.lineWidth = ROUTE_WIDTH + 1
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = '#ff6b4a'
    ctx.shadowBlur = 15
    ctx.moveTo(drawnPoints[0].x, drawnPoints[0].y)
    for (let i = 1; i < drawnPoints.length; i++) {
      ctx.lineTo(drawnPoints[i].x, drawnPoints[i].y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }
}

function drawPins(ctx, W, H) {
  props.points.forEach((p, i) => {
    const cp = latLngToCanvas(p.lat, p.lng, W, H)
    const isStart = i === 0
    const isEnd = i === props.points.length - 1

    ctx.beginPath()
    ctx.arc(cp.x, cp.y - 15, 14, 0, Math.PI * 2)
    const gradient = ctx.createRadialGradient(cp.x - 3, cp.y - 18, 0, cp.x, cp.y - 15, 14)
    gradient.addColorStop(0, isStart ? '#66bb6a' : isEnd ? '#ef5350' : '#ffa726')
    gradient.addColorStop(1, isStart ? '#2e7d32' : isEnd ? '#c62828' : '#ef6c00')
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 3
    ctx.stroke()

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const label = isStart ? 'A' : isEnd ? 'B' : String(i)
    ctx.fillText(label, cp.x, cp.y - 15)

    if (props.settings?.showLabels) {
      ctx.fillStyle = '#fff'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(p.name, cp.x, cp.y + 8)
    }
  })
}

function drawDistanceLabels(ctx, W, H) {
  if (props.settings?.showDistance && props.segments) {
    for (let i = 0; i < props.points.length - 1; i++) {
      const p1 = props.points[i]
      const p2 = props.points[i + 1]
      const midLat = (p1.lat + p2.lat) / 2
      const midLng = (p1.lng + p2.lng) / 2
      const cp = latLngToCanvas(midLat, midLng, W, H)

      const dist = props.segments[i]?.distance || 0

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
      ctx.beginPath()
      ctx.roundRect(cp.x - 40, cp.y - 14, 80, 28, 14)
      ctx.fill()

      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${dist.toFixed(0)} km`, cp.x, cp.y)
    }
  }
}

function drawVehicle(ctx, W, H, t) {
  const vPos = getVehiclePosition(t)
  const vCanvas = latLngToCanvas(vPos.lat, vPos.lng, W, H)
  const vehicle = props.segments?.[0]?.vehicle || { icon: '🚗' }
  const scale = localSettings.value.vehicleScale || 0.65

  ctx.save()
  ctx.translate(vCanvas.x, vCanvas.y)
  ctx.rotate((vPos.angle - 90) * Math.PI / 180)
  ctx.scale(scale, scale)

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
  ctx.beginPath()
  ctx.ellipse(4, 4, 20, 16, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.font = '36px sans-serif'
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

  if (!mapBackground.value) {
    await loadMapBackground()
  }

  isPlaying.value = true
  animStartTime = performance.now()
  animDuration = (localSettings.value.videoDuration || 15) * 1000

  const W = canvasWidth.value
  const H = canvasHeight.value
  const startCam = getCameraState(0, W, H)
  smoothCamX = startCam.x
  smoothCamY = startCam.y
  smoothCamZoom = startCam.zoom

  animate()
}

function animate() {
  const elapsed = performance.now() - animStartTime
  const t = Math.min(elapsed / animDuration, 1)
  progress.value = t * 100

  const canvas = previewCanvas.value
  if (canvas) {
    const ctx = canvas.getContext('2d')
    drawFrame(ctx, canvas.width, canvas.height, t)
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
  if (!mapBackground.value) {
    await loadMapBackground()
  }

  isRecording.value = true
  progress.value = 0

  emit('toast', '正在录制...')

  const canvas = previewCanvas.value
  if (!canvas) {
    emit('toast', '画布初始化失败')
    return
  }

  const duration = (localSettings.value.videoDuration || 15) * 1000
  const quality = localSettings.value.videoQuality || 'standard'

  const W = canvasWidth.value
  const H = canvasHeight.value
  const startCam = getCameraState(0, W, H)
  smoothCamX = startCam.x
  smoothCamY = startCam.y
  smoothCamZoom = startCam.zoom

  try {
    isExporting.value = true
    exportStatus.value = '正在录制视频...'

    const preset = getPresetForRatio(props.settings?.ratio, quality)

    const result = await recordVideo(canvas, drawFrame, {
      duration,
      fps: preset.fps,
      bitrate: preset.bitrate,
      onProgress: (pct, info) => {
        progress.value = pct
        frameInfo.value = `${info.frame}/${info.totalFrames} 帧`
      }
    })

    exportStatus.value = '正在转换为MP4...'
    emit('toast', '正在转换格式...')
    
    let finalBlob = result.blob
    let format = 'webm'
    
    try {
      emit('toast', '正在转换MP4格式...')
      finalBlob = await convertWebMToMP4(result.blob, (pct) => {
        exportStatus.value = `转换中 ${Math.round(pct)}%`
      })
      format = 'mp4'
    } catch (convertErr) {
      console.warn('MP4转换失败，使用WebM格式:', convertErr)
      format = 'webm'
    }

    exportStatus.value = '正在保存视频...'
    const filename = generateFilename({
      ratio: props.settings?.ratio,
      quality,
      points: props.points,
      format
    })

    const saveResult = await saveVideoFile(finalBlob, {
      suggestedName: filename,
      format
    })

    if (saveResult.success) {
      emit('toast', `视频已保存！${(finalBlob.size / 1024 / 1024).toFixed(2)} MB`)
    } else if (saveResult.aborted) {
      emit('toast', '已取消保存')
    } else {
      emit('toast', '保存失败: ' + (saveResult.error || '未知错误'))
    }
  } catch (err) {
    console.error('Recording error:', err)
    emit('toast', '录制失败: ' + err.message)
  } finally {
    isRecording.value = false
    isPlaying.value = false
    isExporting.value = false
    exportStatus.value = ''
  }
}

function stopRecording() {
  isRecording.value = false
}

function close() {
  if (animFrame) {
    cancelAnimationFrame(animFrame)
    animFrame = null
  }
  isPlaying.value = false
  isRecording.value = false
  isExporting.value = false
  progress.value = 0
  frameInfo.value = ''
  emit('close')
}

onUnmounted(() => {
  if (animFrame) cancelAnimationFrame(animFrame)
})
</script>

<style scoped>
.quality-buttons {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.quality-btn {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  border: 2px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.05);
  color: #aaa;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.quality-btn.active {
  border-color: #ff6b4a;
  color: #ff6b4a;
  background: rgba(255,107,74,0.1);
}
.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255,255,255,0.05);
  border-radius: 16px;
  color: #fff;
  font-weight: 600;
  font-size: 15px;
}
.toggle-switch {
  position: relative;
  width: 48px;
  height: 26px;
  cursor: pointer;
}
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.15);
  border-radius: 26px;
  transition: 0.3s;
}
.toggle-slider::before {
  content: '';
  position: absolute;
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.3s;
}
.toggle-switch input:checked + .toggle-slider {
  background: #ff6b4a;
}
.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(22px);
}
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(8px); }
.modal-content { background: #161625; border-radius: 20px; padding: 24px; width: 90vw; max-width: 900px; max-height: 90vh; display: flex; flex-direction: column; gap: 16px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
.modal-header { display: flex; justify-content: space-between; align-items: center; }
.modal-header h3 { color: #fff; font-size: 1.3rem; font-weight: 600; }
.close-btn { background: rgba(255,255,255,0.1); border: none; color: #fff; font-size: 1.4rem; cursor: pointer; opacity: 0.7; transition: all 0.2s; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.close-btn:hover { opacity: 1; background: rgba(255,255,255,0.2); }
.modal-controls { display: flex; gap: 12px; justify-content: center; }
.control-btn { padding: 12px 28px; border-radius: 12px; border: none; font-size: 1rem; cursor: pointer; transition: all 0.2s; font-weight: 600; }
.control-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.play-btn { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); }
.play-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5); }
.stop-btn { background: rgba(255,255,255,0.1); color: white; }
.stop-btn:hover:not(:disabled) { background: rgba(255,255,255,0.2); }
.record-btn { background: linear-gradient(135deg, #ff3b30 0%, #ff6b6b 100%); color: white; box-shadow: 0 4px 15px rgba(255, 59, 48, 0.4); }
.record-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(255, 59, 48, 0.5); }
.record-btn.active { animation: pulse 1s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
.preview-container { border-radius: 16px; overflow: hidden; background: #0a0a1a; border: 1px solid rgba(255,255,255,0.1); flex: 1; display: flex; align-items: center; justify-content: center; }
canvas { display: block; max-width: 100%; max-height: 60vh; border-radius: 12px; }
.controls-section { display: flex; flex-direction: column; gap: 16px; padding: 16px 0; }
.control-slider { background: rgba(255, 255, 255, 0.05); padding: 16px; border-radius: 16px; }
.control-slider .slider-label { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.control-slider .slider-label span:first-child { color: #fff; font-weight: 600; font-size: 15px; }
.control-slider .slider-label .slider-value { color: #ff6b4a; font-weight: 700; font-size: 16px; }
.control-slider .custom-slider { width: 100%; height: 8px; border-radius: 4px; background: linear-gradient(to right, #ff6b4a 0%, #ff6b4a var(--pct, 50%), rgba(255,255,255,0.1) var(--pct, 50%), rgba(255,255,255,0.1) 100%); -webkit-appearance: none; appearance: none; cursor: pointer; }
.control-slider .custom-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 28px; height: 28px; border-radius: 50%; background: #fff; border: 4px solid #ff6b4a; box-shadow: 0 4px 12px rgba(255, 107, 74, 0.3); margin-top: -10px; cursor: grab; transition: transform 0.15s ease; }
.control-slider .custom-slider::-webkit-slider-thumb:active { transform: scale(1.2); cursor: grabbing; }
.recording-progress { display: flex; flex-direction: column; gap: 8px; color: #fff; font-size: 0.9rem; }
.progress-bar { height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #ff6b4a, #ff8f73); transition: width 0.1s linear; }
.export-progress { display: flex; align-items: center; gap: 12px; justify-content: center; color: #fff; padding: 12px; }
.spinner { width: 24px; height: 24px; border: 3px solid rgba(255,255,255,0.2); border-top-color: #ff6b4a; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 768px) {
  .modal-content { width: 95vw; padding: 16px; }
  .control-btn { padding: 10px 20px; font-size: 0.9rem; }
  canvas { max-height: 45vh; }
}
</style>
