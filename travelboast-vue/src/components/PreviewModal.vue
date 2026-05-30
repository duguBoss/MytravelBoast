<template>
  <div v-if="show" class="modal-overlay" @click.self="close">
    <div class="modal-body">
      <!-- 关闭按钮 -->
      <button class="close-btn" @click="close">✕</button>

      <!-- 主内容区：左右分栏（桌面端） / 上下分栏（移动端） -->
      <div class="main-layout">

        <!-- 左侧/上侧：预览画布区 -->
        <div class="preview-area">
          <!-- 标题 -->
          <div class="preview-title">
            <span class="title-icon">{{ mode === 'export' ? '🎬' : '📍' }}</span>
            <span>{{ mode === 'export' ? '导出视频' : '路线预览' }}</span>
            <span class="ratio-badge">{{ ratioLabel }}</span>
          </div>

          <!-- 手机框架 + 画布 -->
          <div class="phone-frame" :class="'frame-' + currentRatio">
            <div class="phone-notch"></div>
            <div class="phone-screen">
              <canvas ref="previewCanvas" :width="canvasWidth" :height="canvasHeight"></canvas>
            </div>
            <div class="home-indicator"></div>
          </div>

          <!-- 播放控制条 -->
          <div class="playback-bar">
            <button class="ctrl-btn play" :disabled="isRecording || isPlaying" @click="startPreview">
              <span class="btn-icon">▶</span> 播放
            </button>
            <button class="ctrl-btn stop" :disabled="isRecording || !isPlaying" @click="stopPreview">
              <span class="btn-icon">⏹</span> 停止
            </button>
            <button v-if="mode === 'export'" class="ctrl-btn record" :class="{ active: isRecording, recording: isRecording }" @click="toggleRecording">
              <span class="btn-icon">{{ isRecording ? '⏹' : '⏺' }}</span>
              {{ isRecording ? '停止录制' : '开始录制' }}
            </button>
          </div>
        </div>

        <!-- 右侧/下侧：控制面板 -->
        <div class="control-panel" v-if="mode === 'export'">
          <div class="panel-section">
            <div class="section-header">
              <span class="section-icon">⏱</span>
              <span>视频时长</span>
              <span class="section-value">{{ localSettings.videoDuration }}s</span>
            </div>
            <input type="range" min="5" max="60" :value="localSettings.videoDuration" step="1" 
                   class="range-slider" :style="sliderStyle(localSettings.videoDuration, 5, 60)"
                   @input="e => updateLocal('videoDuration', parseFloat(e.target.value))">
            <div class="range-labels">
              <span>5s</span><span>30s</span><span>60s</span>
            </div>
          </div>

          <div class="panel-section">
            <div class="section-header">
              <span class="section-icon">🚗</span>
              <span>交通工具大小</span>
              <span class="section-value">{{ localSettings.vehicleScale.toFixed(2) }}x</span>
            </div>
            <input type="range" min="0.3" max="1.5" :value="localSettings.vehicleScale" step="0.05" 
                   class="range-slider" :style="sliderStyle(localSettings.vehicleScale, 0.3, 1.5)"
                   @input="e => updateLocal('vehicleScale', parseFloat(e.target.value))">
            <div class="range-labels">
              <span>小</span><span>中</span><span>大</span>
            </div>
          </div>

          <div class="panel-section">
            <div class="section-header">
              <span class="section-icon">🎞</span>
              <span>视频质量</span>
            </div>
            <div class="quality-grid">
              <button v-for="(label, key) in qualityLabels" :key="key"
                      class="qual-btn" :class="{ active: localSettings.videoQuality === key }"
                      @click="updateLocal('videoQuality', key)">
                {{ label }}
              </button>
            </div>
          </div>

          <div class="panel-section toggle-section">
            <div class="toggle-info">
              <span class="section-icon">💧</span>
              <span>显示水印</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" :checked="localSettings.showWatermark" 
                     @change="e => updateLocal('showWatermark', e.target.checked)">
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </label>
          </div>

          <!-- 录制进度 -->
          <div v-if="isRecording" class="progress-section">
            <div class="progress-track">
              <div class="progress-fill-bar" :style="{ width: progress + '%' }"></div>
            </div>
            <div class="progress-text">
              <span>{{ progress.toFixed(0) }}%</span>
              <span>{{ frameInfo }}</span>
            </div>
          </div>

          <!-- 导出状态 -->
          <div v-if="isExporting" class="export-status">
            <div class="status-spinner"></div>
            <span>{{ exportStatus }}</span>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
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

