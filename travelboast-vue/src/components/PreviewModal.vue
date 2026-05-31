<template>
  <div v-if="show" class="modal-overlay" @click.self="close">
    <div class="modal-body">
      <button class="close-btn" @click="close">✕</button>
      <div class="header">
        <span class="title-text">{{ mode==='export'?'导出视频':'路线预览' }}</span>
        <span class="badge">{{ ratioBadge }}</span>
      </div>
      <div class="content">
        <div class="map-area">
          <!-- 真实地图，不走形 -->
          <div class="map-box" ref="mapBox" :class="['shape-'+shape, {tilted: local.tilt>0}]" :style="{'--tilt': local.tilt+'deg'}"></div>
          <div class="ctrl-bar">
            <button class="btn" :class="{on:shape==='vertical'}" @click="shape='vertical'">9:16</button>
            <button class="btn" :class="{on:shape==='horizontal'}" @click="shape='horizontal'">16:9</button>
            <button class="btn" :class="{on:shape==='square'}" @click="shape='square'">1:1</button>
            <button class="btn play" :disabled="isRecording||isPlaying||!ready" @click="startPlay">▶ 播放</button>
            <button class="btn stop" :disabled="isRecording||!isPlaying" @click="stopPlay">⏹</button>
            <button v-if="mode==='export'" class="btn rec" :class="{on:isRecording}" @click="toggleRec">{{isRecording?'⏹停止':'⏺录制'}}</button>
          </div>
        </div>
        <div class="panel" v-if="mode==='export'">
          <div class="sec">
            <div class="r"><span>时长</span><span class="v">{{local.vd}}s</span></div>
            <input type="range" min="5" max="60" :value="local.vd" step="1" class="s" @input="setL('vd',+$event.target.value)">
          </div>
          <div class="sec">
            <div class="r"><span>车大小</span><span class="v">{{local.vs.toFixed(2)}}</span></div>
            <input type="range" min="0.3" max="1.5" :value="local.vs" step="0.05" class="s" @input="setL('vs',+$event.target.value)">
          </div>
          <div class="sec">
            <div class="r"><span>倾斜</span><span class="v">{{local.tilt}}°</span></div>
            <input type="range" min="0" max="60" :value="local.tilt" step="5" class="s" @input="setL('tilt',+$event.target.value)">
          </div>
          <div class="sec">
            <div class="r"><span>放大比例</span><span class="v">{{(local.zoomScale*100).toFixed(0)}}%</span></div>
            <input type="range" min="10" max="80" :value="local.zoomScale*100" step="5" class="s" @input="setL('zoomScale',+$event.target.value/100)">
          </div>
          <div class="sec">
            <div class="r"><span>质量</span></div>
            <div class="gs">
              <button v-for="(lb,k) in ql" :key="k" :class="{on:local.vq===k}" @click="setL('vq',k)">{{lb}}</button>
            </div>
          </div>
          <div class="sec tr" @click="setL('wm',!local.wm)">
            <span>水印</span><span class="sw"><i :class="{on:local.wm}"></i></span>
          </div>
          <div v-if="isRecording" class="pr">
            <div class="pb"><div class="pf" :style="{width:pct+'%'}"></div></div>
            <div class="pt">{{pct|0}}%·{{fi}}</div>
          </div>
          <div v-if="isExporting" class="ex"><div class="ed"></div>{{es}}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import L from 'leaflet'
import html2canvas from 'html2canvas'
import { saveVideoFile, generateFilename, getPresetForRatio, convertWebMToMP4 } from '../utils/videoRecorder.js'

const props = defineProps({show:Boolean,mode:{default:'play'},points:Array,segments:Array,settings:Object,mapInstance:Object})
const emit = defineEmits(['close','toast','update:settings'])

const ql = {draft:'草稿',standard:'标准',high:'高清'}
const local = ref({vd:15,vs:0.65,vq:'standard',wm:true,tilt:30,zoomScale:0.33})

const shape = ref('vertical')
const isPlaying = ref(false), isRecording = ref(false), isExporting = ref(false)
const ready = ref(false)
const pct = ref(0), fi = ref(''), es = ref('')
const mapBox = ref(null)

const ratioBadge = computed(()=>{
  const r = shape.value
  return r==='vertical'?'9:16 竖屏':r==='horizontal'?'16:9 横屏':'1:1 方形'
})

let pmap = null, tileLayer = null, rline = null, vmarker = null, markers = []
let af = null, a0 = 0, ad = 0

// 同步 shape → settings.ratio
watch(shape, v => emit('update:settings',{...props.settings,ratio:v}))
watch(()=>props.show, async v=>{ if(v){await nextTick();setTimeout(init,300)}else{clean()} })
watch(()=>props.settings, v=>{if(v){local.value.vd=v.videoDuration??15;local.value.vs=v.vehicleScale??0.65;local.value.tilt=v.tilt??30;local.value.zoomScale=v.zoomScale??0.33}},{immediate:true})

