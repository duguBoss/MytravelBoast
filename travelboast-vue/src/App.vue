<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import TopBar from './components/TopBar.vue'
import RoutePanel from './components/RoutePanel.vue'
import VehiclePanel from './components/VehiclePanel.vue'
import SettingsDrawer from './components/SettingsDrawer.vue'
import PreviewModal from './components/PreviewModal.vue'
import Toast from './components/Toast.vue'
import ThreeVehicleOverlay from './components/ThreeVehicleOverlay.vue'

import { vehicles } from './constants/vehicles.js'
import { countryFlags, tileUrls, tileSubdomains, mapAttributions } from './constants/map.js'
import { uid, haversine, bearing, getFlag } from './utils/helpers.js'

// State
const selVehicle = ref(vehicles[0])
const selSegment = ref(0)
const points = reactive([
  { id: uid(), name: '北京', lat: 39.9042, lng: 116.4074, type: 'start' },
  { id: uid(), name: '东京', lat: 35.6762, lng: 139.6503, type: 'end' }
])
const segments = reactive([{ vehicle: vehicles[0], distance: 0 }])
const settings = reactive({
  ratio: 'vertical', speed: 2, size: 'medium',
  mapStyle: 'voyager', showDistance: true,
  showFlags: false, use3D: true, showLabels: true,
  view3D: false, tilt: 30, rotation: 0
})

// UI state
const leftOpen = ref(false)
const settingsOpen = ref(false)
const activeCat = ref('all')
const toastMsg = ref('')
const showPreview = ref(false)
const previewMode = ref('play')

// Map refs
let map = null
let routeLine = null
let mapTiles = null
const distMarkers = ref([])
const pinMarkers = ref([])
let vehicleMarker = null
let animRaf = null

// Map 3D refs
const mapInner = ref(null)

// 3D Vehicle state
const use3DModel = ref(true)
const vehicle3DPosition = ref({ lat: 39.9042, lng: 116.4074 })
const vehicle3DHeading = ref(0)
const vehicle3DScale = ref(1)

// Computed
const totalDistStr = computed(() => {
  const total = segments.reduce((s, seg) => s + seg.distance, 0)
  return total.toFixed(0) + ' km'
})

// Toast helper
let toastTick = 0
function showToast(msg) {
  toastMsg.value = ''
  nextTick(() => {
    toastMsg.value = msg + '\n' + (++toastTick)
  })
}

// Route logic
function addPoint(lat, lng, name) {
  const nm = name || ('途经点 ' + (points.length - 1))
  const np = { id: uid(), name: nm, lat, lng, type: 'stop' }
  points.splice(points.length - 1, 0, np)
  syncSegments()
  renderRoute()
  showToast('已添加：' + nm)
}

function removePoint(id) {
  if (points.length <= 2) { showToast('至少保留起点和终点'); return }
  const idx = points.findIndex(p => p.id === id)
  if (idx > -1) {
    points.splice(idx, 1)
    syncSegments()
    renderRoute()
  }
}

function syncSegments() {
  const newSegs = []
  for (let i = 0; i < points.length - 1; i++) {
    const v = (segments[i] && segments[i].vehicle) || selVehicle.value
    newSegs.push({ vehicle: v, distance: 0 })
  }
  segments.splice(0, segments.length, ...newSegs)
}

function updateDistances() {
  let total = 0
  segments.forEach((s, i) => {
    const d = haversine(points[i].lat, points[i].lng, points[i+1].lat, points[i+1].lng)
    s.distance = d
    total += d
  })
}

