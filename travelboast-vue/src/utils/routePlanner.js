/**
 * Route Planning Service - Uses AMap (Gaode) Routing API
 * Returns real road routes instead of straight lines
 */

const AMAP_KEY = 'your-amap-key-here' // Replace with your AMap API key
const AMAP_API_URL = 'https://restapi.amap.com/v3/direction'

/**
 * Plan route between two points using AMap routing API
 * @param {Object} origin - { lng, lat }
 * @param {Object} destination - { lng, lat }
 * @param {String} type - 'driving' | 'walking' | 'cycling' | 'transit'
 * @returns {Promise<{ path: Array<{ lng, lat }>, distance: number, duration: number }>}
 */
export async function planRoute(origin, destination, type = 'driving') {
  const apiMap = {
    driving: 'driving',
    walking: 'walking',
    cycling: 'cycling',
    transit: 'transit/integrated'
  }

  const url = `${AMAP_API_URL}/${apiMap[type]}?origin=${origin.lng},${origin.lat}&destination=${destination.lng},${destination.lat}&key=${AMAP_KEY}`

  try {
    const response = await fetch(url)
    const data = await response.json()

    if (data.status === '1' && data.route) {
      const route = data.route[type === 'transit' ? 'transits' : type === 'driving' ? 'paths' : 'paths']?.[0]
      if (route) {
        return {
          path: parsePath(route.steps || route.segments),
          distance: route.distance ? Number(route.distance) : 0,
          duration: route.duration ? Number(route.duration) : 0
        }
      }
    }
    return null
  } catch (error) {
    console.error('Route planning failed:', error)
    return null
  }
}

/**
 * Parse route path from API response
 */
function parsePath(steps) {
  const path = []
  for (const step of steps) {
    if (step.polyline) {
      const coords = step.polyline.split(';').map(p => {
        const [lng, lat] = p.split(',').map(Number)
        return { lng, lat }
      })
      path.push(...coords)
    }
  }
  return path
}

/**
 * Plan multi-point route (with waypoints)
 */
export async function planMultiRoute(points, type = 'driving') {
  if (points.length < 2) return null

  const origin = points[0]
  const destination = points[points.length - 1]
  const waypoints = points.slice(1, -1)

  let allPaths = []
  let totalDistance = 0
  let totalDuration = 0

  // Plan route for each segment
  const segments = [origin, ...waypoints, destination]
  for (let i = 0; i < segments.length - 1; i++) {
    const result = await planRoute(segments[i], segments[i + 1], type)
    if (result) {
      allPaths = allPaths.concat(result.path)
      totalDistance += result.distance
      totalDuration += result.duration
    }
  }

  return {
    path: allPaths,
    distance: totalDistance,
    duration: totalDuration
  }
}
