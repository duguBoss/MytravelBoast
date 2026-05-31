<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const props = defineProps({
  visible: Boolean,
  lat: Number,
  lng: Number,
  heading: { type: Number, default: 0 },
  scale: { type: Number, default: 1 },
  mapInstance: Object,
  modelUrl: { type: String, default: '/models/car.glb' }
})

const canvasContainer = ref(null)
let scene, camera, renderer, carModel, animationId
let isInitialized = false

// Convert lat/lng to pixel position relative to map container
function getPixelPosition(lat, lng) {
  if (!props.mapInstance) return { x: 0, y: 0 }
  const point = props.mapInstance.project([lng, lat])
  return { x: point.x, y: point.y }
}

function init() {
  if (isInitialized || !canvasContainer.value) return

  const container = canvasContainer.value
  const size = Math.round(120 * props.scale)
  container.style.width = size + 'px'
  container.style.height = size + 'px'

  // Scene
  scene = new THREE.Scene()

  // Camera
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(0, 2.5, 4)
  camera.lookAt(0, 0, 0)

  // Renderer with alpha
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setSize(size, size)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.display = 'block'
  container.appendChild(renderer.domElement)

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)

  const dirLight = new THREE.DirectionalLight(0xffffff, 1)
  dirLight.position.set(5, 10, 7)
  scene.add(dirLight)

  const backLight = new THREE.DirectionalLight(0xffffff, 0.3)
  backLight.position.set(-5, 5, -5)
  scene.add(backLight)

  // Ground shadow plane
  const planeGeometry = new THREE.PlaneGeometry(3, 3)
  const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.2 })
  const plane = new THREE.Mesh(planeGeometry, planeMaterial)
  plane.rotation.x = -Math.PI / 2
  plane.position.y = -0.5
  plane.receiveShadow = true
  scene.add(plane)

  // Load GLB model
  const loader = new GLTFLoader()
  loader.load(
    props.modelUrl,
    (gltf) => {
      carModel = gltf.scene

      // Auto-center and normalize scale
      const box = new THREE.Box3().setFromObject(carModel)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const targetSize = 1.2
      const scaleFactor = targetSize / maxDim

      carModel.scale.setScalar(scaleFactor)
      carModel.position.sub(center.clone().multiplyScalar(scaleFactor))
      carModel.position.y += 0.3 // Lift slightly above ground

      // Enable shadows
      carModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })

      // Apply heading rotation
      carModel.rotation.y = THREE.MathUtils.degToRad(-props.heading + 90)

      scene.add(carModel)
      updatePosition()
    },
    undefined,
    (error) => {
      console.warn('Failed to load GLB model, using fallback:', error)
      createFallbackModel()
    }
  )

  isInitialized = true
  animate()
}

function createFallbackModel() {
  const group = new THREE.Group()

  // Car body
  const bodyGeo = new THREE.BoxGeometry(1, 0.4, 2)
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, metalness: 0.3, roughness: 0.4 })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.y = 0.3
  body.castShadow = true
  group.add(body)

  // Car top
  const topGeo = new THREE.BoxGeometry(0.8, 0.3, 1.2)
  const topMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, metalness: 0.3, roughness: 0.4 })
  const top = new THREE.Mesh(topGeo, topMat)
  top.position.y = 0.65
  top.castShadow = true
  group.add(top)

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.15, 16)
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 })
  const wheelPositions = [
    [-0.55, 0.2, 0.7],
    [0.55, 0.2, 0.7],
    [-0.55, 0.2, -0.7],
    [0.55, 0.2, -0.7]
  ]
  wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(...pos)
    wheel.castShadow = true
    group.add(wheel)
  })

  carModel = group
  carModel.rotation.y = THREE.MathUtils.degToRad(-props.heading + 90)
  scene.add(carModel)
  updatePosition()
}

function animate() {
  animationId = requestAnimationFrame(animate)
  if (renderer && scene && camera) {
    // Gentle idle animation
    if (carModel) {
      carModel.position.y = 0.3 + Math.sin(Date.now() * 0.002) * 0.02
    }
    renderer.render(scene, camera)
  }
}

function updatePosition() {
  if (!canvasContainer.value || !props.mapInstance) return
  const pos = getPixelPosition(props.lat, props.lng)
  const container = canvasContainer.value
  const size = Math.round(120 * props.scale)

  container.style.left = (pos.x - size / 2) + 'px'
  container.style.top = (pos.y - size / 2) + 'px'
}

function updateRotation() {
  if (carModel) {
    // heading: 0 = north (pointing up on map), clockwise
    // Three.js Y rotation: 0 = facing +Z (which is south on map if we consider Y-up)
    // We need to map: north (0°) -> car faces -Z (up on screen)
    // So: rotation.y = -heading + 90 to align correctly
    carModel.rotation.y = THREE.MathUtils.degToRad(-props.heading + 90)
  }
}

function updateScale() {
  if (!canvasContainer.value) return
  const size = Math.round(120 * props.scale)
  canvasContainer.value.style.width = size + 'px'
  canvasContainer.value.style.height = size + 'px'

  if (renderer) {
    renderer.setSize(size, size)
  }
}

function cleanup() {
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
  if (renderer) {
    renderer.dispose()
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement)
    }
    renderer = null
  }
  scene = null
  camera = null
  carModel = null
  isInitialized = false
}

// Watch for changes
watch(() => props.lat, updatePosition)
watch(() => props.lng, updatePosition)
watch(() => props.heading, updateRotation)
watch(() => props.scale, () => {
  updateScale()
  updatePosition()
})
watch(() => props.visible, (v) => {
  if (v) {
    nextTick(() => {
      init()
      updatePosition()
    })
  }
})

// Listen to map movement
let mapMoveHandler = null
watch(() => props.mapInstance, (map) => {
  if (map) {
    if (mapMoveHandler) map.off('move', mapMoveHandler)
    mapMoveHandler = () => updatePosition()
    map.on('move', mapMoveHandler)
    if (props.visible) {
      nextTick(() => {
        init()
        updatePosition()
      })
    }
  }
})

onMounted(() => {
  if (props.visible && props.mapInstance) {
    nextTick(() => {
      init()
      updatePosition()
    })
  }
})

onUnmounted(() => {
  cleanup()
  if (props.mapInstance && mapMoveHandler) {
    props.mapInstance.off('move', mapMoveHandler)
  }
})
</script>

<template>
  <div
    v-show="visible"
    ref="canvasContainer"
    class="three-vehicle-overlay"
  ></div>
</template>

<style scoped>
.three-vehicle-overlay {
  position: absolute;
  pointer-events: none;
  z-index: 1000;
}
</style>