function renderRoute() {
  if (!map) return
  pinMarkers.value.forEach(m => map.removeLayer(m))
  pinMarkers.value = []
  distMarkers.value.forEach(m => map.removeLayer(m))
  distMarkers.value = []

  points.forEach((p, i) => {
    const isS = i === 0, isE = i === points.length - 1
    const flag = settings.showFlags ? getFlag(p.name, countryFlags) : ''
    const nameLabel = settings.showLabels ? p.name : ''
    const label = isS ? 'A' : isE ? 'B' : String(i)

    const html = `
      <div class="map-pin">
        <div class="map-pin-dot ${isS?'start':isE?'end':'stop'}">${label}</div>
        ${flag ? `<div class="map-pin-flag">${flag}</div>` : ''}
        ${nameLabel ? `<div class="map-pin-label">${nameLabel}</div>` : ''}
      </div>`
    const icon = L.divIcon({ html, className: '', iconSize: [40, 56], iconAnchor: [20, 48] })
    const m = L.marker([p.lat, p.lng], { icon, draggable: true }).addTo(map)
    m.on('dragend', (e) => {
      const ll = e.target.getLatLng()
      p.lat = ll.lat; p.lng = ll.lng
      renderRouteLine(); updateDistances(); renderDistLabels()
    })
    pinMarkers.value.push(m)
  })

  renderRouteLine()
  updateDistances()
  fitRoute()
  renderDistLabels()
  renderVehicle()
}

function renderRouteLine() {
  if (routeLine) map.removeLayer(routeLine)
  const latlngs = points.map(p => [p.lat, p.lng])
  routeLine = L.polyline(latlngs, {
    color: '#ff6b4a', weight: 4, opacity: 0.85,
    lineCap: 'round', lineJoin: 'round'
  }).addTo(map)
}

function renderVehicle() {
  if (use3DModel.value) {
    // Hide Leaflet marker when using 3D model
    if (vehicleMarker) {
      map.removeLayer(vehicleMarker)
      vehicleMarker = null
    }
    const v = segments[0]?.vehicle || vehicles[0]
    let angle = 0
    if (points.length >= 2) {
      angle = bearing(points[0].lat, points[0].lng, points[1].lat, points[1].lng)
    }
    vehicle3DPosition.value = { lat: points[0].lat, lng: points[0].lng }
    vehicle3DHeading.value = angle
    return
  }

  // Fallback to emoji marker
  if (vehicleMarker) map.removeLayer(vehicleMarker)
  const v = segments[0]?.vehicle || vehicles[0]
  let angle = 0
  if (points.length >= 2) {
    angle = bearing(points[0].lat, points[0].lng, points[1].lat, points[1].lng) - 90
  }
  const vehicleIcon = L.divIcon({
    html: `<div style="font-size:32px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3));transform:rotate(${angle}deg);">${v.icon}</div>`,
    className: '', iconSize: [40, 40], iconAnchor: [20, 20]
  })
  const latlngs = points.map(p => [p.lat, p.lng])
  vehicleMarker = L.marker(latlngs[0], { icon: vehicleIcon, interactive: false, zIndexOffset: 1000 }).addTo(map)
}

function updateVehiclePosition(t) {
  const totalDist = segments.reduce((s, seg) => s + seg.distance, 0)
  const targetDist = totalDist * t

  let acc = 0
  let segIdx = 0, segT = 0
  for (let i = 0; i < segments.length; i++) {
    if (acc + segments[i].distance >= targetDist) {
      segIdx = i
      segT = segments[i].distance > 0 ? (targetDist - acc) / segments[i].distance : 0
      break
    }
    acc += segments[i].distance
  }
  if (segIdx >= segments.length) {
    segIdx = segments.length - 1
    segT = 1
  }

  const p1 = points[segIdx]
  const p2 = points[segIdx + 1]
  const lat = p1.lat + (p2.lat - p1.lat) * segT
  const lng = p1.lng + (p2.lng - p1.lng) * segT

  console.log('[updateVehicle] t:', t.toFixed(3), 'segIdx:', segIdx, 'segT:', segT.toFixed(3), 'lat:', lat.toFixed(4), 'lng:', lng.toFixed(4), 'vehicleMarker:', !!vehicleMarker)

  if (use3DModel.value) {
    const angle = bearing(p1.lat, p1.lng, p2.lat, p2.lng)
    vehicle3DPosition.value = { lat, lng }
    vehicle3DHeading.value = angle
  }

  if (vehicleMarker) {
    vehicleMarker.setLatLng([lat, lng])
    const v = segments[segIdx]?.vehicle || segments[0]?.vehicle
    const angle = bearing(p1.lat, p1.lng, p2.lat, p2.lng) - 90
    const vehicleIcon = L.divIcon({
      html: `<div style="font-size:32px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3));transform:rotate(${angle}deg);">${v?.icon || '✈️'}</div>`,
      className: '', iconSize: [40, 40], iconAnchor: [20, 20]
    })
    vehicleMarker.setIcon(vehicleIcon)
  }
}