function setL(k,v){local.value[k]=v;emit('update:settings',{...props.settings,[k]:v})}

// ======== 真实地图 ========
async function init(retry=0){
  if(!props.points?.length) return
  clean()
  const el = mapBox.value
  if(!el){if(retry<5){setTimeout(()=>init(retry+1),200)};return}
  // 确保容器有尺寸
  const rect = el.getBoundingClientRect()
  if(rect.width<10 || rect.height<10){if(retry<10){setTimeout(()=>init(retry+1),300)};return}
  try{
    pmap = L.map(el,{center:[props.points[0].lat,props.points[0].lng],zoom:5,zoomControl:false,attributionControl:false})
    tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,subdomains:['a','b','c']}).addTo(pmap)
    await new Promise(r=>setTimeout(r,600))
    const coords = props.points.map(p=>[p.lat,p.lng])
    rline = L.polyline(coords,{color:'#ff6b4a',weight:4,opacity:0.85}).addTo(pmap)
    props.points.forEach((p,i)=>{
      const isS=i===0,isE=i===props.points.length-1
      const c = isS?'#4ade80':isE?'#f87171':'#fbbf24'
      const m = L.circleMarker([p.lat,p.lng],{radius:10,color:'#fff',weight:2.5,fillColor:c,fillOpacity:1}).addTo(pmap)
      const lb = isS?'A':isE?'B':String(i)
      L.tooltip({permanent:true,direction:'center',className:'pl',opacity:1}).setLatLng([p.lat,p.lng]).setContent('<b style="color:#fff;font-size:13px">'+lb+'</b>').addTo(pmap)
      markers.push(m)
    })
    const icon = props.segments?.[0]?.vehicle?.icon||'🚗'
    const divIcon = L.divIcon({html:'<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))">'+icon+'</div>',iconSize:[32,32],iconAnchor:[16,16],className:'vm'})
    vmarker = L.marker([props.points[0].lat,props.points[0].lng],{icon:divIcon}).addTo(pmap)
    pmap.fitBounds(coords,{padding:[50,50]})
    await nextTick()
    pmap.invalidateSize()
    ready.value = true
  }catch(e){console.error(e);emit('toast','地图加载失败')}
}
function clean(){if(pmap){pmap.remove();pmap=null}rline=null;vmarker=null;markers=[];ready.value=false}

// ======== 运镜 ========
function ease(t){return 1-Math.pow(1-t,3)}
function ei(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}

function getRouteZoom(){
  const pts=props.points
  if(pts.length<2) return 5
  const group = L.latLngBounds(pts.map(p=>[p.lat,p.lng]))
  const ne = group.getNorthEast(), sw = group.getSouthWest()
  const center = [(ne.lat+sw.lat)/2, (ne.lng+sw.lng)/2]
  const scale = local.value.zoomScale ?? 0.33
  const padded = L.latLngBounds(
    [center[0]-(ne.lat-sw.lat)*scale, center[1]-(ne.lng-sw.lng)*scale],
    [center[0]+(ne.lat-sw.lat)*scale, center[1]+(ne.lng-sw.lng)*scale]
  )
  return pmap.getBoundsZoom(padded, false)
}

function getCam(t){
  const pts=props.points, s=pts[0], e=pts[pts.length-1], v=vehAt(t)
  const routeZoom = getRouteZoom()
  const closeZoom = Math.min(routeZoom + 2, 16)
  let lat,lng,z
  if(t<0.08){const p=ease(t/0.08);lat=s.lat;lng=s.lng;z=closeZoom-p*(closeZoom-routeZoom)}
  else if(t<0.2){const p=ei((t-0.08)/0.12);lat=s.lat+(v.lat-s.lat)*p;lng=s.lng+(v.lng-s.lng)*p;z=routeZoom+(closeZoom-routeZoom)*(1-p)}
  else if(t<0.8){const ah=vehAt(Math.min(t+0.05,1));lat=v.lat*0.5+ah.lat*0.5;lng=v.lng*0.5+ah.lng*0.5;z=routeZoom}
  else if(t<0.94){const p=ei((t-0.8)/0.14);lat=v.lat+(e.lat-v.lat)*p;lng=v.lng+(e.lng-v.lng)*p;z=routeZoom+(closeZoom-routeZoom)*p}
  else{const p=ei((t-0.94)/0.06);lat=e.lat;lng=e.lng;z=closeZoom-p*(closeZoom-routeZoom)}
  return{lat,lng,z}
}