// 固定导出分辨率 — 所见即所得
const RESOLUTIONS = {
  vertical:   { w: 720,  h: 1280 },
  horizontal: { w: 1280, h: 720 },
  square:     { w: 1080, h: 1080 }
}

const canvasWidth = ref(720)
const canvasHeight = ref(1280)

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

const ROUTE_WIDTH = 5

const localSettings = ref({
  videoDuration: 15,
  vehicleScale: 0.65,
  videoQuality: 'standard',
  showWatermark: true,
})

// 当前比例名称
const ratioLabel = computed(() => {
  const r = props.settings?.ratio || 'vertical'
  return r === 'vertical' ? '9:16 竖屏' : r === 'horizontal' ? '16:9 横屏' : '1:1 方形'
})

const currentRatio = computed(() => props.settings?.ratio || 'vertical')

watch(() => props.settings, (val) => {
  if (val) {
    localSettings.value.videoDuration = val.videoDuration ?? 15
    localSettings.value.vehicleScale = val.vehicleScale ?? 0.65
  }
}, { immediate: true, deep: true })

watch(() => props.settings?.ratio, (val) => {
  const res = RESOLUTIONS[val] || RESOLUTIONS.vertical
  canvasWidth.value = res.w
  canvasHeight.value = res.h
}, { immediate: true })

watch(() => props.show, (val) => {
  if (val) loadMapBackground()
})

function sliderStyle(value, min, max) {
  const pct = ((value - min) / (max - min)) * 100
  return { '--pct': pct + '%' }
}

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

  if (segIdx >= dists.length) { segIdx = dists.length - 1; segT = 1 }

  const p1 = props.points[segIdx]
  const p2 = props.points[segIdx + 1]
  return {
    lat: p1.lat + (p2.lat - p1.lat) * segT,
    lng: p1.lng + (p2.lng - p1.lng) * segT,
    angle: bearing(p1.lat, p1.lng, p2.lat, p2.lng)
  }
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function bearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180)
  const x = Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180) - Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos(dLng)
  return Math.atan2(y, x) * 180 / Math.PI
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3) }
function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2 }

function getCameraState(t, W, H) {
  if (!props.points || props.points.length < 2) return { x: W/2, y: H/2, zoom: 1 }

  const startCanvas = latLngToCanvas(props.points[0].lat, props.points[0].lng, W, H)
  const endCanvas = latLngToCanvas(props.points[props.points.length-1].lat, props.points[props.points.length-1].lng, W, H)
  const vPos = getVehiclePosition(t)
  const vCanvas = latLngToCanvas(vPos.lat, vPos.lng, W, H)

  let camX, camY, zoom

  if (t < 0.08) {
    const p = easeOutCubic(t / 0.08)
    camX = startCanvas.x; camY = startCanvas.y; zoom = 2.8 - p * 0.6
  } else if (t < 0.2) {
    const p = easeInOutCubic((t - 0.08) / 0.12)
    camX = startCanvas.x + (vCanvas.x - startCanvas.x) * p
    camY = startCanvas.y + (vCanvas.y - startCanvas.y) * p
    zoom = 2.2 - p * 0.6
  } else if (t < 0.8) {
    const ahead = getVehiclePosition(Math.min(t + 0.05, 1))
    const aCanvas = latLngToCanvas(ahead.lat, ahead.lng, W, H)
    camX = vCanvas.x * 0.6 + aCanvas.x * 0.4
    camY = vCanvas.y * 0.6 + aCanvas.y * 0.4
    const center = { x: (startCanvas.x+endCanvas.x)/2, y: (startCanvas.y+endCanvas.y)/2 }
    const dist = Math.hypot(vCanvas.x-center.x, vCanvas.y-center.y)
    const r = Math.min(dist / (Math.hypot(W,H)/3), 1)
    zoom = 1.6 - r * 0.3
  } else if (t < 0.92) {
    const p = easeInOutCubic((t - 0.8) / 0.12)
    camX = vCanvas.x + (endCanvas.x - vCanvas.x) * p
    camY = vCanvas.y + (endCanvas.y - vCanvas.y) * p
    zoom = 1.3 + p * 0.9
  } else {
    const p = easeInOutCubic((t - 0.92) / 0.08)
    camX = endCanvas.x; camY = endCanvas.y; zoom = 2.2 + p * 0.6
  }

  return { x: camX, y: camY, zoom }
}

