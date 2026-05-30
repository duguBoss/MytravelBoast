<template>
  <div v-if="show" class="modal-overlay" @click.self="close">
    <div class="modal-body">
      <button class="close-btn" @click="close">✕</button>

      <div class="main-layout">
        <div class="preview-area">
          <div class="preview-title">
            <span>{{ mode === 'export' ? '导出视频' : '路线预览' }}</span>
            <span class="ratio-badge">{{ ratioLabel }}</span>
          </div>

          <div class="canvas-wrapper" ref="canvasWrapper">
            <canvas ref="previewCanvas"></canvas>
          </div>

          <div class="playback-bar">
            <button class="ctrl-btn play" :disabled="isRecording || isPlaying" @click="startPreview">▶ 播放预览</button>
            <button class="ctrl-btn stop" :disabled="isRecording || !isPlaying" @click="stopPreview">⏹ 停止</button>
            <button v-if="mode === 'export'" class="ctrl-btn record" :class="{ recording: isRecording }" @click="toggleRecording">
              {{ isRecording ? '⏹ 停止' : '⏺ 开始录制' }}
            </button>
          </div>
        </div>

        <div class="control-panel" v-if="mode === 'export'">
          <div class="panel-row">
            <label>视频时长</label>
            <span class="val">{{ localSettings.videoDuration }}秒</span>
          </div>
          <input type="range" min="5" max="60" :value="localSettings.videoDuration" step="1"
                 class="range-input" @input="e => updateLocal('videoDuration', +e.target.value)">

          <div class="panel-row">
            <label>交通工具大小</label>
            <span class="val">{{ localSettings.vehicleScale.toFixed(2) }}</span>
          </div>
          <input type="range" min="0.3" max="1.5" :value="localSettings.vehicleScale" step="0.05"
                 class="range-input" @input="e => updateLocal('vehicleScale', +e.target.value)">

          <div class="panel-row">
            <label>视频质量</label>
          </div>
          <div class="qual-group">
            <button v-for="(lb,k) in qualityLabels" :key="k" class="qual-btn"
                    :class="{ on: localSettings.videoQuality === k }" @click="updateLocal('videoQuality',k)">{{ lb }}</button>
          </div>

          <div class="panel-row toggle-row">
            <label>显示水印</label>
            <label class="switch"><input type="checkbox" :checked="localSettings.showWatermark" @change="e => updateLocal('showWatermark',e.target.checked)"><i></i></label>
          </div>

          <div v-if="isRecording" class="prog-row">
            <div class="prog-bar"><div class="prog-fill" :style="{width:progress+'%'}"></div></div>
            <span class="prog-txt">{{ progress.toFixed(0) }}% · {{ frameInfo }}</span>
          </div>

          <div v-if="isExporting" class="prog-row exp-row">
            <div class="exp-dot"></div>
            <span>{{ exportStatus }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick, onUnmounted } from 'vue'
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
const previewCanvas = ref(null)
const canvasWrapper = ref(null)

// 导出分辨率 — 高清
const RES = { vertical:{w:720,h:1280}, horizontal:{w:1280,h:720}, square:{w:1080,h:1080} }
const canvasW = ref(720)
const canvasH = ref(1280)

// 显示用 DPR 缩放
let dprCanvasW = 720
let dprCanvasH = 1280

const isPlaying = ref(false)
const isRecording = ref(false)
const isExporting = ref(false)
const progress = ref(0)
const frameInfo = ref('')
const exportStatus = ref('')

let animFrame = null
let animStart = 0
let animDur = 0

// 相机平滑状态
let cam = { x:0, y:0, zoom:1, tx:0, ty:0, tz:1 }

const localSettings = ref({ videoDuration:15, vehicleScale:0.65, videoQuality:'standard', showWatermark:true })

const ratioLabel = computed(() => {
  const r = props.settings?.ratio || 'vertical'
  return r==='vertical'?'9:16 竖屏':r==='horizontal'?'16:9 横屏':'1:1 方形'
})

watch(()=>props.settings?.ratio, v => {
  const r = RES[v] || RES.vertical
  canvasW.value = r.w; canvasH.value = r.h
},{immediate:true})

