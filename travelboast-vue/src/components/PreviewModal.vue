<template>
  <div v-if="show" class="modal-overlay" @click.self="close">
    <div class="modal-body">
      <button class="close-btn" @click="close">✕</button>

      <!-- 顶部标题 -->
      <div class="header">
        <div class="title">
          <span class="icon">{{ mode === 'export' ? '🎬' : '📍' }}</span>
          <span>{{ mode === 'export' ? '导出视频' : '路线预览' }}</span>
          <span class="badge">{{ ratioLabel }}</span>
        </div>
      </div>

      <!-- 主区域：地图 + 控制面板 -->
      <div class="content">
        <!-- 左侧：地图预览（所见即所得） -->
        <div class="map-section">
          <div class="map-container" :class="'ratio-' + (settings?.ratio || 'vertical')">
            <!-- 地图层 -->
            <div id="previewMap" class="map-layer"></div>
            <!-- 路线层 -->
            <svg class="route-layer" id="routeSvg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
            <!-- 交通工具层 -->
            <div class="vehicle-layer" id="vehicleEl">
              <span class="vehicle-icon">{{ currentVehicleIcon }}</span>
            </div>
          </div>

          <!-- 播放控制 -->
          <div class="playback">
            <button class="btn play" :disabled="isRecording||isPlaying||!mapReady" @click="startPreview">▶ 播放</button>
            <button class="btn stop" :disabled="isRecording||!isPlaying" @click="stopPreview">⏹ 停止</button>
            <button v-if="mode==='export'" class="btn record" :class="{recording:isRecording}" @click="toggleRecording">
              {{ isRecording ? '⏹ 停止' : '⏺ 录制' }}
            </button>
          </div>
        </div>

        <!-- 右侧：控制面板 -->
        <div class="controls" v-if="mode==='export'">
          <div class="section">
            <div class="row"><label>视频时长</label><span class="val">{{ localSettings.videoDuration }}秒</span></div>
            <input type="range" min="5" max="60" :value="localSettings.videoDuration" step="1" class="slider" @input="e=>updateLocal('videoDuration',+e.target.value)">
          </div>

          <div class="section">
            <div class="row"><label>交通工具大小</label><span class="val">{{ localSettings.vehicleScale.toFixed(2) }}</span></div>
            <input type="range" min="0.3" max="1.5" :value="localSettings.vehicleScale" step="0.05" class="slider" @input="e=>updateLocal('vehicleScale',+e.target.value)">
          </div>

          <div class="section">
            <div class="row"><label>视频质量</label></div>
            <div class="quals">
              <button v-for="(lb,k) in qualityLabels" :key="k" class="qb" :class="{on:localSettings.videoQuality===k}" @click="updateLocal('videoQuality',k)">{{lb}}</button>
            </div>
          </div>

          <div class="section toggle-sec">
            <label>显示水印</label>
            <label class="sw"><input type="checkbox" :checked="localSettings.showWatermark" @change="e=>updateLocal('showWatermark',e.target.checked)"><i></i></label>
          </div>

          <div v-if="isRecording" class="progress">
            <div class="pbar"><div class="pfill" :style="{width:progress+'%'}"></div></div>
            <div class="ptxt">{{progress.toFixed(0)}}% · {{frameInfo}}</div>
          </div>

          <div v-if="isExporting" class="exp">
            <div class="edot"></div><span>{{exportStatus}}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted, onBeforeUnmount } from 'vue'
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
const emit = defineEmits(['close','toast','update:settings'])

const qualityLabels = { draft:'草稿', standard:'标准', high:'高清' }

const localSettings = ref({ videoDuration:15, vehicleScale:0.65, videoQuality:'standard', showWatermark:true })
const isPlaying = ref(false)
const isRecording = ref(false)
const isExporting = ref(false)
const progress = ref(0)
const frameInfo = ref('')
const exportStatus = ref('')
const mapReady = ref(false)
const currentVehicleIcon = ref('🚗')

let previewMapInstance = null
let previewVehicleMarker = null
let previewRouteLine = null
let animFrame = null
let animStart = 0
let animDur = 0
let animProgress = 0

const ratioLabel = computed(() => {
  const r = props.settings?.ratio || 'vertical'
  return r==='vertical' ? '9:16 竖屏' : r==='horizontal' ? '16:9 横屏' : '1:1 方形'
})

watch(()=>props.settings?.ratio, async () => {
  if(previewMapInstance && props.points?.length>=2) {
    await nextTick()
    setTimeout(()=>previewMapInstance?.invalidateSize(), 100)
  }
})

