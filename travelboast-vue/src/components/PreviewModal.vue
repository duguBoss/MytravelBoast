<template>
  <div v-if="show" class="modal-overlay" @click.self="close">
    <div class="modal-body">
      <button class="close-btn" @click="close">✕</button>

      <div class="header">
        <div class="title">
          <span>{{ mode === 'export' ? '导出视频' : '路线预览' }}</span>
          <span class="badge">{{ ratioLabel }}</span>
        </div>
      </div>

      <div class="content">
        <div class="map-section">
          <div class="canvas-wrap" ref="canvasWrap">
            <canvas ref="previewCanvas"></canvas>
          </div>

          <div class="playback">
            <button class="btn play" :disabled="isRecording||isPlaying||!bgLoaded" @click="startPreview">▶ 播放</button>
            <button class="btn stop" :disabled="isRecording||!isPlaying" @click="stopPreview"> 停止</button>
            <button v-if="mode==='export'" class="btn record" :class="{recording:isRecording}" @click="toggleRecording">
              {{ isRecording ? '⏹ 停止' : '⏺ 录制' }}
            </button>
          </div>
        </div>

        <div class="controls" v-if="mode==='export'">
          <div class="sec">
            <div class="row"><label>视频时长</label><span class="val">{{ localSettings.videoDuration }}秒</span></div>
            <input type="range" min="5" max="60" :value="localSettings.videoDuration" step="1" class="slider" @input="e=>updateLocal('videoDuration',+e.target.value)">
          </div>
          <div class="sec">
            <div class="row"><label>交通工具大小</label><span class="val">{{ localSettings.vehicleScale.toFixed(2) }}</span></div>
            <input type="range" min="0.3" max="1.5" :value="localSettings.vehicleScale" step="0.05" class="slider" @input="e=>updateLocal('vehicleScale',+e.target.value)">
          </div>
          <div class="sec">
            <div class="row"><label>视频质量</label></div>
            <div class="quals">
              <button v-for="(lb,k) in qualityLabels" :key="k" class="qb" :class="{on:localSettings.videoQuality===k}" @click="updateLocal('videoQuality',k)">{{lb}}</button>
            </div>
          </div>
          <div class="sec toggle-sec">
            <label>显示水印</label>
            <label class="sw"><input type="checkbox" :checked="localSettings.showWatermark" @change="e=>updateLocal('showWatermark',e.target.checked)"><i></i></label>
          </div>
          <div v-if="isRecording" class="prog">
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
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import html2canvas from 'html2canvas'
import { saveVideoFile, generateFilename, getPresetForRatio, convertWebMToMP4 } from '../utils/videoRecorder.js'

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
const bgLoaded = ref(false)

const previewCanvas = ref(null)
const canvasWrap = ref(null)

let mapBg = null
let cam = { x:0, y:0, zoom:1 }
let animFrame = null
let animStart = 0
let animDur = 0
let W = 720, H = 1280

const ratioLabel = computed(() => {
  const r = props.settings?.ratio || 'vertical'
  return r==='vertical' ? '9:16 竖屏' : r==='horizontal' ? '16:9 横屏' : '1:1 方形'
})

const RES = { vertical:{w:720,h:1280}, horizontal:{w:1280,h:720}, square:{w:1080,h:1080} }

watch(()=>props.settings?.ratio, () => { nextTick(()=>resizeCanvas()) }, { immediate:true })
watch(()=>props.show, async v => {
  if(v) { await nextTick(); setTimeout(loadBackground, 300) }
  else { bgLoaded.value=false; mapBg=null }
})
watch(()=>props.settings, v => {
  if(v) { localSettings.value.videoDuration=v.videoDuration??15; localSettings.value.vehicleScale=v.vehicleScale??0.65 }
}, {immediate:true})

function updateLocal(k,v) { localSettings.value[k]=v; emit('update:settings',{...props.settings,[k]:v}) }