watch(()=>props.show, async v => {
  if (v) await nextTick(resizeCanvas)
})

function updateLocal(k,v){ localSettings.value[k]=v; emit('update:settings',{...props.settings,[k]:v}) }

// ========== 坐标系：经纬度 → Canvas（自洽，不走形）==========
function getBounds() {
  if (!props.points?.length) return {minLat:0,maxLat:90,minLng:-180,maxLng:180}
  let ml=90,Ml=-90,mg=180,Mg=-180
  props.points.forEach(p => { if(p.lat<ml)ml=p.lat; if(p.lat>Ml)Ml=p.lat; if(p.lng<mg)mg=p.lng; if(p.lng>Mg)Mg=p.lng })
  const lp=(Ml-ml)*0.12||5, lg=(Mg-mg)*0.12||5
  return { minLat:ml-lp, maxLat:Ml+lp, minLng:mg-lg, maxLng:Mg+lg }
}

function toCanvas(lat, lng, W, H) {
  const b = getBounds()
  const x = ((lng - b.minLng) / (b.maxLng - b.minLng)) * W
  const y = ((b.maxLat - lat) / (b.maxLat - b.minLat)) * H
  return {x,y}
}

// ========== 车辆位置 ==========
function vehicleAt(t) {
  if (!props.points || props.points.length < 2) return {lat:0,lng:0,ang:0}
  let td=0, ds=[]
  for(let i=0;i<props.points.length-1;i++){ const d=dist(props.points[i],props.points[i+1]); ds.push(d); td+=d }
  const tgt=td*t, pts=props.points
  let acc=0,si=0,st=0
  for(let i=0;i<ds.length;i++){ if(acc+ds[i]>=tgt){ si=i; st=ds[i]>0?(tgt-acc)/ds[i]:0; break } acc+=ds[i] }
  if(si>=ds.length){ si=ds.length-1; st=1 }
  const p1=pts[si],p2=pts[si+1]
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
function totalDist(){ let t=0; for(let i=0;i<(props.points?.length||0)-1;i++) t+=dist(props.points[i],props.points[i+1]); return t }

// ========== 运镜 ==========
function easeOut(t){ return 1-Math.pow(1-t,3) }
function easeIO(t){ return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2 }

function cameraAt(t,W,H){
  if(!props.points||props.points.length<2) return {x:W/2,y:H/2,z:1}
  const s=toCanvas(props.points[0].lat,props.points[0].lng,W,H)
  const e=toCanvas(props.points[props.points.length-1].lat,props.points[props.points.length-1].lng,W,H)
  const v=vehicleAt(t), vc=toCanvas(v.lat,v.lng,W,H)
  let x,y,z

  if(t<0.06){ const p=easeOut(t/0.06); x=s.x;y=s.y;z=2.4-p*0.5 }
  else if(t<0.16){ const p=easeIO((t-0.06)/0.1); x=s.x+(vc.x-s.x)*p; y=s.y+(vc.y-s.y)*p; z=1.9-p*0.5 }
  else if(t<0.82){
    const ah=vehicleAt(Math.min(t+0.04,1)), ac=toCanvas(ah.lat,ah.lng,W,H)
    x=vc.x*0.55+ac.x*0.45; y=vc.y*0.55+ac.y*0.45
    const cx=(s.x+e.x)/2,cy=(s.y+e.y)/2
    const r=Math.min(Math.hypot(vc.x-cx,vc.y-cy)/(Math.hypot(W,H)/2.8),1)
    z=1.45-r*0.25
  } else if(t<0.94){ const p=easeIO((t-0.82)/0.12); x=vc.x+(e.x-vc.x)*p; y=vc.y+(e.y-vc.y)*p; z=1.2+p*0.7 }
  else{ const p=easeIO((t-0.94)/0.06); x=e.x;y=e.y;z=1.9+p*0.5 }
  return{x,y,z}
}

// ========== 绘制引擎 ==========
function drawFrame(ctx,W,H,t){
  ctx.clearRect(0,0,W,H)
  const tgt=cameraAt(t,W,H)
  // 平滑插值
  cam.x+=(tgt.x-cam.x)*0.14; cam.y+=(tgt.y-cam.y)*0.14; cam.zoom+=(tgt.z-cam.zoom)*0.14

  ctx.save()
  ctx.translate(W/2,H/2)
  ctx.scale(cam.zoom,cam.zoom)
  ctx.translate(-cam.x,-cam.y)

  // 背景
  drawBackground(ctx,W,H)

  if(props.points&&props.points.length>=2){
    drawRoute(ctx,W,H,t)
    drawPins(ctx,W,H)
    drawDistLabels(ctx,W,H)
    drawVehicle(ctx,W,H,t)
  }

  ctx.restore()

  // 暗角
  const vi=Math.min((cam.zoom-1)*0.12,0.28)
  if(vi>0){
    const rg=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.25,W/2,H/2,Math.max(W,H)*0.72)
    rg.addColorStop(0,'rgba(0,0,0,0)'); rg.addColorStop(1,'rgba(0,0,0,'+vi+')')
    ctx.fillStyle=rg; ctx.fillRect(0,0,W,H)
  }

  if(localSettings.value.showWatermark!==false) drawWatermark(ctx,W,H)
}