async function loadMapBackground() {
  try {
    const mapEl = document.getElementById('map')
    if (!mapEl) return
    emit('toast', '正在加载地图背景...')
    
    const canvas = await html2canvas(mapEl, {
      useCORS: true, allowTaint: true, logging: false,
      backgroundColor: null, scale: 2
    })
    
    mapBackground.value = canvas
    
    const W = canvasWidth.value, H = canvasHeight.value
    const c = getCameraState(0, W, H)
    smoothCamX = c.x; smoothCamY = c.y; smoothCamZoom = c.zoom
    emit('toast', '地图加载完成')
  } catch (err) {
    console.error('地图加载失败:', err)
    emit('toast', '地图加载失败')
    mapBackground.value = null
  }
}

function drawFrame(ctx, W, H, t) {
  ctx.clearRect(0, 0, W, H)

  const target = getCameraState(t, W, H)
  const sf = 0.12
  smoothCamX += (target.x - smoothCamX) * sf
  smoothCamY += (target.y - smoothCamY) * sf
  smoothCamZoom += (target.zoom - smoothCamZoom) * sf

  ctx.save()
  ctx.translate(W/2, H/2)
  ctx.scale(smoothCamZoom, smoothCamZoom)
  ctx.translate(-smoothCamX, -smoothCamY)

  if (mapBackground.value) {
    ctx.drawImage(mapBackground.value, 0, 0, W, H)
  } else {
    const g = ctx.createLinearGradient(0,0,W,H)
    g.addColorStop(0,'#1a1a2e'); g.addColorStop(0.5,'#16213e'); g.addColorStop(1,'#0f3460')
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H)
  }

  if (props.points && props.points.length >= 2) {
    drawRoute(ctx, W, H, t)
    drawPins(ctx, W, H)
    drawDistanceLabels(ctx, W, H)
    drawVehicle(ctx, W, H, t)
  }

  ctx.restore()

  // 暗角
  const vi = Math.min((smoothCamZoom - 1) * 0.15, 0.35)
  if (vi > 0) {
    const vg = ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.3, W/2,H/2,Math.max(W,H)*0.7)
    vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,`rgba(0,0,0,${vi})`)
    ctx.fillStyle = vg; ctx.fillRect(0,0,W,H)
  }

  // 水印
  if (localSettings.value.showWatermark !== false) drawWatermark(ctx, W, H)
}

function drawWatermark(ctx, W, H) {
  ctx.save()
  const pad = Math.round(H * 0.022)
  const fs = Math.round(H * 0.026)
  ctx.font = `bold ${fs}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`
  
  const t1 = 'TravelBoast', t2 = 'Made with ❤️'
  const w1 = ctx.measureText(t1).width, w2 = ctx.measureText(t2).width
  const mw = Math.max(w1, w2)
  const bx = W - mw - pad * 2.5, by = H - fs * 3 - pad * 1.8
  
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.beginPath(); ctx.roundRect(bx, by, mw + pad*2.2, fs*3, Math.round(fs*0.6)); ctx.fill()
  
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = `bold ${fs}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText(t1, bx + pad*1.1, by + pad*0.9)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `${Math.round(fs*0.82)}px sans-serif`
  ctx.fillText(t2, bx + pad*1.1, by + pad*0.9 + fs + fs*0.25)
  ctx.restore()
}

function drawRoute(ctx, W, H, t) {
  const pts = props.points.map(p => latLngToCanvas(p.lat, p.lng, W, H))

  // 虚线路径
  ctx.beginPath()
  ctx.strokeStyle = 'rgba(255,107,74,0.22)'
  ctx.lineWidth = ROUTE_WIDTH; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.setLineDash([10, 6])
  ctx.moveTo(pts[0].x, pts[0].y)
  pts.forEach(p => ctx.lineTo(p.x, p.y))
  ctx.stroke(); ctx.setLineDash([])

  // 已走路径
  const totalD = getTotalDistance()
  const targetD = totalD * t
  let accD = 0
  const drawn = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const sd = haversine(props.points[i].lat, props.points[i].lng, props.points[i+1].lat, props.points[i+1].lng)
    if (accD + sd <= targetD) { drawn.push(pts[i+1]); accD += sd }
    else {
      const st = sd > 0 ? (targetD - accD) / sd : 0
      drawn.push({ x: pts[i].x+(pts[i+1].x-pts[i].x)*st, y: pts[i].y+(pts[i+1].y-pts[i].y)*st })
      break
    }
  }

  if (drawn.length > 1) {
    ctx.beginPath()
    ctx.strokeStyle = '#ff6b4a'
    ctx.lineWidth = ROUTE_WIDTH + 1.5
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.shadowColor = '#ff6b4a'; ctx.shadowBlur = 18
    ctx.moveTo(drawn[0].x, drawn[0].y)
    for (let i = 1; i < drawn.length; i++) ctx.lineTo(drawn[i].x, drawn[i].y)
    ctx.stroke(); ctx.shadowBlur = 0
  }
}

function drawPins(ctx, W, H) {
  const r = Math.round(Math.min(W, H) * 0.022)
  props.points.forEach((p, i) => {
    const cp = latLngToCanvas(p.lat, p.lng, W, H)
    const isS = i === 0, isE = i === props.points.length - 1

    ctx.beginPath()
    ctx.arc(cp.x, cp.y - r * 1.1, r, 0, Math.PI * 2)
    const rg = ctx.createRadialGradient(cp.x-r*0.25, cp.y-r*1.35, 0, cp.x, cp.y-r*1.1, r)
    rg.addColorStop(0, isS ? '#81c784' : isE ? '#e57373' : '#ffb74d')
    rg.addColorStop(1, isS ? '#388e3c' : isE ? '#c62828' : '#ef6c00')
    ctx.fillStyle = rg; ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, r*0.2); ctx.stroke()

    ctx.fillStyle = '#fff'
    ctx.font = `bold ${Math.round(r*1.1)}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(isS?'A':isE?'B':String(i), cp.x, cp.y - r*1.1)

    if (props.settings?.showLabels) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.font = `${Math.round(r*0.95)}px sans-serif`
      ctx.fillText(p.name, cp.x, cp.y + r*0.7)
    }
  })
}

