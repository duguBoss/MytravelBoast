<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import TopBar from './components/TopBar.vue'
import RoutePanel from './components/RoutePanel.vue'
import VehiclePanel from './components/VehiclePanel.vue'
import SettingsDrawer from './components/SettingsDrawer.vue'
import PreviewModal from './components/PreviewModal.vue'
import Toast from './components/Toast.vue'
import ThreeVehicleOverlay from './components/ThreeVehicleOverlay.vue'

import { vehicles } from './constants/vehicles.js'
import { countryFlags, mapStyles } from './constants/map.js'
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
const distMarkers = ref([])
const pinMarkers = ref([])
let vehicleMarker = null
let animRaf = null

// Map 3D refs
const mapInner = ref(null)
const globeInnerEl = ref(null)
const globeScale = ref(1)
const globeRound = ref(0)

const globeStyle = computed(() => ({
  width: globeScale.value + '%',
  height: globeScale.value + '%',
  borderRadius: globeRound.value + '%'
}))

// 3D Vehicle state
const use3DModel = ref(true)
const vehicle3DPosition = ref({ lat: 39.9042, lng: 116.4074 })
const vehicle3DHeading = ref(0)
const vehicle3DScale = ref(1)

// Dense path points for realistic vehicle animation
let routePathPoints = []
const routeTotalDistance = ref(0)

// Computed
const totalDistStr = computed(() => {
  return routeTotalDistance.value.toFixed(0) + ' km'
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
  routeTotalDistance.value = calculatePathDistance(routePathPoints)

  segments.forEach((s, i) => {
    const d = haversine(points[i].lat, points[i].lng, points[i+1].lat, points[i+1].lng)
    s.distance = d
  })
}

function renderRoute(shouldFit = true) {
  if (!map) return
  pinMarkers.value.forEach(m => m.remove())
  pinMarkers.value = []
  distMarkers.value.forEach(m => m.remove())
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
    const el = document.createElement('div')
    el.innerHTML = html
    const m = new maplibregl.Marker({ element: el.firstElementChild, draggable: true })
      .setLngLat([p.lng, p.lat])
      .addTo(map)
    m.on('drag', () => {
      const ll = m.getLngLat()
      p.lat = ll.lat; p.lng = ll.lng
      updateDistances()
      renderRouteLine()
      distMarkers.value.forEach(dm => dm.remove())
      distMarkers.value = []
      renderDistLabels()
    })
    m.on('dragend', () => {
      const ll = m.getLngLat()
      p.lat = ll.lat; p.lng = ll.lng
      updateDistances()
      renderRoute()
    })
    pinMarkers.value.push(m)
  })

  updateDistances()
  renderRouteLine()
  if (shouldFit) {
    fitRoute()
  }
  renderDistLabels()
  renderVehicle()
}

function renderRouteLine() {
  if (routeLine) {
    if (map.getLayer('route-line-halo')) map.removeLayer('route-line-halo')
    if (map.getLayer('route-line')) map.removeLayer('route-line')
    if (map.getSource('route')) map.removeSource('route')
  }
  const coords = routePathPoints.length > 0
    ? routePathPoints.map(p => [p.lng, p.lat])
    : points.map(p => [p.lng, p.lat])
  if (coords.length < 2) return
  map.addSource('route', {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords }
    }
  })

  // Translucent glowing neon halo underlay
  map.addLayer({
    id: 'route-line-halo',
    type: 'line',
    source: 'route',
    paint: {
      'line-color': '#ff6b4a',
      'line-width': 10,
      'line-opacity': 0.35,
      'line-blur': 4
    }
  })

  // Sharp main route line on top
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#ff6b4a',
      'line-width': 4.5,
      'line-opacity': 0.85
    }
  })
  routeLine = true
}