// ---------- 背景：精美程序化渲染 ----------
function drawBackground(ctx,W,H){
  const b=getBounds()
  // 深色基底
  const bg=ctx.createLinearGradient(0,0,W,H)
  bg.addColorStop(0,'#0d1117'); bg.addColorStop(0.5,'#161b22'); bg.addColorStop(1,'#0d1117')
  ctx.fillStyle=bg; ctx.fillRect(-W,-H,W*3,H*3)

  // 经纬网格
  ctx.strokeStyle='rgba(48,54,61,0.6)'
  ctx.lineWidth=0.5
  const latStep=(b.maxLat-b.minLat)/8, lngStep=(b.maxLng-b.minLng)/10
  for(let lat=b.minLat;lat<=b.maxLat;lat+=latStep){
    const p=toCanvas(lat,b.minLng,W,H), p2=toCanvas(lat,b.maxLng,W,H)
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p2.x,p2.y);ctx.stroke()
  }
  for(let lng=b.minLng;lng<=b.maxLng;lng+=lngStep){
    const p=toCanvas(b.minLat,lng,W,H), p2=toCanvas(b.maxLat,lng,W,H)
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p2.x,p2.y);ctx.stroke()
  }

  // 大陆轮廓暗示（柔和色块）
  ctx.fillStyle='rgba(33,38,45,0.5)'
  // 简化的大陆形状提示
  drawLandHint(ctx,W,H,b)
}

function drawLandHint(ctx,W,H,b){
  // 根据 bounds 范围绘制模糊的大陆暗示区域
  const cx=W/2, cy=H/2
  // 用几个椭圆模拟大陆分布
  const lands=[
    {x:cx*0.35,y:cy*0.55,rx:W*0.18,ry:H*0.22},   // 亚欧大陆区
    {x:cx*0.75,y:cy*0.52,rx:W*0.1,ry:H*0.18},     // 北美
    {x:cx*0.72,y:cy*0.85,rx:W*0.07,ry:H*0.12},    // 南美
    {x:cx*0.52,y:cy*0.88,rx:W*0.05,ry:H*0.08},     // 非洲
    {x:cx*0.88,y:cy*0.78,rx:W*0.08,ry:H*0.1},      // 澳洲
  ]
  lands.forEach(l=>{
    ctx.beginPath()
    ctx.ellipse(l.x,l.y,l.rx,l.ry,0,0,Math.PI*2)
    ctx.fill()
  })
}