function renderDistLabels() {
  if (!settings.showDistance) return
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i], p2 = points[i+1]
    const lat = (p1.lat + p2.lat) / 2, lng = (p1.lng + p2.lng) / 2
    const html = `<div class="distance-label">${segments[i].distance.toFixed(0)} km</div>`
    const icon = L.divIcon({ html, className: '', iconSize: [80, 20], iconAnchor: [40, 10] })
    distMarkers.value.push(L.marker([lat, lng], { icon, interactive: false }).addTo(map))
  }
}

function fitRoute() {
  if (points.length < 2 || pinMarkers.value.length === 0) return
  const group = new L.featureGroup(pinMarkers.value)
  map.fitBounds(group.getBounds().pad(0.12))
}

function initMap() {
  map = L.map('map', { zoomControl: false }).setView([37.5, 128], 4)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  mapTiles = L.tileLayer(tileUrls.voyager, {
    attribution: mapAttributions.voyager,
    maxZoom: 19,
    subdomains: tileSubdomains.voyager,
    crossOrigin: true
  }).addTo(map)

  map.on('click', (e) => {
    if (map._addingStop) return
    addPoint(e.latlng.lat, e.latlng.lng)
  })

  renderRoute()
}

// 3D view
function updateMap3D() {
  const inner = mapInner.value
  if (!inner) return
  if (settings.view3D) {
    inner.classList.add('tilted')
    inner.style.transform = `rotateX(${settings.tilt}deg) rotateZ(${settings.rotation}deg) scale(1.15)`
  } else {
    inner.classList.remove('tilted')
    inner.style.transform = ''
  }
  setTimeout(() => { if (map) map.invalidateSize() }, 350)
}

watch(() => settings.view3D, updateMap3D)
watch(() => settings.tilt, updateMap3D)
watch(() => settings.rotation, updateMap3D)

// Map style
watch(() => settings.mapStyle, (val) => {
  if (!map || !mapTiles) return
  map.removeLayer(mapTiles)
  const opts = { attribution: mapAttributions[val], maxZoom: 19, crossOrigin: true }
  if (tileSubdomains[val]) opts.subdomains = tileSubdomains[val]
  mapTiles = L.tileLayer(tileUrls[val], opts).addTo(map)
})

watch(() => settings.showDistance, () => renderRoute())
watch(() => settings.showFlags, () => renderRoute())
watch(() => settings.showLabels, () => renderRoute())

// Play animation on main map
const isPlaying = ref(false)
const playProgress = ref(0)

function playAnimation() {
  console.log('[playAnimation] called, points:', points.length)
  if (points.length < 2) {
    showToast('请至少设置起点和终点')
    return
  }
  if (isPlaying.value) return

  // Ensure vehicle marker exists
  if (!vehicleMarker) {
    renderVehicle()
  }

  isPlaying.value = true
  playProgress.value = 0

  const totalDist = segments.reduce((s, seg) => s + seg.distance, 0)
  console.log('[playAnimation] totalDist:', totalDist, 'segments:', segments.length)
  for (let i = 0; i < segments.length; i++) {
    console.log('[playAnimation] segment', i, 'distance:', segments[i].distance)
  }

  const duration = Math.max((totalDist * 28) / (settings.speed || 2), 3000)
  console.log('[playAnimation] duration:', duration)
  const startTime = performance.now()

  function step(now) {
    const elapsed = now - startTime
    const t = Math.min(elapsed / duration, 1)
    playProgress.value = t * 100
    updateVehiclePosition(t)

    if (t < 1) {
      animRaf = requestAnimationFrame(step)
    } else {
      isPlaying.value = false
      console.log('[playAnimation] finished')
    }
  }

  animRaf = requestAnimationFrame(step)
}

function stopAnimation() {
  if (animRaf) {
    cancelAnimationFrame(animRaf)
    animRaf = null
  }
  isPlaying.value = false
}

// Export preview (opens modal for recording)
function openExport() {
  if (points.length < 2) {
    showToast('请至少设置起点和终点')
    return
  }
  previewMode.value = 'export'
  showPreview.value = true
}

