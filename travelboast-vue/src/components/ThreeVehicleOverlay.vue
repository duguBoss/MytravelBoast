<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import maplibregl from 'maplibre-gl'

const props = defineProps({
  visible: Boolean,
  lat: Number,
  lng: Number,
  heading: { type: Number, default: 0 },
  scale: { type: Number, default: 1 },
  mapInstance: Object,
  modelUrl: { type: String, default: '/models/car.glb' },
  isPlaying: { type: Boolean, default: false }
})

const canvasContainer = ref(null)
let scene, camera, renderer, carModel, animationId
let isInitialized = false
let marker = null

// Advanced dynamic animation arrays and states
let rotatingParts = []
let wheels = []
let targetRoll = 0
let currentRoll = 0
let currentPitch = 0

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

  // Clear arrays
  rotatingParts = []
  wheels = []

  // Load GLB model
  const loader = new GLTFLoader()
  loader.load(
    props.modelUrl,
    (gltf) => {
      carModel = gltf.scene

      // Auto-center and normalize scale
      const box = new THREE.Box3().setFromObject(carModel)
      const center = box.getCenter(new THREE.Vector3())
      const sizeVec = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z)
      const targetSize = 1.2
      const scaleFactor = targetSize / maxDim

      carModel.scale.setScalar(scaleFactor)
      carModel.position.sub(center.clone().multiplyScalar(scaleFactor))
      carModel.position.y += 0.3 // Lift slightly above ground

      // Enable shadows and detect wheels/propellers for lively animations
      carModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true
          child.receiveShadow = true
        }

        // Search for spinable components by name
        const name = child.name.toLowerCase()
        if (name.includes('wheel') || name.includes('tire') || name.includes('rim')) {
          wheels.push(child)
        }
        if (
          name.includes('propeller') ||
          name.includes('rotor') ||
          name.includes('blade') ||
          name.includes('fan') ||
          name.includes('spin') ||
          name.includes('prop')
        ) {
          rotatingParts.push(child)
        }
      })

      // Apply initial rotation Y
      const baseHeading = THREE.MathUtils.degToRad(-props.heading + 90)
      carModel.rotation.set(0, baseHeading, 0)

      scene.add(carModel)
      updateMarker()
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

  wheels = []
  wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(...pos)
    wheel.castShadow = true
    group.add(wheel)
    wheels.push(wheel)
  })

  carModel = group
  const baseHeading = THREE.MathUtils.degToRad(-props.heading + 90)
  carModel.rotation.set(0, baseHeading, 0)
  scene.add(carModel)
  updateMarker()
}

function animate() {
  animationId = requestAnimationFrame(animate)
  if (renderer && scene && camera) {
    if (carModel) {
      // 1. Lively engine vibration and road bobbing
      if (props.isPlaying) {
        // High frequency micro-vibration when moving
        carModel.position.y = 0.3 + Math.sin(Date.now() * 0.02) * 0.035
      } else {
        // Soft breathing idle bobbing
        carModel.position.y = 0.3 + Math.sin(Date.now() * 0.003) * 0.015
      }

      // 2. Smoothly decay targetRoll back to 0
      targetRoll *= 0.95
      currentRoll += (targetRoll - currentRoll) * 0.1
      
      // Pitch forward slightly when driving, reset to flat when stationary
      const targetPitch = props.isPlaying ? 0.05 : 0
      currentPitch += (targetPitch - currentPitch) * 0.1

      // 3. Apply heading rotation + dynamic pitch & roll for immersive banking turns
      const baseHeading = THREE.MathUtils.degToRad(-props.heading + 90)
      carModel.rotation.set(0, 0, 0)
      carModel.rotateY(baseHeading)
      carModel.rotateX(currentPitch)
      carModel.rotateZ(currentRoll)
    }

    // 4. Spin propellers or rotors (very fast when playing, slow when idle)
    rotatingParts.forEach(part => {
      const speed = props.isPlaying ? 0.65 : 0.05
      // Spin around local Z or Y depending on orientation
      if (part.rotation.z !== undefined) part.rotation.z += speed
      else part.rotation.y += speed
    })

    // 5. Spin wheels to simulate rolling forward
    wheels.forEach(wheel => {
      if (props.isPlaying) {
        if (wheel.geometry && wheel.geometry.type === 'CylinderGeometry') {
          // Fallback cylinder wheels roll around local Y axis
          wheel.rotation.y += 0.28
        } else {
          // GLB model wheels roll around local X axis
          wheel.rotation.x += 0.28
        }
      }
    })

    renderer.render(scene, camera)
  }
}

function updateMarker() {
  if (!canvasContainer.value || !props.mapInstance) return
  
  if (props.visible) {
    if (!marker) {
      marker = new maplibregl.Marker({ element: canvasContainer.value, anchor: 'center' })
        .setLngLat([props.lng, props.lat])
        .addTo(props.mapInstance)
    } else {
      marker.setLngLat([props.lng, props.lat])
    }
  } else {
    if (marker) {
      marker.remove()
      marker = null
    }
  }
}

// Watch heading to calculate turn roll (banking)
watch(() => props.heading, (newVal, oldVal) => {
  if (oldVal !== undefined) {
    let diff = newVal - oldVal
    if (diff > 180) diff -= 360
    if (diff < -180) diff += 360
    
    // Tilt the vehicle into the turn (positive roll for turning, max out at ~23 degrees)
    targetRoll = THREE.MathUtils.clamp(-diff * 0.16, -0.4, 0.4)
  }
})

// Ensure WebGL dimensions match scale
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
  if (marker) {
    marker.remove()
    marker = null
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
  rotatingParts = []
  wheels = []
  isInitialized = false
}

// Watch for changes
watch(() => props.lat, updateMarker)
watch(() => props.lng, updateMarker)
watch(() => props.scale, () => {
  updateScale()
  updateMarker()
})
watch(() => props.visible, (v) => {
  if (v) {
    nextTick(() => {
      init()
      updateMarker()
    })
  } else {
    if (marker) {
      marker.remove()
      marker = null
    }
  }
})

watch(() => props.mapInstance, (map) => {
  if (map && props.visible) {
    nextTick(() => {
      init()
      updateMarker()
    })
  }
})

onMounted(() => {
  if (props.visible && props.mapInstance) {
    nextTick(() => {
      init()
      updateMarker()
    })
  }
})

onUnmounted(() => {
  cleanup()
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