// ---------- 路线 ----------
function drawRoute(ctx,W,H,t){
  const pts=props.points.map(p=>toCanvas(p.lat,p.lng,W,H))

  // 全路径虚线
  ctx.beginPath()
  ctx.strokeStyle='rgba(255,107,74,0.18)'
  ctx.lineWidth=3.5; ctx.lineCap='round'; ctx.lineJoin='round'
  ctx.setLineDash([8,5])
  ctx.moveTo(pts[0].x,pts[0].y)
  for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y)
  ctx.stroke(); ctx.setLineDash([])

  // 已走路径（发光）
  const td=totalDist(), tgtD=td*t
  let acc=0, drawn=[pts[0]]
  for(let i=0;i<pts.length-1;i++){
    const sd=dist(props.points[i],props.points[i+1])
    if(acc+sd<=tgtD){drawn.push(pts[i+1]);acc+=sd}
    else{
      const f=sd>0?(tgtD-acc)/sd:0
      drawn.push({x:pts[i].x+(pts[i+1].x-pts[i].x)*f,y:pts[i].y+(pts[i+1].y-pts[i].y)*f});break
    }
  }
  if(drawn.length>1){
    // 外发光
    ctx.strokeStyle='rgba(255,107,74,0.25)'
    ctx.lineWidth=10; ctx.lineCap='round'; ctx.lineJoin='round'
    ctx.beginPath();ctx.moveTo(drawn[0].x,drawn[0].y)
    for(let i=1;i<drawn.length;i++)ctx.lineTo(drawn[i].x,drawn[i].y)
    ctx.stroke()
    // 主线
    ctx.strokeStyle='#ff6b4a'
    ctx.lineWidth=4
    ctx.shadowColor='#ff6b4a'; ctx.shadowBlur=16
    ctx.beginPath();ctx.moveTo(drawn[0].x,drawn[0].y)
    for(let i=1;i<drawn.length;i++)ctx.lineTo(drawn[i].x,drawn[i].y)
    ctx.stroke(); ctx.shadowBlur=0
  }
}

// ---------- 标记点 ----------
function drawPins(ctx,W,H){
  const r=Math.round(Math.min(W,H)*0.026)
  props.points.forEach((p,i)=>{
    const cp=toCanvas(p.lat,p.lng,W,H)
    const isS=i===0, isE=i===props.points.length-1
    const colors=isS?['#4ade80','#166534']:isE?['#f87171','#991b1b']:['#fbbf24','#b45309']

    // 光晕
    ctx.beginPath(); ctx.arc(cp.x,cp.y,r*1.8,0,Math.PI*2)
    ctx.fillStyle=colors[0]+'20'; ctx.fill()

    // 外圈
    ctx.beginPath(); ctx.arc(cp.x,cp.y,r,0,Math.PI*2)
    const rg=ctx.createRadialGradient(cp.x-r*0.3,cp.y-r*0.3,0,cp.x,cp.y,r)
    rg.addColorStop(0,colors[0]); rg.addColorStop(1,colors[1])
    ctx.fillStyle=rg; ctx.fill()
    ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=Math.max(2,r*0.18); ctx.stroke()

    // 字母
    ctx.fillStyle='#fff'; ctx.font='bold '+Math.round(r*1.05)+'px sans-serif'
    ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.fillText(isS?'A':isE?'B':String(i),cp.x,cp.y)

    // 名称
    if(props.settings?.showLabels){
      ctx.fillStyle='rgba(255,255,255,0.82)'; ctx.font=Math.round(r*0.88)+'px sans-serif'
      ctx.fillText(p.name,cp.x,cp.y+r*1.5)
    }
  })
}

// 距离标签
function drawDistLabels(ctx,W,H){
  if(!props.settings?.showDistance||!props.segments)return
  for(let i=0;i<props.points.length-1;i++){
    const p1=props.points[i],p2=props.points[i+1]
    const cp=toCanvas((p1.lat+p2.lat)/2,(p1.lng+p2.lng)/2,W,H)
    const d=props.segments[i]?.distance||0
    const tw=76,th=26
    ctx.fillStyle='rgba(0,0,0,0.65)'
    ctx.beginPath(); ctx.roundRect(cp.x-tw/2,cp.y-th/2,tw,th,13); ctx.fill()
    ctx.fillStyle='#fff'; ctx.font='bold 11px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.fillText(`${d.toFixed(0)} km`,cp.x,cp.y)
  }
}

