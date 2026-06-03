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
  isPlaying: { type: Boolean, default: false },
  vehicleId: { type: String, default: 'car' }
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

  // Load the appropriate 3D model based on active selection
  loadModel()

  isInitialized = true
  animate()
}

  function loadModel() {
    const glbModels = ['car', 'taxi', 'police', 'ambulance', 'firetruck', 'van', 'tractor', 'truck']
    if (glbModels.includes(props.vehicleId)) {
      loadGLBModel()
    } else {
      createDynamic3DModel(props.vehicleId)
    }
  }

function loadGLBModel() {
  if (carModel) {
    scene.remove(carModel)
    carModel = null
  }
  rotatingParts = []
  wheels = []

  const loader = new GLTFLoader()
  const url = `/models/${props.vehicleId}.glb`
  loader.load(
    url,
    (gltf) => {
      carModel = gltf.scene
      carModel.position.set(0, 0, 0)
      
      // Auto-center and normalize scale
      const box = new THREE.Box3().setFromObject(carModel)
      const center = box.getCenter(new THREE.Vector3())
      const sizeVec = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z)
      const targetSize = 1.2
      const scaleFactor = targetSize / maxDim
      
      carModel.scale.set(scaleFactor, scaleFactor, scaleFactor)
      
      // Offset position to ground
      carModel.position.y = (sizeVec.y * scaleFactor) / 2
      carModel.position.x = -center.x * scaleFactor
      carModel.position.z = -center.z * scaleFactor

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
      const baseHeading = THREE.MathUtils.degToRad(180 - props.heading)
      carModel.rotation.set(0, baseHeading, 0)

      scene.add(carModel)
      updateMarker()
    },
    undefined,
    (error) => {
      console.warn('Failed to load GLB model, using fallback:', error)
      createDynamic3DModel(props.vehicleId)
    }
  )
}