function resizeCanvas() {
  const wrap = canvasWrap.value, cvs = previewCanvas.value
  if(!wrap||!cvs) return
  const rect = wrap.getBoundingClientRect(), dpr = window.devicePixelRatio||1
  const r = RES[props.settings?.ratio]||RES.vertical
  const tA=r.w/r.h, cA=rect.width/rect.height
  let dw,dh
  if(cA>tA){dh=rect.height;dw=dh*tA}else{dw=rect.width;dh=dw/tA}
  cvs.style.width=Math.round(dw)+'px'; cvs.style.height=Math.round(dh)+'px'
  W=Math.round(dw*dpr); H=Math.round(dh*dpr)
  cvs.width=W; cvs.height=H
  if(mapBg) drawFrame(cvs.getContext('2d'),W,H,0)
}

async function loadBackground() {
  try {
    const mapEl = document.getElementById('map')
    if(!mapEl) { setTimeout(loadBackground,300); return }
    emit('toast','正在加载地图...')
    mapBg = await html2canvas(mapEl, {
      useCORS:true, allowTaint:true, logging:false,
      backgroundColor:null, scale:1
    })
    resizeCanvas()
    bgLoaded.value = true
    emit('toast','地图加载完成')
  } catch(e) {
    console.error(e); emit('toast','地图加载失败')
  }
}

// ====== 坐标投影 ======
function toCanvas(lat, lng) {
  if(!props.mapInstance) return {x:W/2,y:H/2}
  const ms = props.mapInstance.getSize()
  const pt = props.mapInstance.latLngToContainerPoint([lat,lng])
  return { x: pt.x*(W/ms.x), y: pt.y*(H/ms.y) }
}

// ====== 车辆位置 ======
function vehicleAt(t) {
  if(!props.points||props.points.length<2) return {lat:0,lng:0,ang:0}
  let td=0,ds=[]
  for(let i=0;i<props.points.length-1;i++){const d=dist(props.points[i],props.points[i+1]);ds.push(d);td+=d}
  const tgt=td*t; let acc=0,si=0,st=0
  for(let i=0;i<ds.length;i++){if(acc+ds[i]>=tgt){si=i;st=ds[i]>0?(tgt-acc)/ds[i]:0;break}acc+=ds[i]}
  if(si>=ds.length){si=ds.length-1;st=1}
  const p1=props.points[si],p2=props.points[si+1]
  return {lat:p1.lat+(p2.lat-p1.lat)*st,lng:p1.lng+(p2.lng-p1.lng)*st,ang:bearing(p1,p2)}
}
function dist(a,b){
  const R=6371,dL=(b.lat-a.lat)*Math.PI/180,dG=(b.lng-a.lng)*Math.PI/180
  const sa=Math.sin(dL/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dG/2)**2
  return R*2*Math.atan2(Math.sqrt(sa),Math.sqrt(1-sa))
}
function bearing(a,b){
  const dG=(b.lng-a.lng)*Math.PI/180,la=a.lat*Math.PI/180,lb=b.lat*Math.PI/180
  return Math.atan2(Math.sin(dG)*Math.cos(lb),Math.cos(la)*Math.sin(lb)-Math.sin(la)*Math.cos(lb)*Math.cos(dG))*180/Math.PI
}

// ====== 5阶段运镜 ======
function easeOut(t){return 1-Math.pow(1-t,3)}
function easeIO(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}

function getCamera(t) {
  if(!props.points||props.points.length<2) return {x:W/2,y:H/2,z:1}
  const sc=toCanvas(props.points[0].lat,props.points[0].lng)
  const ec=toCanvas(props.points[props.points.length-1].lat,props.points[props.points.length-1].lng)
  const vc=vehicleAt(t), vcc=toCanvas(vc.lat,vc.lng)
  let x,y,z

  if(t<0.08) { // 阶段1: 起点特写
    const p=easeOut(t/0.08); x=sc.x; y=sc.y; z=2.5-p*0.7
  } else if(t<0.2) { // 阶段2: 切入跟随
    const p=easeIO((t-0.08)/0.12); x=sc.x+(vcc.x-sc.x)*p; y=sc.y+(vcc.y-sc.y)*p; z=1.8-p*0.4
  } else if(t<0.8) { // 阶段3: 跟随巡航
    const ah=vehicleAt(Math.min(t+0.05,1)), ac=toCanvas(ah.lat,ah.lng)
    x=vcc.x*0.55+ac.x*0.45; y=vcc.y*0.55+ac.y*0.45
    const cx=(sc.x+ec.x)/2,cy=(sc.y+ec.y)/2
    const r=Math.min(Math.hypot(vcc.x-cx,vcc.y-cy)/(Math.hypot(W,H)/2.5),1)
    z=1.4-r*0.2
  } else if(t<0.94) { // 阶段4: 接近终点
    const p=easeIO((t-0.8)/0.14); x=vcc.x+(ec.x-vcc.x)*p; y=vcc.y+(ec.y-vcc.y)*p; z=1.2+p*0.8
  } else { // 阶段5: 终点特写
    const p=easeIO((t-0.94)/0.06); x=ec.x; y=ec.y; z=2.0+p*0.5
  }
  return {x,y,z}
}