function renderVehicle() {
  if (use3DModel.value) {
    if (vehicleMarker) {
      vehicleMarker.remove()
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

  if (vehicleMarker) vehicleMarker.remove()
  const v = segments[0]?.vehicle || vehicles[0]
  let angle = 0
  if (points.length >= 2) {
    angle = bearing(points[0].lat, points[0].lng, points[1].lat, points[1].lng) - 90
  }
  const el = document.createElement('div')
  el.innerHTML = `<div style="font-size:32px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3));transform:rotate(${angle}deg);">${v.icon}</div>`
  const latlngs = points.map(p => [p.lng, p.lat])
  vehicleMarker = new maplibregl.Marker({ element: el.firstElementChild })
    .setLngLat(latlngs[0])
    .addTo(map)
}

function updateVehiclePosition(t) {
  let lat, lng, heading
  if (routePathPoints.length >= 2) {
    const pos = getVehiclePositionOnPath(routePathPoints, t)
    lat = pos.lat
    lng = pos.lng
    heading = pos.heading

    if (use3DModel.value) {
      vehicle3DPosition.value = { lat, lng }
      vehicle3DHeading.value = heading
    }

    if (vehicleMarker) {
      vehicleMarker.setLngLat([lng, lat])
      const v = segments[0]?.vehicle || segments[0]?.vehicle
      const el = document.createElement('div')
      el.innerHTML = `<div style="font-size:32px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3));transform:rotate(${heading - 90}deg);">${v?.icon || '✈️'}</div>`
      vehicleMarker.setElement(el.firstElementChild)
    }
  } else {
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
    lat = p1.lat + (p2.lat - p1.lat) * segT
    lng = p1.lng + (p2.lng - p1.lng) * segT
    heading = bearing(p1.lat, p1.lng, p2.lat, p2.lng)

    if (use3DModel.value) {
      vehicle3DPosition.value = { lat, lng }
      vehicle3DHeading.value = heading
    }

    if (vehicleMarker) {
      vehicleMarker.setLngLat([lng, lat])
      const v = segments[segIdx]?.vehicle || segments[0]?.vehicle
      const angle = heading - 90
      const el = document.createElement('div')
      el.innerHTML = `<div style="font-size:32px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3));transform:rotate(${angle}deg);">${v?.icon || '✈️'}</div>`
      vehicleMarker.setElement(el.firstElementChild)
    }
  }

  // Smooth cinematic camera tracking: center on the moving vehicle with 3-phase follow zoom
  if (map && isPlaying.value) {
    const td = routeTotalDistance.value || 100
    // Smooth, steady cinematic tracking (matches TravelBoast standard follow behavior)
    const followZoom = Math.max(3.5, Math.min(12.5, 11.5 - Math.log2(td / 50)))

    map.jumpTo({
      center: [lng, lat],
      zoom: followZoom,
      pitch: settings.tilt || 45,
      bearing: settings.rotation || 0
    })
  }
}

function renderDistLabels() {
  if (!settings.showDistance) return
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i], p2 = points[i+1]
    const lat = (p1.lat + p2.lat) / 2, lng = (p1.lng + p2.lng) / 2
    const html = `<div class="distance-label">${segments[i].distance.toFixed(0)} km</div>`
    const el = document.createElement('div')
    el.innerHTML = html
    const m = new maplibregl.Marker({ element: el.firstElementChild })
      .setLngLat([lng, lat])
      .addTo(map)
    distMarkers.value.push(m)
  }
}

function fitRoute() {
  if (points.length < 2) return
  const lngs = points.map(p => p.lng)
  const lats = points.map(p => p.lat)
  const bounds = [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)]
  ]
  map.fitBounds(bounds, { padding: 60, duration: 800 })
}

function fitBounds() {
  fitRoute()
  showToast('已定位到路线')
}