// 交通工具
function drawVehicle(ctx,W,H,t){
  const vp=vehicleAt(t), vc=toCanvas(vp.lat,vp.lng,W,H)
  const veh=props.segments?.[0]?.vehicle||{icon:'🚗'}
  const sc=localSettings.value.vehicleScale||0.65

  ctx.save()
  ctx.translate(vc.x,vc.y)
  ctx.rotate((vp.ang-90)*Math.PI/180)
  ctx.scale(sc,sc)

  // 阴影
  ctx.fillStyle='rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(3,3,18,14,0,0,Math.PI*2); ctx.fill()

  // 图标
  ctx.font='32px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'
  ctx.fillText(veh.icon,0,0)
  ctx.restore()
}

// 水印
function drawWatermark(ctx,W,H){
  ctx.save()
  const pad=Math.round(H*0.02), fs=Math.round(H*0.023)
  ctx.font='bold '+fs+'px -apple-system,BlinkMacSystemFont,sans-serif'
  const t1='TravelBoast', t2='Made with ❤️'
  const w1=ctx.measureText(t1).width, w2=ctx.measureText(t2).width, mw=Math.max(w1,w2)
  const bx=W-mw-pad*2.4, by=H-fs*2.8-pad*1.5

  ctx.fillStyle='rgba(0,0,0,0.45)'
  ctx.beginPath(); ctx.roundRect(bx,by,mw+pad*2,fs*2.8,Math.round(fs*0.55)); ctx.fill()

  ctx.fillStyle='rgba(255,255,255,0.88)'
  ctx.font='bold '+fs+'px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='top'
  ctx.fillText(t1,bx+pad,by+pad*0.8)
  ctx.fillStyle='rgba(255,255,255,0.5)'
  ctx.font=Math.round(fs*0.8)+'px sans-serif'
  ctx.fillText(t2,bx+pad,by+pad+fs+fs*0.22)
  ctx.restore()
}

// ========== Canvas 尺寸管理 ==========
function resizeCanvas(){
  const wrapper=canvasWrapper.value
  const cvs=previewCanvas.value
  if(!wrapper||!cvs)return

  const rect=wrapper.getBoundingClientRect()
  const dpr=window.devicePixelRatio||1

  // 显示尺寸 = 容器尺寸（保持比例）
  const res=RES[props.settings?.ratio]||RES.vertical
  const targetAspect=res.w/res.h
  const containerAspect=rect.width/rect.height

  let dw,dh
  if(containerAspect>targetAspect){ dh=rect.height; dw=dh*targetAspect }
  else{ dw=rect.width; dh=dw/targetAspect }

  cvs.style.width=dw+'px'; cvs.style.height=dh+'px'

  // 内部分辨率 = 导出分辨率
  cvs.width=res.w; cvs.height=res.h
  dprCanvasW=res.w; dprCanvasH=res.h

  // 初始绘制
  const ctx=cvs.getContext('2d')
  drawFrame(ctx,res.w,res.h,0)
}

// ========== 动画控制 ==========
async function startPreview(){
  if(isRecording.value||isPlaying.value)return
  isPlaying.value=true
  animStart=performance.now()
  animDur=(localSettings.value.videoDuration||15)*1000
  const res=RES[props.settings?.ratio]||RES.vertical
  const c=cameraAt(0,res.w,res.h)
  cam={x:c.x,y:c.y,z:c.zoom,tx:c.x,ty:c.y,tz:c.zoom}
  animate()
}

function animate(){
  const el=performance.now()-animStart
  const t=Math.min(el/animDur,1)
  progress.value=t*100
  const cvs=previewCanvas.value
  if(cvs)drawFrame(cvs.getContext('2d'),cvs.width,cvs.height,t)
  if(t<1)animFrame=requestAnimationFrame(animate)
  else{ isPlaying.value=false; if(isRecording.value)stopRecording() }
}

function stopPreview(){
  if(animFrame){cancelAnimationFrame(animFrame);animFrame=null}
  isPlaying.value=false
}

async function toggleRecording(){ isRecording.value?stopRecording():startRecording() }

