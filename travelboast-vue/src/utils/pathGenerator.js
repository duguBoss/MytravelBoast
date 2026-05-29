/**
 * Geodesic Path Generator
 * Generates dense path points along the route between two coordinates.
 * Creates a realistic travel path instead of straight lines.
 */

/**
 * Generate geodesic path between two points
 * @param {Object} start - { lat, lng }
 * @param {Object} end - { lat, lng }
 * @param {number} numPoints - Number of intermediate points (default: 100)
 * @returns {Array<{ lat, lng }>} Path points including start and end
 */
export function generateGeodesicPath(start, end, numPoints = 100) {
  const path = []
  
  // Add start point
  path.push({ lat: start.lat, lng: start.lng })
  
  // Generate intermediate points
  for (let i = 1; i < numPoints; i++) {
    const t = i / numPoints
    const lat = start.lat + (end.lat - start.lat) * t
    const lng = start.lng + (end.lng - start.lng) * t
    
    // Add slight curve to simulate road following
    const curveOffset = Math.sin(t * Math.PI) * 0.02 * (Math.random() - 0.5)
    
    path.push({
      lat: lat + curveOffset,
      lng: lng + curveOffset
    })
  }
  
  // Add end point
  path.push({ lat: end.lat, lng: end.lng })
  
  return path
}

/**
 * Generate multi-segment path with waypoints
 * @param {Array} points - Array of { lat, lng, name } objects
 * @param {number} pointsPerSegment - Points per segment (default: 80)
 * @returns {Array<{ lat, lng }>} Full path
 */
export function generateMultiSegmentPath(points, pointsPerSegment = 80) {
  if (points.length < 2) return points
  
  const fullPath = []
  
  for (let i = 0; i < points.length - 1; i++) {
    const segment = generateGeodesicPath(
      points[i],
      points[i + 1],
      pointsPerSegment
    )
    
    if (i === 0) {
      fullPath.push(...segment)
    } else {
      // Skip first point of subsequent segments to avoid duplicates
      fullPath.push(...segment.slice(1))
    }
  }
  
  return fullPath
}

/**
 * Calculate distance along path using haversine
 * @param {Array} path - Array of { lat, lng }
 * @returns {number} Total distance in km
 */
export function calculatePathDistance(path) {
  let totalDistance = 0
  
  for (let i = 0; i < path.length - 1; i++) {
    totalDistance += haversine(
      path[i].lat,
      path[i].lng,
      path[i + 1].lat,
      path[i + 1].lng
    )
  }
  
  return totalDistance
}

/**
 * Haversine formula to calculate distance between two points
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} Distance in km
 */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371 // Earth's radius in km
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg) {
  return deg * (Math.PI / 180)
}

/**
 * Get vehicle position along path at progress t (0-1)
 * @param {Array} path - Array of { lat, lng }
 * @param {number} t - Progress from 0 to 1
 * @returns {{ lat, lng, heading }}
 */
export function getVehiclePositionOnPath(path, t) {
  if (!path || path.length < 2) return { lat: 0, lng: 0, heading: 0 }
  
  // Clamp t to [0, 1]
  t = Math.max(0, Math.min(1, t))
  
  // Calculate total distance
  const distances = []
  let totalDist = 0
  
  for (let i = 0; i < path.length - 1; i++) {
    const dist = haversine(
      path[i].lat,
      path[i].lng,
      path[i + 1].lat,
      path[i + 1].lng
    )
    distances.push(dist)
    totalDist += dist
  }
  
  // Find target distance
  const targetDist = totalDist * t
  
  // Find segment
  let accDist = 0
  let segIdx = 0
  let segT = 0
  
  for (let i = 0; i < distances.length; i++) {
    if (accDist + distances[i] >= targetDist) {
      segIdx = i
      segT = distances[i] > 0 ? (targetDist - accDist) / distances[i] : 0
      break
    }
    accDist += distances[i]
  }
  
  if (segIdx >= distances.length) {
    segIdx = distances.length - 1
    segT = 1
  }
  
  // Interpolate position
  const p1 = path[segIdx]
  const p2 = path[segIdx + 1]
  const lat = p1.lat + (p2.lat - p1.lat) * segT
  const lng = p1.lng + (p2.lng - p1.lng) * segT
  
  // Calculate heading
  const heading = calculateHeading(p1, p2)
  
  return { lat, lng, heading }
}

/**
 * Calculate heading between two points in degrees
 * @param {Object} p1 - { lat, lng }
 * @param {Object} p2 - { lat, lng }
 * @returns {number} Heading in degrees (0 = North, clockwise)
 */
function calculateHeading(p1, p2) {
  const dLng = toRad(p2.lng - p1.lng)
  const lat1 = toRad(p1.lat)
  const lat2 = toRad(p2.lat)
  
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  
  let heading = Math.atan2(y, x) * (180 / Math.PI)
  heading = (heading + 360) % 360
  
  return heading
}