function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        'carto-voyager': {
          type: 'raster',
          tiles: ['https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'],
          tileSize: 256,
          attribution: '&copy; 高德地图'
        },
        'arcgis-satellite': {
          type: 'raster',
          tiles: ['https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}'],
          tileSize: 256,
          attribution: '&copy; 高德地图'
        },
        'carto-dark': {
          type: 'raster',
          tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'],
          tileSize: 256,
          attribution: '&copy; OSM &copy; CARTO'
        },
        'osm-minimal': {
          type: 'raster',
          tiles: ['https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors'
        }
      },
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#f8fafc' }
        },
        {
          id: 'voyager-overlay',
          type: 'raster',
          source: 'carto-voyager',
          paint: {
            'raster-opacity': settings.mapStyle === 'voyager' ? 1.0 : 0.0
          }
        },
        {
          id: 'satellite-overlay',
          type: 'raster',
          source: 'arcgis-satellite',
          paint: {
            'raster-opacity': settings.mapStyle === 'satellite' ? 1.0 : 0.0
          }
        },
        {
          id: 'dark-overlay',
          type: 'raster',
          source: 'carto-dark',
          paint: {
            'raster-opacity': settings.mapStyle === 'dark' ? 1.0 : 0.0
          }
        },
        {
          id: 'minimal-overlay',
          type: 'raster',
          source: 'osm-minimal',
          paint: {
            'raster-opacity': settings.mapStyle === 'minimal' ? 1.0 : 0.0
          }
        }
      ],
    },
    projection: { type: 'globe' }, // Native 3D WebGL Globe Projection
    zoom: 1.5,
    center: [80, 30],
    pitch: 0,
    bearing: 0,
    attributionControl: false,
    preserveDrawingBuffer: true // 【核心: 允许 Canvas 被录制】
  })

  // Add zoom control and compass (resets direction to North-up on click)
  map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right')

  // Default clicks on the map will not add route points anymore to prevent accidental clicks.
  // Waypoints are explicitly added via the "添加途经点" button.

  map.on('zoomend', updateGlobeEffect)
  
  // Sync map rotation to UI state when user rotates manually or clicks compass
  map.on('rotate', () => {
    if (!isPlaying.value) {
      settings.rotation = map.getBearing()
    }
  })

  const onStyleLoaded = () => {
    if (typeof map.setProjection === 'function') {
      map.setProjection({ type: 'globe' })
    }

    // Add starry space backing fog environment if supported
    if (typeof map.setFog === 'function') {
      map.setFog({
        'color': 'rgb(186, 210, 247)',
        'high-color': 'rgb(24, 60, 160)',
        'space-color': 'rgb(6, 6, 17)',
        'star-intensity': 0.75
      })
    }

    renderRoute(false) // Render route pins and lines, but do not fit bounds yet

    // Dynamically jump/fly to the starting position on startup
    if (points.length > 0) {
      map.flyTo({
        center: [points[0].lng, points[0].lat],
        zoom: 5,
        duration: 1500,
        essential: true
      })
    }
  }

  // WebGL 3D Globe Style Load Listener
  if (map.isStyleLoaded()) {
    onStyleLoaded()
  } else {
    map.on('style.load', onStyleLoaded)
  }

  map.on('load', () => {
    updateGlobeEffect()
  })
}

function updateGlobeEffect() {
  if (!map) return
  const z = map.getZoom()
  const threshold = 3
  if (z <= threshold) {
    const progress = 1 - (z - 1) / (threshold - 1)
    const size = 100 - progress * 40
    const radius = progress * 50
    globeScale.value = size
    globeRound.value = radius
  } else {
    globeScale.value = 100
    globeRound.value = 0
  }
}

// 3D view - use Mapbox native pitch instead of CSS transform
function updateMap3D() {
  if (!map) return
  if (settings.view3D) {
    map.setPitch(settings.tilt || 30)
    map.setBearing(settings.rotation || 0)
  } else {
    map.setPitch(0)
    map.setBearing(0)
  }
}

watch(() => settings.view3D, updateMap3D)
watch(() => settings.tilt, updateMap3D)
watch(() => settings.rotation, updateMap3D)