async function startRecording(){
  isRecording.value=true; progress.value=0
  emit('toast','正在录制...')

  const cvs=previewCanvas.value
  if(!cvs){emit('toast','画布初始化失败');return}

  const dur=(localSettings.value.videoDuration||15)*1000
  const qual=localSettings.value.videoQuality||'standard'
  const res=RES[props.settings?.ratio]||RES.vertical
  const c0=cameraAt(0,res.w,res.h)
  cam={x:c0.x,y:c0.y,z:c0.zoom,tx:c0.x,ty:c0.y,tz:c0.zoom}

  try{
    isExporting.value=true; exportStatus.value='正在录制...'
    const preset=getPresetForRatio(props.settings?.ratio,qual)

    const result=await recordVideo(cvs,drawFrame,{
      dur,fps:preset.fps,bitrate:preset.bitrate,
      onProgress:(pct,info)=>{progress.value=pct;frameInfo.value=info.frame+'/'+info.totalFrames+'帧'}
    })

    exportStatus.value='正在转换MP4...'; emit('toast','正在转换格式...')
    let blob=result.blob, fmt='webm'
    try{
      blob=await convertWebMToMP4(result.blob,p=>{exportStatus.value='转换中 '+Math.round(p)+'%'})
      fmt='mp4'
    }catch(e){console.warn('MP4失败:',e)}

    exportStatus.value='正在保存...'
    const fn=generateFilename({ratio:props.settings?.ratio,quality,points:props.points,format:fmt})
    const sr=await saveVideoFile(blob,{suggestedName:fn,format:fmt})
    if(sr.success)emit('toast','视频已保存！'+(blob.size/1024/1024).toFixed(2)+' MB')
    else if(sr.aborted)emit('toast','已取消保存')
    else emit('toast','保存失败:'+(sr.error||'?'))
  }catch(err){
    console.error(err); emit('toast','录制失败:'+err.message)
  }finally{
    isRecording.value=false;isPlaying.value=false;isExporting.value=false;exportStatus.value=''
  }
}
function stopRecording(){isRecording.value=false}

function close(){
  if(animFrame){cancelAnimationFrame(animFrame);animFrame=null}
  isPlaying.value=false;isRecording.value=false;isExporting.value=false
  progress.value=0;frameInfo.value=''
  emit('close')
}

onMounted(async()=>{ await nextTick(resizeCanvas) })
onUnmounted(()=>{if(animFrame)cancelAnimationFrame(animFrame)})
</script>