function drawDistanceLabels(ctx, W, H) {
  if (!props.settings?.showDistance || !props.segments) return
  for (let i = 0; i < props.points.length - 1; i++) {
    const p1 = props.points[i], p2 = props.points[i+1]
    const cp = latLngToCanvas((p1.lat+p2.lat)/2, (p1.lng+p2.lng)/2, W, H)
    const dist = props.segments[i]?.distance || 0
    const bw = 80, bh = 28

    ctx.fillStyle = 'rgba(0,0,0,0.72)'
    ctx.beginPath(); ctx.roundRect(cp.x-bw/2, cp.y-bh/2, bw, bh, 14); ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`${dist.toFixed(0)} km`, cp.x, cp.y)
  }
}

function drawVehicle(ctx, W, H, t) {
  const vp = getVehiclePosition(t)
  const vc = latLngToCanvas(vp.lat, vp.lng, W, H)
  const vehicle = props.segments?.[0]?.vehicle || { icon: '🚗' }
  const sc = localSettings.value.vehicleScale || 0.65

  ctx.save()
  ctx.translate(vc.x, vc.y)
  ctx.rotate((vp.angle - 90) * Math.PI / 180)
  ctx.scale(sc, sc)

  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath(); ctx.ellipse(4, 4, 20, 16, 0, 0, Math.PI*2); ctx.fill()

  ctx.font = '36px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(vehicle.icon, 0, 0)
  ctx.restore()
}

function getTotalDistance() {
  let t = 0
  for (let i = 0; i < (props.points?.length||0)-1; i++)
    t += haversine(props.points[i].lat, props.points[i].lng, props.points[i+1].lat, props.points[i+1].lng)
  return t
}

async function startPreview() {
  if (isRecording.value || isPlaying.value) return
  if (!mapBackground.value) await loadMapBackground()
  isPlaying.value = true
  animStartTime = performance.now()
  animDuration = (localSettings.value.videoDuration || 15) * 1000
  const W = canvasWidth.value, H = canvasHeight.value
  const c = getCameraState(0, W, H)
  smoothCamX = c.x; smoothCamY = c.y; smoothCamZoom = c.zoom
  animate()
}

function animate() {
  const elapsed = performance.now() - animStartTime
  const t = Math.min(elapsed / animDuration, 1)
  progress.value = t * 100
  const cvs = previewCanvas.value
  if (cvs) drawFrame(cvs.getContext('2d'), cvs.width, cvs.height, t)
  if (t < 1) { animFrame = requestAnimationFrame(animate) }
  else {
    isPlaying.value = false
    if (isRecording.value) stopRecording()
  }
}