// ====== 绘制引擎 ======
function drawFrame(ctx,cw,ch,t) {
  ctx.clearRect(0,0,cw,ch)
  const tgt=getCamera(t)
  cam.x+=(tgt.x-cam.x)*0.12; cam.y+=(tgt.y-cam.y)*0.12; cam.zoom+=(tgt.z-cam.zoom)*0.12

  ctx.save()
  ctx.translate(cw/2,ch/2); ctx.scale(cam.zoom,cam.zoom); ctx.translate(-cam.x,-cam.y)

  // 背景
  if(mapBg) ctx.drawImage(mapBg,0,0,cw,ch)
  else {
    const g=ctx.createLinearGradient(0,0,cw,ch)
    g.addColorStop(0,'#0d1117');g.addColorStop(0.5,'#161b22');g.addColorStop(1,'#0d1117')
    ctx.fillStyle=g;ctx.fillRect(-cw,-ch,cw*3,ch*3)
  }

  if(props.points&&props.points.length>=2){
    drawRoute(ctx,t); drawPins(ctx); drawDistLabels(ctx); drawVehicle(ctx,t)
  }
  ctx.restore()

  // 暗角
  const vi=Math.min((cam.zoom-1)*0.14,0.32)
  if(vi>0){
    const rg=ctx.createRadialGradient(cw/2,ch/2,Math.min(cw,ch)*0.22,cw/2,ch/2,Math.max(cw,ch)*0.72)
    rg.addColorStop(0,'rgba(0,0,0,0)');rg.addColorStop(1,'rgba(0,0,0,'+vi+')')
    ctx.fillStyle=rg;ctx.fillRect(0,0,cw,ch)
  }

  if(localSettings.value.showWatermark!==false) drawWatermark(ctx,cw,ch)
}

function drawRoute(ctx,t) {
  const pts=props.points.map(p=>toCanvas(p.lat,p.lng))
  ctx.beginPath();ctx.strokeStyle='rgba(255,107,74,0.2)';ctx.lineWidth=3.5
  ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([8,5])
  ctx.moveTo(pts[0].x,pts[0].y)
  for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y)
  ctx.stroke();ctx.setLineDash([])

  const td=totalDist(),tgtD=td*t; let acc=0,drawn=[pts[0]]
  for(let i=0;i<pts.length-1;i++){
    const sd=dist(props.points[i],props.points[i+1])
    if(acc+sd<=tgtD){drawn.push(pts[i+1]);acc+=sd}
    else{const f=sd>0?(tgtD-acc)/sd:0;drawn.push({x:pts[i].x+(pts[i+1].x-pts[i].x)*f,y:pts[i].y+(pts[i+1].y-pts[i].y)*f});break}
  }
  if(drawn.length>1){
    ctx.strokeStyle='rgba(255,107,74,0.2)';ctx.lineWidth=10;ctx.lineCap='round';ctx.lineJoin='round'
    ctx.beginPath();ctx.moveTo(drawn[0].x,drawn[0].y)
    for(let i=1;i<drawn.length;i++)ctx.lineTo(drawn[i].x,drawn[i].y)
    ctx.stroke()
    ctx.strokeStyle='#ff6b4a';ctx.lineWidth=4;ctx.shadowColor='#ff6b4a';ctx.shadowBlur=16
    ctx.beginPath();ctx.moveTo(drawn[0].x,drawn[0].y)
    for(let i=1;i<drawn.length;i++)ctx.lineTo(drawn[i].x,drawn[i].y)
    ctx.stroke();ctx.shadowBlur=0
  }
}
function totalDist(){let t=0;for(let i=0;i<(props.points?.length||0)-1;i++)t+=dist(props.points[i],props.points[i+1]);return t}

