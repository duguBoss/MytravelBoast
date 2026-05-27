/**
 * Video Recorder Utility - High-performance video recording for TravelBoast
 *
 * Features:
 * - Canvas-based frame capture at configurable FPS (default 30)
 * - WebM VP9/VP8 encoding with quality presets
 * - FFmpeg.wasm WebM to MP4 conversion
 * - Progress callbacks for UI feedback
 * - Cancellation support
 * - Multiple save strategies (File System API, auto-download, blob URL)
 * - Frame buffering for smooth recording
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

// Quality presets for different use cases
export const QualityPresets = {
  draft:   { fps: 15, width: 360,  height: 640,  bitrate: 1_000_000,  label: '草稿 (快)' },
  standard:{ fps: 30, width: 720,  height: 1280, bitrate: 4_000_000,  label: '标准 (推荐)' },
  high:    { fps: 30, width: 1080, height: 1920, bitrate: 8_000_000,  label: '高清' },
  ultra:   { fps: 60, width: 1080, height: 1920, bitrate: 16_000_000, label: '超清' }
}

// Get best supported MIME type
function getBestMimeType() {
  const candidates = [
    'video/webm; codecs=vp9',
    'video/webm; codecs=vp8',
    'video/webm'
  ]
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return 'video/webm'
}

// Get preset based on ratio
export function getPresetForRatio(ratio, quality = 'standard') {
  const preset = QualityPresets[quality] || QualityPresets.standard
  const r = ratio || 'vertical'

  if (r === 'horizontal') {
    return { ...preset, width: preset.height, height: preset.width }
  }
  if (r === 'square') {
    const size = Math.min(preset.width, preset.height)
    return { ...preset, width: size, height: size }
  }
  return preset
}

// FFmpeg singleton
let ffmpegInstance = null
let ffmpegLoading = false
let ffmpegLoadPromise = null

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance
  if (ffmpegLoadPromise) return ffmpegLoadPromise

  ffmpegLoading = true
  ffmpegLoadPromise = (async () => {
    const ffmpeg = new FFmpeg()
    await ffmpeg.load()
    ffmpegInstance = ffmpeg
    ffmpegLoading = false
    return ffmpeg
  })()

  return ffmpegLoadPromise
}

/**
 * Convert WebM blob to MP4 using FFmpeg.wasm
 * @param {Blob} webmBlob
 * @param {Function} onProgress - (progress: 0-100) => void
 * @returns {Promise<Blob>}
 */
export async function convertWebMToMP4(webmBlob, onProgress = () => {}) {
  const ffmpeg = await getFFmpeg()

  // Write input file
  const inputName = 'input.webm'
  const outputName = 'output.mp4'
  await ffmpeg.writeFile(inputName, await fetchFile(webmBlob))

  // Progress callback
  ffmpeg.on('progress', ({ progress }) => {
    onProgress(Math.min(Math.round(progress * 100), 100))
  })

  // Convert: webm -> mp4 (H.264)
  await ffmpeg.exec([
    '-i', inputName,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-movflags', '+faststart',
    '-pix_fmt', 'yuv420p',
    '-an',
    '-y',
    outputName
  ])

  // Read output
  const data = await ffmpeg.readFile(outputName)
  const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' })

  // Cleanup
  await ffmpeg.deleteFile(inputName)
  await ffmpeg.deleteFile(outputName)

  return mp4Blob
}

/**
 * Create a video recorder instance
 * @param {HTMLCanvasElement} canvas - Source canvas
 * @param {Object} options
 * @param {number} options.fps - Target framerate
 * @param {number} options.bitrate - Video bitrate in bits/sec
 * @param {string} options.mimeType - Override MIME type
 * @returns {Object} Recorder API
 */
export function createRecorder(canvas, options = {}) {
  const fps = options.fps || 30
  const bitrate = options.bitrate || 4_000_000
  const mimeType = options.mimeType || getBestMimeType()

  const stream = canvas.captureStream(fps)

  // Try to get video track and apply constraints
  const videoTrack = stream.getVideoTracks()[0]
  if (videoTrack) {
    try {
      videoTrack.applyConstraints({ frameRate: fps })
    } catch (_) { /* ignore */ }
  }

  const mediaRecorderOptions = {
    mimeType,
    videoBitsPerSecond: bitrate
  }

  const mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions)
  const chunks = []
  let isRecording = false
  let startTime = 0

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }

  return {
    start() {
      if (isRecording) return
      chunks.length = 0
      isRecording = true
      startTime = performance.now()
      // Use 100ms timeslice for incremental data availability
      mediaRecorder.start(100)
    },

    stop() {
      return new Promise((resolve, reject) => {
        if (!isRecording) {
          reject(new Error('Not recording'))
          return
        }

        const onStop = () => {
          const duration = performance.now() - startTime
          const blob = new Blob(chunks, { type: mimeType.split(';')[0] })
          isRecording = false
          resolve({ blob, duration, mimeType, size: blob.size })
        }

        const onError = (e) => {
          isRecording = false
          reject(new Error('MediaRecorder error: ' + (e.message || 'Unknown')))
        }

        mediaRecorder.onstop = onStop
        mediaRecorder.onerror = onError
        mediaRecorder.stop()

        // Stop all tracks to release resources
        stream.getTracks().forEach(t => t.stop())
      })
    },

    get isRecording() { return isRecording }
  }
}