function stopPreview() {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null }
  isPlaying.value = false
}

async function toggleRecording() {
  isRecording.value ? stopRecording() : startRecording()
}

async function startRecording() {
  if (!mapBackground.value) await loadMapBackground()
  isRecording.value = true; progress.value = 0
  emit('toast', '正在录制...')

  const cvs = previewCanvas.value
  if (!cvs) { emit('toast', '画布初始化失败'); return }

  const duration = (localSettings.value.videoDuration || 15) * 1000
  const quality = localSettings.value.videoQuality || 'standard'
  const W = canvasWidth.value, H = canvasHeight.value
  const c = getCameraState(0, W, H)
  smoothCamX = c.x; smoothCamY = c.y; smoothCamZoom = c.zoom

  try {
    isExporting.value = true; exportStatus.value = '正在录制视频...'
    const preset = getPresetForRatio(props.settings?.ratio, quality)

    const result = await recordVideo(cvs, drawFrame, {
      duration, fps: preset.fps, bitrate: preset.bitrate,
      onProgress: (pct, info) => { progress.value = pct; frameInfo.value = `${info.frame}/${info.totalFrames}帧` }
    })

    exportStatus.value = '正在转换为MP4...'; emit('toast', '正在转换格式...')
    let finalBlob = result.blob, fmt = 'webm'
    try {
      finalBlob = await convertWebMToMP4(result.blob, pct => { exportStatus.value = `转换中 ${Math.round(pct)}%` })
      fmt = 'mp4'
    } catch(e) { console.warn('MP4转换失败:', e); fmt = 'webm' }

    exportStatus.value = '正在保存...'
    const fn = generateFilename({ ratio: props.settings?.ratio, quality, points: props.points, format: fmt })
    const sr = await saveVideoFile(finalBlob, { suggestedName: fn, format: fmt })
    if (sr.success) emit(`toast`, `视频已保存！${(finalBlob.size/1024/1024).toFixed(2)} MB`)
    else if (sr.aborted) emit('toast', '已取消保存')
    else emit('toast', '保存失败: ' + (sr.error||'未知错误'))
  } catch(err) {
    console.error('录制错误:', err)
    emit('toast', '录制失败: ' + err.message)
  } finally {
    isRecording.value = false; isPlaying.value = false
    isExporting.value = false; exportStatus.value = ''
  }
}

function stopRecording() { isRecording.value = false }

function close() {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null }
  isPlaying.value = false; isRecording.value = false
  isExporting.value = false; progress.value = 0; frameInfo.value = ''
  emit('close')
}

onUnmounted(() => { if (animFrame) cancelAnimationFrame(animFrame) })
</script>

<style scoped>
/* ====== Overlay & Body ====== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(12px);
}
.modal-body {
  position: relative;
  background: linear-gradient(145deg, #1a1a2e 0%, #16162a 50%, #12121f 100%);
  border-radius: 24px;
  padding: 28px;
  width: 94vw;
  max-width: 1100px;
  max-height: 94vh;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow:
    0 32px 80px rgba(0,0,0,0.55),
    0 0 0 1px rgba(255,255,255,0.03) inset;
}
.close-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.6);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s;
  z-index: 10;
}
.close-btn:hover {
  background: rgba(255,107,74,0.2);
  color: #ff6b4a;
  transform: rotate(90deg);
}

/* ====== Main Layout ====== */
.main-layout {
  display: flex;
  gap: 28px;
  align-items: stretch;
}
@media (max-width: 860px) {
  .main-layout { flex-direction: column; gap: 20px; }
}

/* ====== Preview Area ====== */
.preview-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.preview-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #fff;
  font-size: 17px;
  font-weight: 700;
}
.title-icon { font-size: 20px; }
.ratio-badge {
  margin-left: auto;
  padding: 4px 12px;
  border-radius: 20px;
  background: rgba(255,107,74,0.12);
  color: #ff6b4a;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

/* ====== Phone Frame (所见即所得) ====== */
.phone-frame {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  border-radius: 28px;
  overflow: hidden;
  box-shadow:
    0 0 0 2px #2a2a3e,
    0 20px 60px rgba(0,0,0,0.45);
  transition: border-radius 0.3s;
}
.frame-vertical { aspect-ratio: 9/16; max-height: 62vh; width: auto; max-width: 380px; }
.frame-horizontal { aspect-ratio: 16/9; max-height: 48vh; width: 100%; }
.frame-square { aspect-ratio: 1/1; max-height: 52vh; width: auto; max-width: 450px; }

.phone-notch {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 40%;
  height: 22px;
  background: #000;
  border-radius: 0 0 14px 14px;
  z-index: 3;
}
.phone-screen {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a0a18;
  overflow: hidden;
}
.phone-screen canvas {
  width: 100% !important;
  height: 100% !important;
  object-fit: contain;
  display: block;
}
.home-indicator {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: 120px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.25);
  z-index: 3;
}