function drawPins(ctx) {
  const r=Math.round(Math.min(W,H)*0.022)
  props.points.forEach((p,i)=>{
    const cp=toCanvas(p.lat,p.lng)
    const isS=i===0,isE=i===props.points.length-1
    const colors=isS?['#4ade80','#166534']:isE?['#f87171','#991b1b']:['#fbbf24','#b45309']
    ctx.beginPath();ctx.arc(cp.x,cp.y,r*1.8,0,Math.PI*2);ctx.fillStyle=colors[0]+'18';ctx.fill()
    ctx.beginPath();ctx.arc(cp.x,cp.y,r,0,Math.PI*2)
    const rg=ctx.createRadialGradient(cp.x-r*0.3,cp.y-r*0.3,0,cp.x,cp.y,r)
    rg.addColorStop(0,colors[0]);rg.addColorStop(1,colors[1])
    ctx.fillStyle=rg;ctx.fill();ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=Math.max(2,r*0.18);ctx.stroke()
    ctx.fillStyle='#fff';ctx.font='bold '+Math.round(r*1.05)+'px sans-serif'
    ctx.textAlign='center';ctx.textBaseline='middle'
    ctx.fillText(isS?'A':isE?'B':String(i),cp.x,cp.y)
    if(props.settings?.showLabels){ctx.fillStyle='rgba(255,255,255,0.82)';ctx.font=Math.round(r*0.88)+'px sans-serif';ctx.fillText(p.name,cp.x,cp.y+r*1.45)}
  })
}

function drawDistLabels(ctx) {
  if(!props.settings?.showDistance||!props.segments) return
  for(let i=0;i<props.points.length-1;i++){
    const p1=props.points[i],p2=props.points[i+1],cp=toCanvas((p1.lat+p2.lat)/2,(p1.lng+p2.lng)/2)
    const d=props.segments[i]?.distance||0
    ctx.fillStyle='rgba(0,0,0,0.65)';ctx.beginPath();ctx.roundRect(cp.x-38,cp.y-13,76,26,13);ctx.fill()
    ctx.fillStyle='#fff';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle'
    ctx.fillText(d.toFixed(0)+' km',cp.x,cp.y)
  }
}

function drawVehicle(ctx,t) {
  const vp=vehicleAt(t),vc=toCanvas(vp.lat,vp.lng)
  const veh=props.segments?.[0]?.vehicle||{icon:'🚗'},sc=localSettings.value.vehicleScale||0.65
  ctx.save();ctx.translate(vc.x,vc.y);ctx.rotate((vp.ang-90)*Math.PI/180);ctx.scale(sc,sc)
  ctx.fillStyle='rgba(0,0,0,0.3)';ctx.beginPath();ctx.ellipse(3,3,18,14,0,0,Math.PI*2);ctx.fill()
  ctx.font='32px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(veh.icon,0,0)
  ctx.restore()
}

function drawWatermark(ctx,cw,ch) {
  ctx.save()
  const pad=Math.round(ch*0.018),fs=Math.round(ch*0.022)
  ctx.font='bold '+fs+'px sans-serif'
  const t1='TravelBoast',t2='Made with ❤️'
  const w1=ctx.measureText(t1).width,w2=ctx.measureText(t2).width,mw=Math.max(w1,w2)
  const bx=cw-mw-pad*2.4,by=ch-fs*2.8-pad*1.5
  ctx.fillStyle='rgba(0,0,0,0.45)';ctx.beginPath();ctx.roundRect(bx,by,mw+pad*2,fs*2.8,Math.round(fs*0.55));ctx.fill()
  ctx.fillStyle='rgba(255,255,255,0.88)';ctx.font='bold '+fs+'px sans-serif';ctx.textAlign='left';ctx.textBaseline='top'
  ctx.fillText(t1,bx+pad,by+pad*0.8)
  ctx.fillStyle='rgba(255,255,255,0.5)';ctx.font=Math.round(fs*0.8)+'px sans-serif'
  ctx.fillText(t2,bx+pad,by+pad+fs+fs*0.22)
  ctx.restore()
}