function vehAt(t){
  if(!props.points||props.points.length<2)return{lat:0,lng:0}
  let td=0,ds=[]
  for(let i=0;i<props.points.length-1;i++){const d=dst(props.points[i],props.points[i+1]);ds.push(d);td+=d}
  const tgt=td*t;let acc=0,si=0,st=0
  for(let i=0;i<ds.length;i++){if(acc+ds[i]>=tgt){si=i;st=ds[i]>0?(tgt-acc)/ds[i]:0;break}acc+=ds[i]}
  if(si>=ds.length){si=ds.length-1;st=1}
  const p1=props.points[si],p2=props.points[si+1]
  return{lat:p1.lat+(p2.lat-p1.lat)*st,lng:p1.lng+(p2.lng-p1.lng)*st}
}
function dst(a,b){const R=6371,dL=(b.lat-a.lat)*Math.PI/180,dG=(b.lng-a.lng)*Math.PI/180;const sa=Math.sin(dL/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dG/2)**2;return R*2*Math.atan2(Math.sqrt(sa),Math.sqrt(1-sa))}

// ======== 动画 ========
function startPlay(){if(isRecording.value||isPlaying.value||!ready.value)return;isPlaying.value=true;a0=performance.now();ad=(local.value.vd||15)*1000;an()}
function an(){
  const el=performance.now()-a0,t=Math.min(el/ad,1);pct.value=t*100
  if(vmarker){const vp=vehAt(t);vmarker.setLatLng([vp.lat,vp.lng]);const c=getCam(t);pmap.setView([c.lat,c.lng],c.z,{animate:false})}
  if(t<1)af=requestAnimationFrame(an);else{isPlaying.value=false;if(isRecording.value)stopRec()}
}
function stopPlay(){if(af){cancelAnimationFrame(af);af=null}isPlaying.value=false;if(vmarker&&props.points?.length)vmarker.setLatLng([props.points[0].lat,props.points[0].lng])}

// ======== 录制 ========
function toggleRec(){isRecording.value?stopRec():startRec()}
async function startRec(){
  if(!ready.value||!pmap)return
  isRecording.value=true;pct.value=0;emit('toast','录制中...')
  const dur=(local.value.vd||15)*1000,qual=local.value.vq||'standard'
  try{
    isExporting.value=true;es.value='录制中...'
    const mapEl = pmap.getContainer()
    const preset=getPresetForRatio(props.settings?.ratio||'vertical',qual)
    const totalFrames=Math.round(dur/1000*preset.fps),intv=1000/preset.fps
    const frames=[]
    a0=performance.now();ad=dur;isPlaying.value=true;an()
    for(let i=0;i<totalFrames;i++){
      await new Promise(r=>setTimeout(r,intv*0.9))
      pct.value=(i+1)/totalFrames*100;fi.value=(i+1)+'/'+totalFrames+'帧'
      try{const c=await html2canvas(mapEl,{useCORS:true,allowTaint:true,logging:false,backgroundColor:null,scale:1});frames.push(c)}catch(e){console.error(e)}
    }
    stopPlay()
    // 合成
    es.value='合成中...'
    const cvs = document.createElement('canvas')
    cvs.width = mapEl.offsetWidth; cvs.height = mapEl.offsetHeight
    const ctx = cvs.getContext('2d')
    const stream = cvs.captureStream(preset.fps)
    const rec = new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:preset.bitrate*1000})
    const chunks = []; rec.ondataavailable = e=>{if(e.data.size)chunks.push(e.data)}
    rec.start()
    let fi2 = 0
    await new Promise(resolve => {
      rec.onstop = resolve
      const play = () => {
        if(fi2>=frames.length){rec.stop();return}
        ctx.drawImage(frames[fi2],0,0)
        fi2++; setTimeout(play,intv)
      }
      play()
    })
    const blob = new Blob(chunks,{type:'video/webm'})
    es.value='转MP4...';let fb=blob,fmt='webm'
    try{fb=await convertWebMToMP4(blob,p=>{es.value='转换'+Math.round(p)+'%'});fmt='mp4'}catch(e){console.warn(e)}
    es.value='保存...'
    const fn = generateFilename({ratio:props.settings?.ratio||'vertical',quality:qual,points:props.points,format:fmt})
    const sr = await saveVideoFile(fb,{suggestedName:fn,format:fmt})
    if(sr.success)emit('toast','视频已存！'+(fb.size/1024/1024).toFixed(2)+'MB')
    else emit('toast',sr.aborted?'已取消':'失败:'+(sr.error||'?'))
  }catch(e){console.error(e);emit('toast','录制失败:'+e.message)}
  finally{isRecording.value=false;isPlaying.value=false;isExporting.value=false;es.value=''}
}
function stopRec(){isRecording.value=false}