/* ====== Playback Bar ====== */
.playback-bar {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.ctrl-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 11px 24px;
  border-radius: 14px;
  border: none;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.ctrl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-icon { font-size: 15px; }
.ctrl-btn.play {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  box-shadow: 0 4px 16px rgba(102,126,234,0.35);
}
.ctrl-btn.play:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(102,126,234,0.45); }
.ctrl-btn.stop {
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.75);
}
.ctrl-btn.stop:hover:not(:disabled) { background: rgba(255,255,255,0.14); }
.ctrl-btn.record {
  background: linear-gradient(135deg, #ff3b30, #ff6b6b);
  color: #fff;
  box-shadow: 0 4px 16px rgba(255,59,48,0.35);
}
.ctrl-btn.record:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(255,59,48,0.45); }
.ctrl-btn.record.active, .ctrl-btn.record.recording {
  animation: pulse-rec 1.2s infinite;
}
@keyframes pulse-rec { 0%,100%{opacity:1} 50%{opacity:0.65} }

/* ====== Control Panel ====== */
.control-panel {
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex-shrink: 0;
}
@media (max-width: 860px) {
  .control-panel { width: 100%; }
}

.panel-section {
  background: rgba(255,255,255,0.04);
  border-radius: 16px;
  padding: 16px;
  border: 1px solid rgba(255,255,255,0.05);
}
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: rgba(255,255,255,0.88);
  font-size: 14px;
  font-weight: 600;
}
.section-icon { font-size: 16px; }
.section-value {
  margin-left: auto;
  color: #ff6b4a;
  font-weight: 800;
  font-size: 15px;
}

.range-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(to right, #ff6b4a var(--pct, 50%), rgba(255,255,255,0.08) var(--pct, 50%), rgba(255,255,255,0.08));
  outline: none;
  cursor: pointer;
}
.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  border: 3px solid #ff6b4a;
  box-shadow: 0 2px 10px rgba(255,107,74,0.3);
  margin-top: -8px;
  cursor: grab;
  transition: transform 0.15s;
}
.range-slider::-webkit-slider-thumb:active { transform: scale(1.2); cursor: grabbing; }
.range-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 11px;
  color: rgba(255,255,255,0.3);
}

.quality-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.qual-btn {
  padding: 10px 4px;
  border-radius: 10px;
  border: 1.5px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  color: rgba(255,255,255,0.5);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.qual-btn.active {
  border-color: #ff6b4a;
  color: #ff6b4a;
  background: rgba(255,107,74,0.1);
}

.toggle-section {
  display: flex !important;
  align-items: center;
  justify-content: space-between !important;
  padding: 14px 16px !important;
}
.toggle-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255,255,255,0.88);
  font-size: 14px;
  font-weight: 600;
}
.toggle-switch {
  position: relative;
  width: 46px;
  height: 26px;
  cursor: pointer;
}
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-track {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.12);
  border-radius: 26px;
  transition: 0.3s;
}
.toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: 0.3s;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}
.toggle-switch input:checked + .toggle-track { background: #ff6b4a; }
.toggle-switch input:checked + .toggle-track .toggle-thumb { transform: translateX(20px); }

/* ====== Progress & Status ====== */
.progress-section {
  background: rgba(255,107,74,0.06);
  border: 1px solid rgba(255,107,74,0.15);
  border-radius: 14px;
  padding: 14px;
}
.progress-track {
  height: 6px;
  background: rgba(255,255,255,0.08);
  border-radius: 3px;
  overflow: hidden;
}
.progress-fill-bar {
  height: 100%;
  background: linear-gradient(90deg, #ff6b4a, #ff8f73);
  border-radius: 3px;
  transition: width 0.15s linear;
}
.progress-text {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255,255,255,0.6);
}
.export-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
}
.status-spinner {
  width: 20px;
  height: 20px;
  border: 2.5px solid rgba(255,255,255,0.15);
  border-top-color: #ff6b4a;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
