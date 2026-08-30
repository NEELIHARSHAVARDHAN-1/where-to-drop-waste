/**
 * CameraCapture Component
 *
 * Provides in-browser camera access using navigator.mediaDevices.getUserMedia().
 * Supports front/back camera flip, live preview, capture, retake, and confirm.
 *
 * The captured frame is converted to a Blob via canvas and passed to onCapture(blob, dataUrl).
 * The parent sends this blob to the SAME /api/classify/image endpoint as file uploads.
 *
 * Features:
 *   - environment (back) / user (front) camera flip
 *   - Graceful permission denial handling
 *   - Unsupported browser detection
 *   - All tracks stopped on close
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Camera, RefreshCw, X, RotateCcw, Check, FlipHorizontal } from 'lucide-react'
import clsx from 'clsx'

export default function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const [facingMode, setFacingMode] = useState('environment') // 'environment' | 'user'
  const [status, setStatus] = useState('idle') // 'idle' | 'requesting' | 'streaming' | 'captured' | 'error'
  const [error, setError] = useState(null)
  const [capturedDataUrl, setCapturedDataUrl] = useState(null)
  const [capturedBlob, setCapturedBlob] = useState(null)

  // ─── Stop all tracks ─────────────────────────────────────────────────────
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [])

  // ─── Start camera ─────────────────────────────────────────────────────────
  const startCamera = useCallback(async (facing) => {
    stopStream()
    setStatus('requesting')
    setError(null)
    setCapturedDataUrl(null)
    setCapturedBlob(null)

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Camera not supported in this browser. Please use a modern browser (Chrome, Firefox, Safari).')
      setStatus('error')
      return
    }

    try {
      const constraints = {
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          setStatus('streaming')
        }
      }
    } catch (err) {
      let message = 'Camera error. Please try again.'

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = 'Camera permission denied. Please allow camera access in your browser settings, or use the file upload option.'
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = 'No camera found on this device.'
      } else if (err.name === 'NotReadableError') {
        message = 'Camera is already in use by another application.'
      } else if (err.name === 'OverconstrainedError') {
        // Try without facingMode constraint as fallback
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          streamRef.current = fallbackStream
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream
            videoRef.current.onloadedmetadata = () => {
              videoRef.current.play()
              setStatus('streaming')
            }
          }
          return
        } catch (fallbackErr) {
          message = 'Could not access the requested camera. Try flipping the camera.'
        }
      }

      setError(message)
      setStatus('error')
    }
  }, [stopStream])

  // Start camera on mount
  useEffect(() => {
    startCamera(facingMode)
    return () => stopStream()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Flip camera ──────────────────────────────────────────────────────────
  const flipCamera = useCallback(() => {
    const newFacing = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(newFacing)
    startCamera(newFacing)
  }, [facingMode, startCamera])

  // ─── Capture frame ────────────────────────────────────────────────────────
  const capture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current

    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480

    const ctx = canvas.getContext('2d')

    // Mirror horizontally for front camera (selfie)
    if (facingMode === 'user') {
      ctx.scale(-1, 1)
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height)
      ctx.setTransform(1, 0, 0, 1, 0, 0) // reset transform
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setCapturedDataUrl(dataUrl)

    canvas.toBlob((blob) => {
      setCapturedBlob(blob)
    }, 'image/jpeg', 0.92)

    setStatus('captured')
    stopStream()
  }, [facingMode, stopStream])

  // ─── Retake ───────────────────────────────────────────────────────────────
  const retake = useCallback(() => {
    setCapturedDataUrl(null)
    setCapturedBlob(null)
    startCamera(facingMode)
  }, [facingMode, startCamera])

  // ─── Confirm ──────────────────────────────────────────────────────────────
  const confirm = useCallback(() => {
    if (capturedBlob && capturedDataUrl) {
      onCapture(capturedBlob, capturedDataUrl)
    }
  }, [capturedBlob, capturedDataUrl, onCapture])

  // ─── Close ────────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    stopStream()
    onClose()
  }, [stopStream, onClose])

  return (
    <div className="space-y-3">
      {/* Camera viewport */}
      <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video w-full">
        {/* Live video preview */}
        {status === 'streaming' && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={clsx(
              'w-full h-full object-cover',
              facingMode === 'user' && 'scale-x-[-1]' // mirror preview for front camera
            )}
          />
        )}

        {/* Captured frame */}
        {status === 'captured' && capturedDataUrl && (
          <img
            src={capturedDataUrl}
            alt="Captured"
            className="w-full h-full object-cover"
          />
        )}

        {/* Loading state */}
        {status === 'requesting' && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-eco-400" />
              <p className="text-sm">Requesting camera access...</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="text-center text-white">
              <X className="w-8 h-8 mx-auto mb-2 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
              {error && error.includes('permission') && (
                <p className="text-xs text-gray-400 mt-2">
                  Use the file upload option below to classify without camera.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Overlay close button */}
        <button
          onClick={handleClose}
          className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-1.5 hover:bg-opacity-75 transition-colors"
          title="Close camera"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Flip camera button (only when streaming) */}
        {status === 'streaming' && (
          <button
            onClick={flipCamera}
            className="absolute top-2 left-2 bg-black bg-opacity-50 text-white rounded-full p-1.5 hover:bg-opacity-75 transition-colors"
            title={`Switch to ${facingMode === 'environment' ? 'front' : 'back'} camera`}
          >
            <FlipHorizontal className="w-4 h-4" />
          </button>
        )}

        {/* Facing mode indicator */}
        {status === 'streaming' && (
          <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-0.5 rounded-full">
            {facingMode === 'environment' ? '📷 Back' : '🤳 Front'}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {status === 'streaming' && (
          <>
            <button
              onClick={capture}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-eco-600 hover:bg-eco-700 text-white font-semibold rounded-lg transition-colors"
            >
              <Camera className="w-4 h-4" />
              Capture
            </button>
            <button
              onClick={flipCamera}
              className="px-3 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              title="Flip camera"
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>
          </>
        )}

        {status === 'captured' && (
          <>
            <button
              onClick={confirm}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-eco-600 hover:bg-eco-700 text-white font-semibold rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              Use this photo
            </button>
            <button
              onClick={retake}
              className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 text-sm font-medium"
            >
              <RotateCcw className="w-4 h-4" />
              Retake
            </button>
          </>
        )}

        {status === 'error' && (
          <button
            onClick={handleClose}
            className="flex-1 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            Use File Upload Instead
          </button>
        )}
      </div>
    </div>
  )
}