function createDynamic3DModel(id) {
  if (carModel) {
    scene.remove(carModel)
    carModel = null
  }
  rotatingParts = []
  wheels = []

  const group = new THREE.Group()

  if (id === 'plane') {
    // AirPlane
    // Fuselage
    const fuseGeo = new THREE.CylinderGeometry(0.25, 0.15, 2.2, 16)
    fuseGeo.rotateX(Math.PI / 2)
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    const fuselage = new THREE.Mesh(fuseGeo, whiteMat)
    fuselage.position.y = 0.3
    fuselage.castShadow = true
    group.add(fuselage)
    
    // Wings
    const wingGeo = new THREE.BoxGeometry(2.8, 0.05, 0.5)
    const redMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, metalness: 0.2 })
    const wings = new THREE.Mesh(wingGeo, redMat)
    wings.position.set(0, 0.35, 0.2)
    wings.castShadow = true
    group.add(wings)
    
    // Tail stabilizers
    const tailVGeo = new THREE.BoxGeometry(0.05, 0.5, 0.3)
    const tailV = new THREE.Mesh(tailVGeo, redMat)
    tailV.position.set(0, 0.6, -0.9)
    tailV.castShadow = true
    group.add(tailV)
    
    const tailHGeo = new THREE.BoxGeometry(0.8, 0.03, 0.25)
    const tailH = new THREE.Mesh(tailHGeo, redMat)
    tailH.position.set(0, 0.3, -0.9)
    tailH.castShadow = true
    group.add(tailH)
    
    // Propeller rotor hub
    const hubGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.15, 12)
    hubGeo.rotateX(Math.PI / 2)
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x333333 })
    const hub = new THREE.Mesh(hubGeo, hubMat)
    hub.position.set(0, 0.3, 1.15)
    group.add(hub)
    
    // Propeller blade (which spins!)
    const bladeGeo = new THREE.BoxGeometry(0.9, 0.08, 0.02)
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, metalness: 0.5 })
    const blade = new THREE.Mesh(bladeGeo, bladeMat)
    blade.position.set(0, 0.3, 1.25)
    blade.name = 'propeller'
    group.add(blade)
    rotatingParts.push(blade)

  } else if (id === 'helicopter') {
    // Helicopter
    // Body capsule
    const bodyGeo = new THREE.SphereGeometry(0.4, 16, 16)
    bodyGeo.scale(1, 1, 1.4)
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x3498db, metalness: 0.3 })
    const body = new THREE.Mesh(bodyGeo, blueMat)
    body.position.set(0, 0.45, 0.2)
    body.castShadow = true
    group.add(body)
    
    // Tail boom
    const boomGeo = new THREE.CylinderGeometry(0.06, 0.03, 1.2, 8)
    boomGeo.rotateX(Math.PI / 2)
    const boom = new THREE.Mesh(boomGeo, new THREE.MeshStandardMaterial({ color: 0x7f8c8d }))
    boom.position.set(0, 0.45, -0.8)
    boom.castShadow = true
    group.add(boom)
    
    // Tail rotor (spins)
    const trotorGeo = new THREE.BoxGeometry(0.02, 0.3, 0.04)
    const trotor = new THREE.Mesh(trotorGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }))
    trotor.position.set(0.08, 0.5, -1.4)
    trotor.name = 'tail_rotor'
    group.add(trotor)
    rotatingParts.push(trotor)
    
    // Skids (landing gears)
    const skidGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8)
    skidGeo.rotateX(Math.PI / 2)
    const skidL = new THREE.Mesh(skidGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }))
    skidL.position.set(-0.25, 0.1, 0.2)
    group.add(skidL)
    const skidR = skidL.clone()
    skidR.position.x = 0.25
    group.add(skidR)
    
    // Main rotor shaft
    const shaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.25, 8)
    const shaft = new THREE.Mesh(shaftGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }))
    shaft.position.set(0, 0.9, 0.2)
    group.add(shaft)
    
    // Main rotor blades (spins!)
    const rotorGeo = new THREE.BoxGeometry(2.4, 0.02, 0.08)
    const rotor = new THREE.Mesh(rotorGeo, new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.6 }))
    rotor.position.set(0, 1.0, 0.2)
    rotor.name = 'main_rotor'
    group.add(rotor)
    rotatingParts.push(rotor)

  } else if (id === 'rocket') {
    // Rocket
    // Cylinder body
    const bodyGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.8, 16)
    bodyGeo.rotateX(Math.PI / 2)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.3 })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.position.y = 0.4
    body.castShadow = true
    group.add(body)
    
    // Nose cone
    const coneGeo = new THREE.ConeGeometry(0.25, 0.6, 16)
    coneGeo.rotateX(Math.PI / 2)
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, metalness: 0.2 })
    const cone = new THREE.Mesh(coneGeo, coneMat)
    cone.position.set(0, 0.4, 1.2)
    cone.castShadow = true
    group.add(cone)
    
    // Fins
    const finMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c })
    const finPositions = [
      [0.35, 0.4, -0.6, 0, 0, -Math.PI/6], // right fin
      [-0.35, 0.4, -0.6, 0, 0, Math.PI/6], // left fin
      [0, 0.75, -0.6, Math.PI/6, 0, 0] // top fin
    ]
    finPositions.forEach(pos => {
      const finGeo = new THREE.BoxGeometry(0.1, 0.4, 0.5)
      const fin = new THREE.Mesh(finGeo, finMat)
      fin.position.set(pos[0], pos[1], pos[2])
      fin.rotation.set(pos[3], pos[4], pos[5])
      fin.castShadow = true
      group.add(fin)
    })

  } else if (id === 'ufo') {
    // UFO Saucer
    const discGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.25, 20)
    discGeo.scale(1, 0.6, 1)
    const discMat = new THREE.MeshStandardMaterial({ color: 0x95a5a6, metalness: 0.8, roughness: 0.2 })
    const disc = new THREE.Mesh(discGeo, discMat)
    disc.position.y = 0.45
    disc.castShadow = true
    group.add(disc)
    
    // Cockpit dome
    const domeGeo = new THREE.SphereGeometry(0.35, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2)
    const domeMat = new THREE.MeshStandardMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.7, roughness: 0.1 })
    const dome = new THREE.Mesh(domeGeo, domeMat)
    dome.position.set(0, 0.55, 0)
    dome.castShadow = true
    group.add(dome)
    
    // Glowing core under ufo
    const coreGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16)
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x39ff14 })
    const core = new THREE.Mesh(coreGeo, coreMat)
    core.position.set(0, 0.3, 0)
    group.add(core)

  } else if (id === 'ship' || id === 'boat' || id === 'speedboat' || id === 'cruise') {
    // Boat / Ship
    // Hull
    const hullGeo = new THREE.BoxGeometry(0.6, 0.4, 1.8)
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 })
    const hull = new THREE.Mesh(hullGeo, hullMat)
    hull.position.y = 0.25
    hull.castShadow = true
    group.add(hull)
    
    // Pointy bow
    const bowGeo = new THREE.ConeGeometry(0.3, 0.5, 4)
    bowGeo.rotateX(Math.PI / 2)
    bowGeo.scale(1, 0.8, 1)
    const bow = new THREE.Mesh(bowGeo, hullMat)
    bow.position.set(0, 0.25, 1.1)
    bow.castShadow = true
    group.add(bow)
    
    if (id === 'boat') {
      // Sailboat
      // Mast
      const mastGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8)
      const mast = new THREE.Mesh(mastGeo, new THREE.MeshStandardMaterial({ color: 0x5c4033 }))
      mast.position.set(0, 1.0, 0.1)
      group.add(mast)
      
      // Sail (white triangle)
      const sailGeo = new THREE.ConeGeometry(0.4, 1.0, 4)
      sailGeo.rotateY(Math.PI / 4)
      sailGeo.scale(0.1, 1, 1)
      const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }))
      sail.position.set(0, 1.1, 0.35)
      group.add(sail)
    } else {
      // Ship / Cruise / Speedboat
      // Cabin
      const cabinGeo = new THREE.BoxGeometry(0.45, 0.35, 0.9)
      const cabin = new THREE.Mesh(cabinGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }))
      cabin.position.set(0, 0.55, -0.1)
      cabin.castShadow = true
      group.add(cabin)
      
      // Smokestack
      const funnelGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8)
      const funnel = new THREE.Mesh(funnelGeo, new THREE.MeshStandardMaterial({ color: 0xe74c3c, metalness: 0.5 }))
      funnel.position.set(0, 0.8, -0.3)
      funnel.rotation.x = -Math.PI / 8
      group.add(funnel)
    }

  } else if (id === 'train' || id === 'metro' || id === 'bullet') {
    // Train / Rail
    const bodyMat = new THREE.MeshStandardMaterial({ color: id === 'bullet' ? 0xecf0f1 : 0x2c3e50, metalness: 0.5 })
    
    // Locomotive main body
    const boilerGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.6, 16)
    boilerGeo.rotateX(Math.PI / 2)
    const boiler = new THREE.Mesh(boilerGeo, bodyMat)
    boiler.position.y = 0.4
    boiler.castShadow = true
    group.add(boiler)
    
    // Cabin
    const cabinGeo = new THREE.BoxGeometry(0.55, 0.6, 0.6)
    const cabin = new THREE.Mesh(cabinGeo, new THREE.MeshStandardMaterial({ color: 0xc0392b }))
    cabin.position.set(0, 0.55, -0.5)
    cabin.castShadow = true
    group.add(cabin)
    
    // Smokestack
    if (id === 'train') {
      const funnelGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.35, 8)
      const funnel = new THREE.Mesh(funnelGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }))
      funnel.position.set(0, 0.85, 0.5)
      group.add(funnel)
    }
    
    // Wheels (6 train wheels)
    const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.1, 16)
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 })
    const wheelY = 0.18
    const wheelPositions = [
      [-0.32, wheelY, 0.5],  [0.32, wheelY, 0.5],
      [-0.32, wheelY, 0],    [0.32, wheelY, 0],
      [-0.32, wheelY, -0.5], [0.32, wheelY, -0.5]
    ]
    
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(...pos)
      wheel.castShadow = true
      group.add(wheel)
      wheels.push(wheel)
    })

  } else if (id === 'bus' || id === 'truck') {
    // Large ground vehicles
    const cabMat = new THREE.MeshStandardMaterial({ color: id==='bus'? 0x27ae60 : 0xe67e22 })
    
    // Main body
    const bodyGeo = new THREE.BoxGeometry(0.55, 0.6, 2.0)
    const body = new THREE.Mesh(bodyGeo, cabMat)
    body.position.y = 0.45
    body.castShadow = true
    group.add(body)
    
    if (id === 'truck') {
      // Separate cab and metal cargo box
      body.scale.set(1, 1, 0.6)
      body.position.z = 0.6 // Cab at front
      
      const cargoGeo = new THREE.BoxGeometry(0.58, 0.65, 1.2)
      const cargoMat = new THREE.MeshStandardMaterial({ color: 0xbdc3c7, metalness: 0.6, roughness: 0.2 })
      const cargo = new THREE.Mesh(cargoGeo, cargoMat)
      cargo.position.set(0, 0.48, -0.3)
      cargo.castShadow = true
      group.add(cargo)
    }
    
    // Wheels (4 wheels)
    const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 16)
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
    const wheelPositions = [
      [-0.32, 0.2, 0.6],  [0.32, 0.2, 0.6],
      [-0.32, 0.2, -0.6], [0.32, 0.2, -0.6]
    ]
    
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(...pos)
      wheel.castShadow = true
      group.add(wheel)
      wheels.push(wheel)
    })

  } else if (id === 'police' || id === 'ambulance' || id === 'firetruck') {
      // Emergency Vehicles
      const isFire = id === 'firetruck'
      const isPolice = id === 'police'
      
      const bodyGeo = new THREE.BoxGeometry(0.55, 0.45, isFire ? 2.0 : 1.6)
      let color = 0xffffff // ambulance
      if (isFire) color = 0xe74c3c
      if (isPolice) color = 0x2c3e50
      
      const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.4 })
      const body = new THREE.Mesh(bodyGeo, bodyMat)
      body.position.y = 0.35
      body.castShadow = true
      group.add(body)
      
      // Siren Light
      const sirenGeo = new THREE.BoxGeometry(0.3, 0.1, 0.1)
      const sirenMat = new THREE.MeshStandardMaterial({ color: 0x3498db, emissive: 0x3498db, emissiveIntensity: 0.5 })
      const siren = new THREE.Mesh(sirenGeo, sirenMat)
      siren.position.set(0, 0.6, 0)
      group.add(siren)
      
      // Wheels
      const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.1, 16)
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 })
      const zOffset = isFire ? 0.7 : 0.5
      const wheelPositions = [
        [-0.32, 0.18, zOffset], [0.32, 0.18, zOffset],
        [-0.32, 0.18, -zOffset], [0.32, 0.18, -zOffset]
      ]
      wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat)
        wheel.position.set(...pos)
        wheel.rotation.z = Math.PI / 2
        wheel.castShadow = true
        group.add(wheel)
        wheels.push(wheel)
      })

  } else if (id === 'balloon') {
      // Hot Air Balloon
      const balloonGeo = new THREE.SphereGeometry(0.8, 16, 16)
      balloonGeo.scale(1, 1.2, 1)
      const balloonMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, metalness: 0.1, roughness: 0.8 })
      const balloon = new THREE.Mesh(balloonGeo, balloonMat)
      balloon.position.y = 1.5
      balloon.castShadow = true
      group.add(balloon)
      
      const basketGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4)
      const basketMat = new THREE.MeshStandardMaterial({ color: 0xd35400 })
      const basket = new THREE.Mesh(basketGeo, basketMat)
      basket.position.y = 0.2
      basket.castShadow = true
      group.add(basket)

  } else if (id === 'paraglider') {
      // Paraglider
      const wingGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.8, 20, 1, false, 0, Math.PI)
      wingGeo.rotateZ(Math.PI / 2)
      wingGeo.scale(1, 0.3, 1)
      const wingMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, side: THREE.DoubleSide })
      const wing = new THREE.Mesh(wingGeo, wingMat)
      wing.position.y = 1.2
      wing.castShadow = true
      group.add(wing)
      
      const personGeo = new THREE.BoxGeometry(0.2, 0.4, 0.2)
      const person = new THREE.Mesh(personGeo, new THREE.MeshStandardMaterial({ color: 0x3498db }))
      person.position.y = 0.2
      group.add(person)

  } else {
    // DEFAULT ground vehicle (Fallback car)
    // Car body
    const bodyGeo = new THREE.BoxGeometry(0.55, 0.35, 1.6)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, metalness: 0.3, roughness: 0.4 })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.position.y = 0.3
    body.castShadow = true
    group.add(body)

    // Car top cabin
    const topGeo = new THREE.BoxGeometry(0.48, 0.26, 1.0)
    const topMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, metalness: 0.3, roughness: 0.4 })
    const top = new THREE.Mesh(topGeo, topMat)
    top.position.set(0, 0.6, -0.1)
    top.castShadow = true
    group.add(top)

    // Wheels (4 wheels)
    const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.1, 16)
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 })
    const wheelPositions = [
      [-0.32, 0.18, 0.5],
      [0.32, 0.18, 0.5],
      [-0.32, 0.18, -0.5],
      [0.32, 0.18, -0.5]
    ]
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(...pos)
      wheel.castShadow = true
      group.add(wheel)
      wheels.push(wheel)
    })
  }

  carModel = group
  const baseHeading = THREE.MathUtils.degToRad(180 - props.heading)
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
      const baseHeading = THREE.MathUtils.degToRad(180 - props.heading)
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

// Watch vehicleId to dynamically switch 3D models in real-time
watch(() => props.vehicleId, () => {
  if (isInitialized) {
    loadModel()
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