// ====== 动画 ======
async function startPreview() {
  if(isRecording.value||isPlaying.value||!bgLoaded.value) return
  isPlaying.value=true; animStart=performance.now(); animDur=(localSettings.value.videoDuration||15)*1000
  const c0=getCamera(0); cam={x:c0.x,y:c0.y,zoom:c0.z}
  animate()
}
function animate() {
  const el=performance.now()-animStart, t=Math.min(el/animDur,1)
  progress.value=t*100
  const cvs=previewCanvas.value
  if(cvs) drawFrame(cvs.getContext('2d'),W,H,t)
  if(t<1) animFrame=requestAnimationFrame(animate)
  else{isPlaying.value=false;if(isRecording.value)stopRecording()}
}
function stopPreview() {
  if(animFrame){cancelAnimationFrame(animFrame);animFrame=null}
  isPlaying.value=false
}

// ====== 录制 ======
async function toggleRecording() { isRecording.value?stopRecording():startRecording() }

async function startRecording() {
  if(!bgLoaded.value) return
  isRecording.value=true;progress.value=0;emit('toast','正在录制...')
  const cvs=previewCanvas.value
  if(!cvs){emit('toast','画布未就绪');return}

  const dur=(localSettings.value.videoDuration||15)*1000,qual=localSettings.value.videoQuality||'standard'
  try {
    isExporting.value=true;exportStatus.value='正在录制...'
    animStart=performance.now();animDur=dur;isPlaying.value=true
    const c0=getCamera(0);cam={x:c0.x,y:c0.y,zoom:c0.z}

    const preset=getPresetForRatio(props.settings?.ratio,qual)
    const totalFrames=Math.round(dur/1000*preset.fps),interval=1000/preset.fps
    const stream=cvs.captureStream(preset.fps)
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:preset.bitrate*1000})
    const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}
    recorder.start(); animate()

    await new Promise(resolve=>{
      recorder.onstop=resolve;let fc=0
      const check=()=>{fc++;progress.value=Math.min(fc/totalFrames*100,100);frameInfo.value=fc+'/'+totalFrames+'帧';if(fc>=totalFrames)recorder.stop();else setTimeout(check,interval*0.95)}
      setTimeout(check,interval)
    })

    const blob=new Blob(chunks,{type:'video/webm'})
    exportStatus.value='正在转换MP4...';let fb=blob,fmt='webm'
    try{fb=await convertWebMToMP4(blob,p=>{exportStatus.value='转换中 '+Math.round(p)+'%'});fmt='mp4'}catch(e){console.warn('MP4失败:',e)}

    exportStatus.value='正在保存...'
    const fn=generateFilename({ratio:props.settings?.ratio,quality:qual,points:props.points,format:fmt})
    const sr=await saveVideoFile(fb,{suggestedName:fn,format:fmt})
    if(sr.success)emit('toast','视频已保存！'+(fb.size/1024/1024).toFixed(2)+' MB')
    else if(sr.aborted)emit('toast','已取消保存')
    else emit('toast','保存失败:'+(sr.error||'?'))
  } catch(err){console.error(err);emit('toast','录制失败:'+err.message)}
  finally{isRecording.value=false;isPlaying.value=false;isExporting.value=false;exportStatus.value='';stopPreview()}
}
function stopRecording(){isRecording.value=false}

function close() {
  if(animFrame){cancelAnimationFrame(animFrame);animFrame=null}
  isPlaying.value=false;isRecording.value=false;isExporting.value=false;progress.value=0;frameInfo.value=''
  emit('close')
}
onBeforeUnmount(()=>{if(animFrame)cancelAnimationFrame(animFrame)})
</script>