function close(){
  if(af){cancelAnimationFrame(af);af=null}
  isPlaying.value=false;isRecording.value=false;isExporting.value=false
  emit('close')
}
onBeforeUnmount(()=>{if(af)cancelAnimationFrame(af);clean()})
</script>

<style scoped>
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(16px)}
.modal-body{position:relative;background:#111827;border-radius:16px;width:96vw;max-width:1200px;max-height:96vh;border:1px solid rgba(255,255,255,.06);box-shadow:0 32px 80px rgba(0,0,0,.6);display:flex;flex-direction:column;overflow:hidden}
.close-btn{position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:50%;border:none;background:rgba(255,255,255,.08);color:rgba(255,255,255,.5);font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.2s;z-index:5}
.close-btn:hover{background:rgba(255,107,74,.25);color:#ff6b4a;transform:rotate(90deg)}
.header{padding:14px 20px 8px;display:flex;align-items:center;gap:10px;color:#e5e7eb;font-size:15px;font-weight:700}
.badge{margin-left:auto;padding:2px 10px;border-radius:10px;background:rgba(255,107,74,.12);color:#ff6b4a;font-size:11px;font-weight:700}

.content{display:flex;gap:16px;padding:0 20px 16px;flex:1;min-height:0}
@media(max-width:820px){.content{flex-direction:column}}

.map-area{flex:1;display:flex;flex-direction:column;gap:8px;min-width:0;align-items:center}
.map-box{border-radius:12px;overflow:hidden;background:#0a0e14;position:relative;width:100%;transition:transform .3s ease}
.map-box.shape-vertical{max-width:380px;aspect-ratio:9/16;max-height:70vh}
.map-box.shape-horizontal{aspect-ratio:16/9;max-height:60vh}
.map-box.shape-square{max-width:500px;aspect-ratio:1/1;max-height:70vh}
.map-box.tilted{transform:perspective(800px) rotateX(var(--tilt,0deg))}
.map-box :deep(.leaflet-container){background:#0a0e14;height:100%!important;width:100%!important;min-height:300px}

.ctrl-bar{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
.btn{padding:8px 16px;border-radius:8px;border:1.5px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:rgba(255,255,255,.5);font-size:12px;font-weight:700;cursor:pointer;transition:.2s}
.btn.on,.btn:hover{background:rgba(255,255,255,.1);color:#fff}
.btn.play{background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border-color:transparent}
.btn.play:hover{transform:translateY(-1px)}
.btn:disabled{opacity:.3;cursor:not-allowed}
.btn.stop{background:rgba(255,255,255,.06)}
.btn.rec{background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;border-color:transparent}

.panel{width:250px;display:flex;flex-direction:column;gap:10px;flex-shrink:0}
@media(max-width:820px){.panel{width:100%}}
.sec{background:rgba(255,255,255,.03);border-radius:10px;padding:12px}
.r{display:flex;justify-content:space-between;color:#d1d5db;font-size:13px;font-weight:600;margin-bottom:8px}
.v{color:#ff6b4a;font-weight:800}
.s{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:2px;background:rgba(255,255,255,.08);outline:none;cursor:pointer}
.s::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid #ff6b4a;cursor:grab}
.gs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
.gs button{padding:7px 0;border-radius:7px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.03);color:rgba(255,255,255,.4);font-size:11px;font-weight:600;cursor:pointer;transition:.2s}
.gs button.on{border-color:#ff6b4a;color:#ff6b4a;background:rgba(255,107,74,.08)}

.tr{display:flex;justify-content:space-between;align-items:center;cursor:pointer;color:#e5e7eb;font-weight:600;font-size:13px}
.sw{width:38px;height:20px;border-radius:20px;background:rgba(255,255,255,.1);display:inline-block;position:relative;transition:.2s}
.sw i{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.2s}
.sw i.on{background:#ff6b4a;left:20px}

.pr{display:flex;flex-direction:column;gap:4px;padding:8px;background:rgba(255,107,74,.04);border:1px solid rgba(255,107,74,.1);border-radius:8px}
.pb{height:4px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden}
.pf{height:100%;background:linear-gradient(90deg,#ff6b4a,#ffa07a);transition:width .1s linear}
.pt{font-size:10px;color:rgba(255,255,255,.4);text-align:center}

.ex{display:flex;align-items:center;justify-content:center;gap:6px;color:#e5e7eb;font-size:12px;padding:8px}
.ed{width:14px;height:14px;border:2px solid rgba(255,107,74,.4);border-top-color:#ff6b4a;border-radius:50%;animation:sp .6s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}

:deep(.leaflet-control-zoom){display:none}
:deep(.leaflet-control-attribution){display:none}
:deep(.pl){background:none!important;border:none!important;box-shadow:none!important;padding:0!important}
:deep(.vm){background:none!important;border:none!important}
</style>