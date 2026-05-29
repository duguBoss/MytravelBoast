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
import { generateMultiSegmentPath, getVehiclePositionOnPath, calculatePathDistance } from './utils/pathGenerator.js'

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
  view3D: false, tilt: 30, rotation: 0,
  videoDuration: 15, vehicleScale: 0.65
})

// UI state
const leftOpen = ref(false)
const settingsOpen = ref(false)
const vehiclePanelOpen = ref(false)
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

// Dense path points for realistic vehicle animation
let routePathPoints = []
let routeTotalDistance = 0

// Computed
const totalDistStr = computed(() => {
  return routeTotalDistance.toFixed(0) + ' km'
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
  routePathPoints = generateMultiSegmentPath(points, 100)
  routeTotalDistance = calculatePathDistance(routePathPoints)

  segments.forEach((s, i) => {
    const d = haversine(points[i].lat, points[i].lng, points[i+1].lat, points[i+1].lng)
    s.distance = d
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
      updateDistances()
      renderRouteLine()
      renderDistLabels()
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
  const latlngs = routePathPoints.length > 0
    ? routePathPoints.map(p => [p.lat, p.lng])
    : points.map(p => [p.lat, p.lng])
  routeLine = L.polyline(latlngs, {
    color: '#ff6b4a', weight: 4, opacity: 0.85,
    lineCap: 'round', lineJoin: 'round'
  }).addTo(map)
}

function renderVehicle() {
  if (use3DModel.value) {
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
  if (routePathPoints.length >= 2) {
    const pos = getVehiclePositionOnPath(routePathPoints, t)

    if (use3DModel.value) {
      vehicle3DPosition.value = { lat: pos.lat, lng: pos.lng }
      vehicle3DHeading.value = pos.heading
    }

    if (vehicleMarker) {
      vehicleMarker.setLatLng([pos.lat, pos.lng])
      const v = segments[0]?.vehicle || segments[0]?.vehicle
      const vehicleIcon = L.divIcon({
        html: `<div style="font-size:32px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3));transform:rotate(${pos.heading - 90}deg);">${v?.icon || '✈️'}</div>`,
        className: '', iconSize: [40, 40], iconAnchor: [20, 20]
      })
      vehicleMarker.setIcon(vehicleIcon)
    }
    return
  }

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
  map.fitBounds(group.getBounds().pad(0.15))
}

function fitBounds() {
  fitRoute()
  showToast('已定位到路线')
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
  if (points.length < 2) {
    showToast('请至少设置起点和终点')
    return
  }
  if (isPlaying.value) return

  if (!vehicleMarker && !use3DModel.value) {
    renderVehicle()
  }

  isPlaying.value = true
  playProgress.value = 0

  const duration = Math.max((routeTotalDistance * 28) / (settings.speed || 2), 3000)
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

function openExport() {
  if (points.length < 2) {
    showToast('请至少设置起点和终点')
    return
  }
  previewMode.value = 'export'
  showPreview.value = true
}

function selectVehicle(v) {
  selVehicle.value = v
  if (segments[selSegment.value]) segments[selSegment.value].vehicle = v
  vehiclePanelOpen.value = false
  showToast('已选择：' + v.name)
}

function updateSetting(key, val) {
  settings[key] = val
}

function addStop() {
  showToast('点击地图添加途经点')
  leftOpen.value = false
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

function clearRoute() {
  points.splice(0, points.length,
    { id: uid(), name: '北京', lat: 39.9042, lng: 116.4074, type: 'start' },
    { id: uid(), name: '东京', lat: 35.6762, lng: 139.6503, type: 'end' }
  )
  syncSegments()
  renderRoute()
  showToast('路线已重置')
}

function selectRoutePoint(i) {
  selSegment.value = i
  const p = points[i]
  if (map) map.flyTo([p.lat, p.lng], 10, { duration: 0.8 })
}

function setSegmentVehicle(i) {
  selSegment.value = i
  segments[i].vehicle = selVehicle.value
  showToast('路段 ' + (i+1) + ' 交通工具已更新')
}

function toggleVehiclePanel() {
  vehiclePanelOpen.value = !vehiclePanelOpen.value
  if (vehiclePanelOpen.value) {
    leftOpen.value = false
    settingsOpen.value = false
  }
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
    @toggleVehicle="toggleVehiclePanel"
    @fitBounds="fitBounds"
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
    :visible="vehiclePanelOpen"
    @select="selectVehicle"
    @changeCat="activeCat = $event"
    @close="vehiclePanelOpen = false"
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
    @update:settings="newSettings => Object.assign(settings, newSettings)"
  />

  <Toast :message="toastMsg" />
</template>

<style>
@import './assets/base.css';
</style>