<style scoped>
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(16px)}
.modal-body{position:relative;background:#111827;border-radius:16px;width:94vw;max-width:1100px;max-height:94vh;border:1px solid rgba(255,255,255,0.06);box-shadow:0 32px 80px rgba(0,0,0,0.6);display:flex;flex-direction:column;overflow:hidden}
.close-btn{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;z-index:10}
.close-btn:hover{background:rgba(255,107,74,0.25);color:#ff6b4a;transform:rotate(90deg)}
.header{padding:18px 22px 12px}
.title{display:flex;align-items:center;gap:10px;color:#e5e7eb;font-size:16px;font-weight:700}
.badge{margin-left:auto;padding:3px 10px;border-radius:10px;background:rgba(255,107,74,0.12);color:#ff6b4a;font-size:11px;font-weight:700}
.content{display:flex;gap:20px;padding:0 22px 18px;flex:1;min-height:0}
@media(max-width:820px){.content{flex-direction:column;gap:14px}}
.map-section{flex:1;display:flex;flex-direction:column;gap:12px;min-width:0}
.canvas-wrap{flex:1;display:flex;align-items:center;justify-content:center;background:#0a0e14;border-radius:12px;overflow:hidden;min-height:340px}
.canvas-wrap canvas{display:block;max-width:100%;max-height:100%}
.playback{display:flex;gap:8px;justify-content:center}
.btn{display:inline-flex;align-items:center;gap:5px;padding:10px 22px;border-radius:10px;border:none;font-size:13px;font-weight:700;cursor:pointer;transition:all .2s}
.btn:disabled{opacity:0.35;cursor:not-allowed}
.btn.play{background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;box-shadow:0 2px 12px rgba(29,78,216,0.3)}
.btn.play:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 20px rgba(29,78,216,0.4)}
.btn.stop{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.65)}
.btn.stop:hover:not(:disabled){background:rgba(255,255,255,0.12)}
.btn.record{background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;box-shadow:0 2px 12px rgba(220,38,38,0.3)}
.btn.record:hover:not(:disabled){transform:translateY(-1px)}
.btn.record.recording{animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
.controls{width:270px;display:flex;flex-direction:column;gap:14px;flex-shrink:0}
@media(max-width:820px){.controls{width:100%}}
.sec{background:rgba(255,255,255,0.03);border-radius:12px;padding:14px}
.row{display:flex;align-items:center;justify-content:space-between;color:#d1d5db;font-size:13px;font-weight:600;margin-bottom:10px}
.row label{display:flex;align-items:center;gap:6px}
.val{color:#ff6b4a;font-weight:800;font-size:14px}
.slider{-webkit-appearance:none;appearance:none;width:100%;height:5px;border-radius:3px;background:rgba(255,255,255,0.08);outline:none;cursor:pointer}
.slider::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;border:2.5px solid #ff6b4a;box-shadow:0 2px 8px rgba(255,107,74,0.3);cursor:grab}
.slider::-webkit-slider-thumb:active{transform:scale(1.15);cursor:grabbing}
.quals{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.qb{padding:8px 2px;border-radius:8px;border:1.5px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.45);font-size:12px;font-weight:600;cursor:pointer;transition:all .2s}
.qb.on{border-color:#ff6b4a;color:#ff6b4a;background:rgba(255,107,74,0.08)}
.toggle-sec{display:flex!important;align-items:center;justify-content:space-between;padding:12px 14px!important}
.sw{position:relative;width:40px;height:22px;cursor:pointer}
.sw input{opacity:0;width:0;height:0}
.sw i{position:absolute;inset:0;background:rgba(255,255,255,0.1);border-radius:22px;transition:.25s}
.sw i::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.25s;box-shadow:0 1px 3px rgba(0,0,0,0.2)}
.sw input:checked+i{background:#ff6b4a}
.sw input:checked+i::after{transform:translateX(18px)}
.prog{display:flex;flex-direction:column;gap:6px;padding:10px;background:rgba(255,107,74,0.04);border:1px solid rgba(255,107,74,0.1);border-radius:10px}
.pbar{height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden}
.pfill{height:100%;background:linear-gradient(90deg,#ff6b4a,#ffa07a);border-radius:3px;transition:width .12s linear}
.ptxt{font-size:11px;color:rgba(255,255,255,0.5);text-align:center}
.exp{display:flex;align-items:center;justify-content:center;gap:8px;color:#e5e7eb;font-size:13px;padding:10px}
.edot{width:16px;height:16px;border:2.5px solid rgba(255,107,74,0.4);border-top-color:#ff6b4a;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