// Vehicle selection
function selectVehicle(v) {
  selVehicle.value = v
  if (segments[selSegment.value]) segments[selSegment.value].vehicle = v
  showToast('已选择：' + v.name)
}

// Settings
function updateSetting(key, val) {
  settings[key] = val
}

// Add stop
function addStop() {
  showToast('点击地图添加途经点')
  map._addingStop = true
  map.getContainer().style.cursor = 'crosshair'
  const handler = (e) => {
    addPoint(e.latlng.lat, e.latlng.lng)
    map._addingStop = false
    map.getContainer().style.cursor = ''
    map.off('click', handler)
  }
  map.on('click', handler)
}

// Clear route
function clearRoute() {
  points.splice(0, points.length,
    { id: uid(), name: '北京', lat: 39.9042, lng: 116.4074, type: 'start' },
    { id: uid(), name: '东京', lat: 35.6762, lng: 139.6503, type: 'end' }
  )
  syncSegments()
  renderRoute()
  showToast('路线已重置')
}

// Route panel select
function selectRoutePoint(i) {
  selSegment.value = i
  const p = points[i]
  if (map) map.flyTo([p.lat, p.lng], 10, { duration: 0.8 })
}

// Set segment vehicle from route panel
function setSegmentVehicle(i) {
  selSegment.value = i
  segments[i].vehicle = selVehicle.value
  showToast('路段 ' + (i+1) + ' 交通工具已更新')
}

// Shift+drag rotate
function initMapDragRotate() {
  const mapEl = document.getElementById('map')
  if (!mapEl) return
  let dragRot = false
  let lastX = 0
  mapEl.addEventListener('mousedown', (e) => {
    if (e.shiftKey) {
      dragRot = true
      lastX = e.clientX
      mapEl.style.cursor = 'grabbing'
      e.stopPropagation()
      e.preventDefault()
    }
  })
  window.addEventListener('mousemove', (e) => {
    if (!dragRot) return
    const dx = e.clientX - lastX
    lastX = e.clientX
    settings.rotation = ((settings.rotation || 0) + dx * 0.4 + 180) % 360 - 180
    updateMap3D()
  })
  window.addEventListener('mouseup', () => {
    if (dragRot) { dragRot = false; mapEl.style.cursor = '' }
  })
}

onMounted(() => {
  nextTick(() => {
    initMap()
    initMapDragRotate()
  })
})
</script>

<template>
  <div class="map-3d-wrapper">
    <div ref="mapInner" class="map-3d-inner" :class="{ tilted: settings.view3D }">
      <div id="map"></div>
      <!-- 3D Vehicle Overlay -->
      <ThreeVehicleOverlay
        :visible="use3DModel"
        :lat="vehicle3DPosition.lat"
        :lng="vehicle3DPosition.lng"
        :heading="vehicle3DHeading"
        :scale="vehicle3DScale"
        :map-instance="map"
      />
    </div>
  </div>

  <TopBar
    :isPlaying="isPlaying"
    @menu="leftOpen = !leftOpen"
    @settings="settingsOpen = true"
    @play="playAnimation"
    @stop="stopAnimation"
    @export="openExport"
  />

  <RoutePanel
    :points="points"
    :segments="segments"
    :selSegment="selSegment"
    :totalDist="totalDistStr"
    :open="leftOpen"
    @select="selectRoutePoint"
    @delete="removePoint"
    @add="addStop"
    @clear="clearRoute"
    @setSegmentVehicle="setSegmentVehicle"
  />

  <VehiclePanel
    :vehicles="vehicles"
    :selVehicle="selVehicle"
    :activeCat="activeCat"
    @select="selectVehicle"
    @changeCat="activeCat = $event"
  />

  <SettingsDrawer
    :show="settingsOpen"
    :settings="settings"
    @close="settingsOpen = false"
    @update="updateSetting"
  />

  <PreviewModal
    :show="showPreview"
    :mode="previewMode"
    :points="points"
    :segments="segments"
    :settings="settings"
    @close="showPreview = false"
    @toast="showToast"
  />

  <Toast :message="toastMsg" />
</template>

<style>
@import './assets/base.css';
</style>