// Map style: instantly and smoothly toggle overlay opacities without resetting vector layers or projection
watch(() => settings.mapStyle, (val) => {
  if (!map) return
  const overlays = ['voyager-overlay', 'satellite-overlay', 'dark-overlay', 'minimal-overlay']
  overlays.forEach(id => {
    if (map.getLayer(id)) {
      const active = id.startsWith(val)
      map.setPaintProperty(id, 'raster-opacity', active ? 1.0 : 0.0)
    }
  })
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

  isPlaying.value = true

  const startPlaying = () => {
    if (!isPlaying.value) return // Cancelled by user while waiting
    if (!vehicleMarker && !use3DModel.value) {
      renderVehicle()
    }
    playProgress.value = 0
    const duration = Math.max((routeTotalDistance.value * 28) / (settings.speed || 2), 3000)
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

  if (map && !map.areTilesLoaded()) {
    showToast('等待地图加载完成...')
    map.once('idle', () => {
      if (isPlaying.value) {
        startPlaying()
      }
    })
  } else {
    startPlaying()
  }
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
  // Keep the left route list drawer open for continuous visual feedback
  map._addingStop = true
  map.getCanvas().style.cursor = 'crosshair'
  const handler = (e) => {
    addPoint(e.lngLat.lat, e.lngLat.lng)
    map._addingStop = false
    map.getCanvas().style.cursor = ''
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

async function handleEditPoint(id, newName) {
  const p = points.find(pt => pt.id === id)
  if (!p) return
  p.name = newName
  
  showToast(`正在搜索 "${newName}" 并重新定位...`)
  
  // Try geocoding via OpenStreetMap Nominatim (free, open, no key required)
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(newName)}`)
    const data = await res.json()
    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat)
      const lng = parseFloat(data[0].lon)
      p.lat = lat
      p.lng = lng
      p.name = data[0].display_name.split(',')[0] // Use simple name like "Paris"
      showToast(`已搜索并重新定位至：${p.name}`)
      
      updateDistances()
      renderRoute()
      
      // Fly to the newly resolved location
      if (map) {
        map.flyTo({
          center: [lng, lat],
          zoom: 6,
          duration: 1000,
          essential: true
        })
      }
    } else {
      showToast(`已更新名称：${newName} (未找到精确坐标)`)
    }
  } catch (e) {
    console.warn('Geocoding error:', e)
    showToast(`已更新名称：${newName}`)
  }
}

function handleMovePoint(index, dir) {
  const newIndex = index + dir
  if (newIndex < 0 || newIndex >= points.length) return
  
  const temp = points[index]
  points[index] = points[newIndex]
  points[newIndex] = temp
  
  points.forEach((p, idx) => {
    if (idx === 0) p.type = 'start'
    else if (idx === points.length - 1) p.type = 'end'
    else p.type = 'stop'
  })

  const segIndex = index === points.length - 1 ? index - 1 : index
  const newSegIndex = newIndex === points.length - 1 ? newIndex - 1 : newIndex
  if (segments[segIndex] && segments[newSegIndex]) {
    const tempSeg = segments[segIndex].vehicle
    segments[segIndex].vehicle = segments[newSegIndex].vehicle
    segments[newSegIndex].vehicle = tempSeg
  }

  showToast('已调整路线顺序')
  updateDistances()
  renderRoute()
}

function selectRoutePoint(i) {
  selSegment.value = i
  const p = points[i]
  if (map) {
    map.flyTo({
      center: [p.lng, p.lat],
      zoom: 10,
      duration: 800,
      essential: true
    })
  }
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

// Calculate default route distances synchronously on startup
updateDistances()

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
      <div class="globe-wrap">
        <div class="globe-inner" ref="globeInnerEl" :style="globeStyle">
          <div id="map"></div>
        </div>
      </div>
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
    @editPoint="handleEditPoint"
    @movePoint="handleMovePoint"
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
    :map-instance="map"
    @close="showPreview = false"
    @toast="showToast"
    @update:settings="newSettings => Object.assign(settings, newSettings)"
  />

  <Toast :message="toastMsg" />
</template>

<style>
@import './assets/base.css';
</style>
