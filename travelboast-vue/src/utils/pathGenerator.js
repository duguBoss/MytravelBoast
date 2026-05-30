/**
 * Geodesic Path Generator - 使用 Vincenty 公式生成大地测量弧线路径
 */

export function generateGeodesicPath(start, end, numPoints = 100) {
  const path = []
  
  path.push({ lat: start.lat, lng: start.lng })
  
  // Vincenty 公式参数
  const lat1 = start.lat * Math.PI / 180
  const lon1 = start.lng * Math.PI / 180
  const lat2 = end.lat * Math.PI / 180
  const lon2 = end.lng * Math.PI / 180
  
  // 计算大圆距离和初始方位角
  const dLon = lon2 - lon1
  
  // 使用 Haversine 计算距离和方位角更稳定
  const sinLat1 = Math.sin(lat1), cosLat1 = Math.cos(lat1)
  const sinLat2 = Math.sin(lat2), cosLat2 = Math.cos(lat2)
  
  const y = Math.sqrt(
    Math.pow(cosLat2 * Math.sin(dLon), 2) +
    Math.pow(cosLat1 * sinLat2 - sinLat1 * cosLat2 * Math.cos(dLon), 2)
  )
  const x = sinLat1 * sinLat2 + cosLat1 * cosLat2 * Math.cos(dLon)
  const angularDist = Math.atan2(y, x) // 大圆距离（弧度）
  
  if (angularDist === 0) {
    path.push({ lat: end.lat, lng: end.lng })
    return path
  }
  
  // 初始方位角
  const bearing = Math.atan2(
    Math.sin(dLon) * cosLat2,
    cosLat1 * sinLat2 - sinLat1 * cosLat2 * Math.cos(dLon)
  )
  
  // 沿大圆路径插值点
  for (let i = 1; i < numPoints; i++) {
    const f = i / numPoints
    
    // 大圆插值公式
    const A = Math.sin((1 - f) * angularDist) / Math.sin(angularDist)
    const B = Math.sin(f * angularDist) / Math.sin(angularDist)
    
    const x = A * cosLat1 * Math.cos(lon1) + B * cosLat2 * Math.cos(lon2)
    const y = A * cosLat1 * Math.sin(lon1) + B * cosLat2 * Math.sin(lon2)
    const z = A * sinLat1 + B * sinLat2
    
    const lat = Math.atan2(z, Math.sqrt(x*x + y*y)) * 180 / Math.PI
    const lng = (Math.atan2(y, x) * 180 / Math.PI + 540) % 360 - 180 // 归一化到 [-180, 180]
    
    path.push({ lat, lng })
  }
  
  path.push({ lat: end.lat, lng: end.lng })
  return path
}

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