<style scoped>
.modal-overlay{
  position:fixed;inset:0;background:rgba(0,0,0,0.9);
  display:flex;align-items:center;justify-content:center;
  z-index:9999;backdrop-filter:blur(16px);
}
.modal-body{
  position:relative;background:#0d1117;border-radius:20px;
  padding:24px;width:92vw;max-width:1000px;max-height:94vh;
  border:1px solid rgba(255,255,255,0.06);
  box-shadow:0 40px 100px rgba(0,0,0,0.6);
  display:flex;flex-direction:column;gap:18px;
}
.close-btn{
  position:absolute;top:12px;right:12px;width:34px;height:34px;
  border-radius:50%;border:none;background:rgba(255,255,255,0.06);
  color:rgba(255,255,255,0.5);font-size:17px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  transition:all .2s;z-index:10;
}
.close-btn:hover{background:rgba(255,107,74,0.2);color:#ff6b4a;transform:rotate(90deg)}

.main-layout{display:flex;gap:24px;align-items:stretch;flex:1;min-height:0}
@media(max-width:800px){.main-layout{flex-direction:column;gap:16px}}

.preview-area{flex:1;display:flex;flex-direction:column;gap:12px;min-width:0}
.preview-title{
  display:flex;align-items:center;gap:10px;color:#e6edf3;font-size:16px;font-weight:700;
}
.ratio-badge{
  margin-left:auto;padding:3px 10px;border-radius:12px;
  background:rgba(255,107,74,0.1);color:#ff6b4a;font-size:11px;font-weight:700;
}

.canvas-wrapper{
  flex:1;display:flex;align-items:center;justify-content:center;
  background:#010409;border-radius:14px;border:1px solid rgba(255,255,255,0.04);
  overflow:hidden;min-height:300px;
}
.canvas-wrapper canvas{
  display:block;border-radius:10px;
  /* 关键：不拉伸，保持原始比例 */
  max-width:100%;max-height:100%;
  object-fit:contain;
}

.playback-bar{display:flex;gap:8px;justify-content:center}
.ctrl-btn{
  display:inline-flex;align-items:center;gap:5px;
  padding:10px 20px;border-radius:10px;border:none;font-size:13px;font-weight:700;cursor:pointer;transition:all .2s;
}
.ctrl-btn:disabled{opacity:.35;cursor:not-allowed}
.ctrl-btn.play{background:linear-gradient(135deg,#58a6ff,#1f6feb);color:#fff;box-shadow:0 2px 12px rgba(31,111,235,.3)}
.ctrl-btn.play:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 20px rgba(31,111,235,.4)}
.ctrl-btn.stop{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.65)}
.ctrl-btn.stop:hover:not(:disabled){background:rgba(255,255,255,0.12)}
.ctrl-btn.record{background:linear-gradient(135deg,#da3633,#f85149);color:#fff;box-shadow:0 2px 12px rgba(218,54,51,.3)}
.ctrl-btn.record:hover:not(:disabled){transform:translateY(-1px)}
.ctrl-btn.record.recording{animation:pulse-rec 1s infinite}
@keyframes pulse-rec{0%,100%{opacity:1}50%{opacity:.6}}

/* 控制面板 */
.control-panel{width:260px;display:flex;flex-direction:column;gap:12px;flex-shrink:0}
@media(max-width:800px){.control-panel{width:100%}}
.panel-row{display:flex;align-items:center;justify-content:space-between;color:#e6edf3;font-size:13px;font-weight:600}
.panel-row label{display:flex;align-items:center;gap:6px}
.panel-row .val{color:#ff6b4a;font-weight:800;font-size:14px}

.range-input{
  -webkit-appearance:none;appearance:none;width:100%;height:5px;border-radius:3px;
  background:linear-gradient(to right,#ff6b4a var(--pct,50%),rgba(255,255,255,0.07) var(--pct,50%),rgba(255,255,255,0.07));
  outline:none;cursor:pointer;margin-top:4px;
}
.range-input::-webkit-slider-thumb{
  -webkit-appearance:none;width:20px;height:20px;border-radius:50%;
  background:#fff;border:2.5px solid #ff6b4a;
  box-shadow:0 2px 8px rgba(255,107,74,.25);margin-top:-7px;cursor:grab;
}
.range-input::-webkit-slider-thumb:active{transform:scale(1.15)}

.qual-group{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:4px}
.qual-btn{
  padding:9px 2px;border-radius:8px;border:1.5px solid rgba(255,255,255,0.07);
  background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.45);
  font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;
}
.qual-btn.on{border-color:#ff6b4a;color:#ff6b4a;background:rgba(255,107,74,0.08)}

.toggle-row{padding:10px 12px!important;background:rgba(255,255,255,0.03);border-radius:10px}
.switch{position:relative;width:42px;height:24px;cursor:pointer}
.switch input{opacity:0;width:0;height:0}
.switch i{
  position:absolute;inset:0;background:rgba(255,255,255,0.1);border-radius:24px;transition:.25s;
}
.switch i::after{
  content:'';position:absolute;top:2.5px;left:2.5px;width:19px;height:19px;
  border-radius:50%;background:#fff;transition:.25s;box-shadow:0 1px 3px rgba(0,0,0,.2);
}
.switch input:checked+i{background:#ff6b4a}
.switch input:checked+i::after{transform:translateX(18px)}

.prog-row{display:flex;flex-direction:column;gap:6px;padding:10px;background:rgba(255,107,74,0.04);border:1px solid rgba(255,107,74,0.1);border-radius:10px}
.prog-bar{height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden}
.prog-fill{height:100%;background:linear-gradient(90deg,#ff6b4a,#ffa07a);border-radius:3px;transition:width .12s linear}
.prog-txt{font-size:11px;color:rgba(255,255,255,0.5);text-align:center}
.exp-row{align-items:center;justify-content:center;gap:8px;color:#e6edf3;font-size:13px}
.exp-dot{width:18px;height:18px;border:2.5px solid rgba(255,107,74,0.4);border-top-color:#ff6b4a;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