watch(()=>props.show, async v => {
  if(v) {
    await nextTick()
    setTimeout(initPreviewMap, 200)
  } else {
    destroyPreviewMap()
  }
})

watch(()=>props.settings, v => {
  if(v) {
    localSettings.value.videoDuration = v.videoDuration ?? 15
    localSettings.value.vehicleScale = v.vehicleScale ?? 0.65
  }
}, { immediate: true })

function updateLocal(k,v) {
  localSettings.value[k]=v
  emit('update:settings',{...props.settings,[k]:v})
}

// ========== 地图初始化 ==========
async function initPreviewMap() {
  if(!props.points || props.points.length < 2) return
  
  // 清理旧实例
  destroyPreviewMap()
  
  try {
    const el = document.getElementById('previewMap')
    if(!el) { setTimeout(()=>initPreviewMap(), 300); return }

    // 创建地图实例
    previewMapInstance = L.map('previewMap', {
      center: [props.points[0].lat, props.points[0].lng],
      zoom: 5,
      zoomControl: false,
      attributionControl: false,
    })

    // 添加瓦片
    const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    L.tileLayer(tileUrl, {
      maxZoom: 18,
      subdomains: ['a','b','c'],
    }).addTo(previewMapInstance)

    await nextTick()
    
    // 等待瓦片加载
    await new Promise(r => setTimeout(r, 500))

    // 添加路线
    if(previewRouteLine) previewRouteLine.remove()
    const coords = props.points.map(p => [p.lat, p.lng])
    previewRouteLine = L.polyline(coords, {
      color: '#ff6b4a',
      weight: 4,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(previewMapInstance)

    // 添加标记点
    props.points.forEach((p,i) => {
      const isStart = i===0
      const isEnd = i===props.points.length-1
      const color = isStart ? '#4ade80' : isEnd ? '#f87171' : '#fbbf24'
      
      L.circleMarker([p.lat, p.lng], {
        radius: isEnd ? 12 : 10,
        color: '#fff',
        weight: 2.5,
        fillColor: color,
        fillOpacity: 1,
      }).addTo(previewMapInstance)
      
      // 文字标签
      const label = isStart ? 'A' : isEnd ? 'B' : String(i)
      L.tooltip({ permanent: true, direction: 'center', className: 'pin-label', opacity: 1 })
        .setLatLng([p.lat, p.lng])
        .setContent(`<span style="font-weight:bold;color:#fff;font-size:13px">${label}</span>`)
        .addTo(previewMapInstance)
    })

    // 添加交通工具
    if(previewVehicleMarker) previewVehicleMarker.remove()
    const icon = props.segments?.[0]?.vehicle?.icon || '🚗'
    currentVehicleIcon.value = icon
    
    const vehicleIcon = L.divIcon({
      html: `<div style="font-size:28px;line-height:1;text-shadow:0 2px 8px rgba(0,0,0,0.4)">${icon}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      className: 'vehicle-marker',
    })
    previewVehicleMarker = L.marker([props.points[0].lat, props.points[0].lng], { icon: vehicleIcon }).addTo(previewMapInstance)

    // 调整视野
    previewMapInstance.fitBounds(coords, { padding: [60, 60] })
    
    await nextTick()
    previewMapInstance.invalidateSize()
    
    mapReady.value = true
  } catch(e) {
    console.error('预览地图初始化失败:', e)
    emit('toast', '地图加载失败')
  }
}

function destroyPreviewMap() {
  if(previewMapInstance) {
    previewMapInstance.remove()
    previewMapInstance = null
  }
  previewVehicleMarker = null
  previewRouteLine = null
  mapReady.value = false
}

// ========== 动画 ==========
function getVehiclePosition(t) {
  if(!props.points || props.points.length<2) return {lat:0,lng:0,ang:0}
  let td=0, ds=[]
  for(let i=0;i<props.points.length-1;i++){ const d=dist(props.points[i],props.points[i+1]); ds.push(d); td+=d }
  const tgt=td*t
  let acc=0, si=0, st=0
  for(let i=0;i<ds.length;i++){ if(acc+ds[i]>=tgt){ si=i; st=ds[i]>0?(tgt-acc)/ds[i]:0; break } acc+=ds[i] }
  if(si>=ds.length){ si=ds.length-1; st=1 }
  const p1=props.points[si], p2=props.points[si+1]
  return { lat:p1.lat+(p2.lat-p1.lat)*st, lng:p1.lng+(p2.lng-p1.lng)*st, ang:bearing(p1,p2) }
}

function dist(a,b){
  const R=6371, dL=(b.lat-a.lat)*Math.PI/180, dG=(b.lng-a.lng)*Math.PI/180
  const sa=Math.sin(dL/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dG/2)**2
  return R*2*Math.atan2(Math.sqrt(sa),Math.sqrt(1-sa))
}
function bearing(a,b){
  const dG=(b.lng-a.lng)*Math.PI/180, la=a.lat*Math.PI/180, lb=b.lat*Math.PI/180
  return Math.atan2(Math.sin(dG)*Math.cos(lb), Math.cos(la)*Math.sin(lb)-Math.sin(la)*Math.cos(lb)*Math.cos(dG))*180/Math.PI
}

function startPreview() {
  if(isRecording.value || isPlaying.value || !previewMapInstance) return
  isPlaying.value = true
  animStart = performance.now()
  animDur = (localSettings.value.videoDuration || 15) * 1000
  animate()
}

function animate() {
  const elapsed = performance.now() - animStart
  const t = Math.min(elapsed / animDur, 1)
  progress.value = t * 100
  
  // 更新交通工具位置
  if(previewVehicleMarker) {
    const pos = getVehiclePosition(t)
    previewVehicleMarker.setLatLng([pos.lat, pos.lng])
    // 旋转图标
    const iconEl = previewVehicleMarker.getElement()
    if(iconEl) {
      const iconImg = iconEl.querySelector('div')
      if(iconImg) iconImg.style.transform = `rotate(${pos.ang - 90}deg)`
    }
  }

  if(t < 1) {
    animFrame = requestAnimationFrame(animate)
  } else {
    isPlaying.value = false
    if(isRecording.value) stopRecording()
  }
}

function stopPreview() {
  if(animFrame) { cancelAnimationFrame(animFrame); animFrame = null }
  isPlaying.value = false
  // 重置位置
  if(previewVehicleMarker && props.points?.length) {
    previewVehicleMarker.setLatLng([props.points[0].lat, props.points[0].lng])
  }
}

// ========== 录制 ==========
async function toggleRecording() {
  isRecording.value ? stopRecording() : startRecording()
}

async function startRecording() {
  if(!previewMapInstance) return
  isRecording.value = true
  progress.value = 0
  emit('toast', '正在录制...')

  // 隐藏地图控件
  const mapEl = document.getElementById('previewMap')
  if(!mapEl) { emit('toast','地图未加载'); return }

  const dur = (localSettings.value.videoDuration || 15) * 1000
  const qual = localSettings.value.videoQuality || 'standard'
  
  try {
    isExporting.value = true
    exportStatus.value = '正在录制...'

    // 使用 html2canvas 录制每一帧
    const { width: w, height: h } = mapEl.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const canvasW = Math.round(w * dpr)
    const canvasH = Math.round(h * dpr)

    // 创建离屏 canvas
    const offscreen = document.createElement('canvas')
    offscreen.width = canvasW
    offscreen.height = canvasH
    const ctx = offscreen.getContext('2d')

    // 录制参数
    const preset = getPresetForRatio(props.settings?.ratio, qual)
    const totalFrames = Math.round(dur / 1000 * preset.fps)
    const frameInterval = 1000 / preset.fps

    // 开始动画
    animStart = performance.now()
    animDur = dur
    isPlaying.value = true
    animate()

    // 帧捕获
    const frames = []
    for(let i = 0; i < totalFrames; i++) {
      await new Promise(r => setTimeout(r, frameInterval * 0.8))
      progress.value = (i + 1) / totalFrames * 100
      frameInfo.value = `${i+1}/${totalFrames} 帧`
      
      try {
        const fc = await html2canvas(mapEl, {
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: null,
          scale: dpr,
          width: w,
          height: h,
        })
        ctx.drawImage(fc, 0, 0)
        
        // 加水印
        if(localSettings.value.showWatermark !== false) {
          drawWatermark(ctx, canvasW, canvasH)
        }
        
        frames.push(offscreen.toDataURL('image/png'))
      } catch(e) {
        console.error('帧捕获失败:', e)
      }
    }

    // 合成视频
    exportStatus.value = '正在合成视频...'
    const stream = offscreen.captureStream(30)
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: preset.bitrate * 1000,
    })
    
    const chunks = []
    recorder.ondataavailable = e => { if(e.data.size) chunks.push(e.data) }
    
    const blob = await new Promise((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
      recorder.onerror = reject
      recorder.start()
      
      // 回放帧
      let fi = 0
      const playInterval = setInterval(() => {
        if(fi >= frames.length) { clearInterval(playInterval); recorder.stop(); return }
        const img = new Image()
        img.onload = () => {
          ctx.clearRect(0,0,canvasW,canvasH)
          ctx.drawImage(img,0,0,canvasW,canvasH)
          fi++
        }
        img.src = frames[fi]
      }, frameInterval)
    })

    // 转换 MP4
    exportStatus.value = '正在转换MP4...'
    let finalBlob = blob, fmt = 'webm'
    try {
      finalBlob = await convertWebMToMP4(blob, p => { exportStatus.value = '转换中 '+Math.round(p)+'%' })
      fmt = 'mp4'
    } catch(e) { console.warn('MP4转换失败:', e) }

    // 保存
    exportStatus.value = '正在保存...'
    const fn = generateFilename({ ratio: props.settings?.ratio, quality: qual, points: props.points, format: fmt })
    const sr = await saveVideoFile(finalBlob, { suggestedName: fn, format: fmt })
    if(sr.success) emit('toast', '视频已保存！'+(finalBlob.size/1024/1024).toFixed(2)+' MB')
    else if(sr.aborted) emit('toast', '已取消保存')
    else emit('toast', '保存失败:'+ (sr.error||'?'))
    
  } catch(err) {
    console.error(err)
    emit('toast', '录制失败:' + err.message)
  } finally {
    isRecording.value = false
    isPlaying.value = false
    isExporting.value = false
    exportStatus.value = ''
    stopPreview()
  }
}

function stopRecording() { isRecording.value = false }

function drawWatermark(ctx, W, H) {
  ctx.save()
  const pad = Math.round(H * 0.02)
  const fs = Math.round(H * 0.022)
  ctx.font = 'bold '+fs+'px sans-serif'
  const t1='TravelBoast', t2='Made with ❤️'
  const w1=ctx.measureText(t1).width, w2=ctx.measureText(t2).width
  const mw=Math.max(w1,w2)
  const bx=W-mw-pad*2.4, by=H-fs*2.8-pad*1.5
  ctx.fillStyle='rgba(0,0,0,0.45)'
  ctx.beginPath(); ctx.roundRect(bx,by,mw+pad*2,fs*2.8,Math.round(fs*0.55)); ctx.fill()
  ctx.fillStyle='rgba(255,255,255,0.88)'
  ctx.font='bold '+fs+'px sans-serif'
  ctx.textAlign='left'; ctx.textBaseline='top'
  ctx.fillText(t1,bx+pad,by+pad*0.8)
  ctx.fillStyle='rgba(255,255,255,0.5)'
  ctx.font=Math.round(fs*0.8)+'px sans-serif'
  ctx.fillText(t2,bx+pad,by+pad+fs+fs*0.22)
  ctx.restore()
}

function close() {
  if(animFrame) { cancelAnimationFrame(animFrame); animFrame = null }
  isPlaying.value = false
  isRecording.value = false
  isExporting.value = false
  progress.value = 0
  frameInfo.value = ''
  emit('close')
}

onBeforeUnmount(() => {
  if(animFrame) cancelAnimationFrame(animFrame)
  destroyPreviewMap()
})
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.92);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999; backdrop-filter: blur(16px);
}
.modal-body {
  position: relative;
  background: #111827;
  border-radius: 16px;
  width: 94vw; max-width: 1100px; max-height: 94vh;
  border: 1px solid rgba(255,255,255,0.06);
  box-shadow: 0 32px 80px rgba(0,0,0,0.6);
  display: flex; flex-direction: column; overflow: hidden;
}
.close-btn {
  position: absolute; top: 12px; right: 12px;
  width: 32px; height: 32px; border-radius: 50%;
  border: none; background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.5); font-size: 16px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all .2s; z-index: 10;
}
.close-btn:hover { background: rgba(255,107,74,0.25); color: #ff6b4a; transform: rotate(90deg); }

.header { padding: 18px 22px 12px; }
.title { display: flex; align-items: center; gap: 10px; color: #e5e7eb; font-size: 16px; font-weight: 700; }
.icon { font-size: 18px; }
.badge {
  margin-left: auto; padding: 3px 10px; border-radius: 10px;
  background: rgba(255,107,74,0.12); color: #ff6b4a; font-size: 11px; font-weight: 700;
}

.content { display: flex; gap: 20px; padding: 0 22px 18px; flex: 1; min-height: 0; }
@media (max-width: 820px) { .content { flex-direction: column; gap: 14px; } }

.map-section { flex: 1; display: flex; flex-direction: column; gap: 12px; min-width: 0; }

.map-container {
  flex: 1; border-radius: 12px; overflow: hidden;
  position: relative; background: #0a0e14;
  min-height: 340px;
}
.map-layer { position: absolute; inset: 0; }
.map-layer :deep(.leaflet-container) { background: #0a0e14; }

/* 比例控制 */
.ratio-vertical { aspect-ratio: 9/16; max-width: 380px; margin: 0 auto; }
.ratio-horizontal { aspect-ratio: 16/9; }
.ratio-square { aspect-ratio: 1/1; max-width: 450px; margin: 0 auto; }

.vehicle-marker { background: none !important; border: none !important; }
.vehicle-marker div { filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5)); }

/* 播放控制 */
.playback { display: flex; gap: 8px; justify-content: center; }
.btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 10px 22px; border-radius: 10px; border: none;
  font-size: 13px; font-weight: 700; cursor: pointer; transition: all .2s;
}
.btn:disabled { opacity: 0.35; cursor: not-allowed; }
.btn.play { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: #fff; box-shadow: 0 2px 12px rgba(29,78,216,0.3); }
.btn.play:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(29,78,216,0.4); }
.btn.stop { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.65); }
.btn.stop:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
.btn.record { background: linear-gradient(135deg, #dc2626, #ef4444); color: #fff; box-shadow: 0 2px 12px rgba(220,38,38,0.3); }
.btn.record:hover:not(:disabled) { transform: translateY(-1px); }
.btn.record.recording { animation: pulse 1s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }

/* 控制面板 */
.controls { width: 270px; display: flex; flex-direction: column; gap: 14px; flex-shrink: 0; }
@media (max-width: 820px) { .controls { width: 100%; } }

.section { background: rgba(255,255,255,0.03); border-radius: 12px; padding: 14px; }
.row { display: flex; align-items: center; justify-content: space-between; color: #d1d5db; font-size: 13px; font-weight: 600; margin-bottom: 10px; }
.row label { display: flex; align-items: center; gap: 6px; }
.val { color: #ff6b4a; font-weight: 800; font-size: 14px; }

.slider {
  -webkit-appearance: none; appearance: none; width: 100%; height: 5px; border-radius: 3px;
  background: rgba(255,255,255,0.08); outline: none; cursor: pointer;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
  background: #fff; border: 2.5px solid #ff6b4a; box-shadow: 0 2px 8px rgba(255,107,74,0.3);
  cursor: grab;
}
.slider::-webkit-slider-thumb:active { transform: scale(1.15); cursor: grabbing; }

.quals { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; }
.qb {
  padding: 8px 2px; border-radius: 8px; border: 1.5px solid rgba(255,255,255,0.07);
  background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.45);
  font-size: 12px; font-weight: 600; cursor: pointer; transition: all .2s;
}
.qb.on { border-color: #ff6b4a; color: #ff6b4a; background: rgba(255,107,74,0.08); }

.toggle-sec { display: flex !important; align-items: center; justify-content: space-between; padding: 12px 14px !important; }
.sw { position: relative; width: 40px; height: 22px; cursor: pointer; }
.sw input { opacity: 0; width: 0; height: 0; }
.sw i {
  position: absolute; inset: 0; background: rgba(255,255,255,0.1); border-radius: 22px; transition: .25s;
}
.sw i::after {
  content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px;
  border-radius: 50%; background: #fff; transition: .25s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.sw input:checked + i { background: #ff6b4a; }
.sw input:checked + i::after { transform: translateX(18px); }

.progress {
  display: flex; flex-direction: column; gap: 6px; padding: 10px;
  background: rgba(255,107,74,0.04); border: 1px solid rgba(255,107,74,0.1); border-radius: 10px;
}
.pbar { height: 5px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
.pfill { height: 100%; background: linear-gradient(90deg, #ff6b4a, #ffa07a); border-radius: 3px; transition: width .12s linear; }
.ptxt { font-size: 11px; color: rgba(255,255,255,0.5); text-align: center; }

.exp { display: flex; align-items: center; justify-content: center; gap: 8px; color: #e5e7eb; font-size: 13px; padding: 10px; }
.edot { width: 16px; height: 16px; border: 2.5px solid rgba(255,107,74,0.4); border-top-color: #ff6b4a; border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* 去除 Leaflet 默认样式干扰 */
:deep(.leaflet-control-zoom) { display: none !important; }
:deep(.leaflet-control-attribution) { display: none !important; }
</style>