/**
 * High-level record function with progress callback and cancellation
 * @param {HTMLCanvasElement} canvas - Source canvas
 * @param {Function} drawFrame - (ctx, width, height, t) => void, called each frame
 * @param {Object} options
 * @param {number} options.duration - Total duration in ms
 * @param {number} options.fps - Target framerate
 * @param {number} options.bitrate - Video bitrate
 * @param {Function} options.onProgress - (progress: 0-100, frameInfo) => void
 * @param {AbortSignal} options.signal - For cancellation
 * @returns {Promise<{blob, duration, size}>}
 */
export async function recordVideo(canvas, drawFrame, options = {}) {
  const fps = options.fps || 30
  const duration = options.duration || 5000
  const bitrate = options.bitrate || 4_000_000
  const onProgress = options.onProgress || (() => {})
  const signal = options.signal

  if (signal?.aborted) {
    throw new Error('Recording cancelled')
  }

  const ctx = canvas.getContext('2d', { alpha: false })
  const w = canvas.width
  const h = canvas.height

  // Setup recorder
  const recorder = createRecorder(canvas, { fps, bitrate })

  // Pre-render a few frames to warm up
  ctx.fillStyle = '#e8ecf1'
  ctx.fillRect(0, 0, w, h)

  // Small delay to let canvas settle
  await new Promise(r => setTimeout(r, 50))

  recorder.start()

  const totalFrames = Math.max(Math.ceil(duration / 1000 * fps), 1)
  const frameInterval = 1000 / fps
  const startTime = performance.now()

  // Frame buffer for smooth delivery
  let frameCount = 0

  for (let i = 0; i <= totalFrames; i++) {
    if (signal?.aborted) {
      recorder.stop().catch(() => {})
      throw new Error('Recording cancelled')
    }

    const t = Math.min(i / totalFrames, 1)
    const elapsed = performance.now() - startTime
    const targetTime = i * frameInterval

    // Draw the frame
    drawFrame(ctx, w, h, t)

    frameCount++
    const progress = t * 100
    onProgress(progress, { frame: i, totalFrames, elapsed, targetTime })

    // Wait for next frame timing
    if (i < totalFrames) {
      const waitTime = targetTime + frameInterval - (performance.now() - startTime)
      if (waitTime > 0) {
        await new Promise(r => setTimeout(r, waitTime))
      }
    }
  }

  // Small delay before stopping to ensure last frame is captured
  await new Promise(r => setTimeout(r, 100))

  const result = await recorder.stop()
  return {
    blob: result.blob,
    duration: result.duration,
    size: result.size,
    mimeType: result.mimeType,
    frameCount,
    fps,
    width: w,
    height: h
  }
}

/**
 * Save video file with best available method
 * @param {Blob} blob - Video blob
 * @param {Object} options
 * @param {string} options.suggestedName - Default filename
 * @param {string} options.format - 'webm' | 'mp4'
 * @returns {Promise<{success, name, method, fallback?}>}
 */
export async function saveVideoFile(blob, options = {}) {
  const format = options.format || 'webm'
  const ext = format === 'mp4' ? '.mp4' : '.webm'
  const mimeType = format === 'mp4' ? 'video/mp4' : 'video/webm'
  const suggestedName = (options.suggestedName || 'travelboast_video').replace(/\.webm$/, '').replace(/\.mp4$/, '') + ext

  // Try File System Access API first (modern browsers)
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{
          description: format === 'mp4' ? 'MP4 视频' : 'WebM 视频',
          accept: { [mimeType]: [ext] }
        }]
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return { success: true, name: handle.name, method: 'file-system-api' }
    } catch (err) {
      if (err.name === 'AbortError') {
        return { success: false, aborted: true }
      }
      // Fall through to fallback
    }
  }

  // Fallback: auto-download
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = suggestedName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Delay revoking to ensure download starts
    setTimeout(() => URL.revokeObjectURL(url), 30000)
    return { success: true, fallback: true, name: suggestedName, method: 'download' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Create a blob URL for preview
 * @param {Blob} blob
 * @returns {string} Object URL
 */
export function createPreviewUrl(blob) {
  return URL.createObjectURL(blob)
}

/**
 * Revoke a preview URL
 * @param {string} url
 */
export function revokePreviewUrl(url) {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

/**
 * Estimate file size before recording
 * @param {number} durationMs - Duration in milliseconds
 * @param {number} bitrate - Bits per second
 * @returns {number} Estimated size in bytes
 */
export function estimateFileSize(durationMs, bitrate) {
  return (durationMs / 1000) * (bitrate / 8)
}

/**
 * Format bytes to human readable
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

/**
 * Generate a filename based on route info
 * @param {Object} options
 * @param {string} options.ratio - 'vertical' | 'horizontal' | 'square'
 * @param {string} options.quality - quality preset key
 * @param {Array} options.points - route points for naming
 * @param {string} options.format - 'webm' | 'mp4'
 * @returns {string}
 */
export function generateFilename(options = {}) {
  const { ratio = 'vertical', quality = 'standard', points = [], format = 'mp4' } = options
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const time = new Date().toISOString().slice(11, 19).replace(/:/g, '')
  const ratioLabel = ratio === 'horizontal' ? '16x9' : ratio === 'square' ? '1x1' : '9x16'
  const startName = points[0]?.name || 'A'
  const endName = points[points.length - 1]?.name || 'B'
  const ext = format === 'mp4' ? '.mp4' : '.webm'
  return `TravelBoast_${startName}to${endName}_${ratioLabel}_${date}_${time}${ext}`
}
