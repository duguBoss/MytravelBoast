export function getCanvasPoints(points, width, height, padding = 48) {
  const lats = points.map(p => p.lat)
  const lngs = points.map(p => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)

  const latRange = maxLat - minLat || 0.001
  const lngRange = maxLng - minLng || 0.001

  // 让路线在 canvas 上占满固定比例，不严格保持地理比例，
  // 避免长距离东西向/南北向路线缩成一条细线。
  const targetW = width * 0.75
  const targetH = height * 0.60

  const scaleX = targetW / lngRange
  const scaleY = targetH / latRange

  const drawW = lngRange * scaleX
  const drawH = latRange * scaleY
  const offsetX = (width - drawW) / 2
  const offsetY = (height - drawH) / 2

  return points.map(p => ({
    x: offsetX + (p.lng - minLng) * scaleX,
    y: height - (offsetY + (p.lat - minLat) * scaleY)
  }))
}

export function getVehicleState(canvasPoints, segments, t) {
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

  const p1 = canvasPoints[segIdx]
  const p2 = canvasPoints[segIdx + 1]

  return {
    x: p1.x + (p2.x - p1.x) * segT,
    y: p1.y + (p2.y - p1.y) * segT,
    segIdx,
    angle: Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI
  }
}

export function drawBackground(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, '#e8ecf1')
  grad.addColorStop(0.5, '#cdd5e0')
  grad.addColorStop(1, '#b8c4d4')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

export function drawRoute(ctx, pts) {
  if (pts.length < 2) return

  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y)
  }

  // 发光效果
  ctx.shadowColor = 'rgba(255, 107, 74, 0.35)'
  ctx.shadowBlur = 10
  ctx.strokeStyle = '#ff6b4a'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([10, 8])
  ctx.stroke()
  ctx.setLineDash([])
  ctx.shadowBlur = 0
}

export function drawPin(ctx, x, y, color, label) {
  // 外圈白边
  ctx.beginPath()
  ctx.arc(x, y, 10, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()

  // 内圈颜色
  ctx.beginPath()
  ctx.arc(x, y, 7, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()

  // 描边
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'
  ctx.lineWidth = 1
  ctx.stroke()

  if (label) {
    ctx.font = '600 14px "Space Grotesk", -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#1a1d2b'
    ctx.fillText(label, x, y - 18)
  }
}

export function drawVehicle(ctx, x, y, icon, angle, use3D) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((angle * Math.PI) / 180)
  if (use3D) {
    ctx.scale(1, 0.72)
  }

  // 先画一个白色圆形背景兜底，保证即使 emoji 渲染异常也有可见标记
  ctx.beginPath()
  ctx.arc(0, 0, 22, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,107,74,0.3)'
  ctx.lineWidth = 2
  ctx.stroke()

  // 画 emoji，使用最通用的字体回退
  ctx.font = '48px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(icon, 0, 2) // +2px 视觉居中补偿
  ctx.restore()
}

export function drawFrame(ctx, w, h, pts, segments, settings, t, bgImage) {
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, w, h)
    // 叠一层半透明白色让路线更清晰
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(0, 0, w, h)
  } else {
    drawBackground(ctx, w, h)
  }

  drawRoute(ctx, pts)

  drawPin(ctx, pts[0].x, pts[0].y, '#34c759', settings.showLabels ? '起点' : '')
  const last = pts[pts.length - 1]
  drawPin(ctx, last.x, last.y, '#ff6b4a', settings.showLabels ? '终点' : '')

  if (t >= 0 && t <= 1 && pts.length >= 2) {
    const state = getVehicleState(pts, segments, t)
    const v = segments[state.segIdx]?.vehicle || segments[0]?.vehicle
    drawVehicle(ctx, state.x, state.y, v?.icon || '✈️', state.angle, settings.use3D)
  }
}
