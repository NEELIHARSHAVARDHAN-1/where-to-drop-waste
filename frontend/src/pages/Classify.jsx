import { useState, useRef } from 'react'
import { Search, Upload, Camera, CheckCircle, XCircle, AlertCircle, Leaf, RefreshCw, Edit3, Info } from 'lucide-react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import CameraCapture from '../components/CameraCapture'
import LocationSelector from '../components/LocationSelector'

const BIN_COLORS = {
  blue: 'bg-blue-100 border-blue-400 text-blue-800',
  green: 'bg-green-100 border-green-400 text-green-800',
  red: 'bg-red-100 border-red-400 text-red-800',
  yellow: 'bg-yellow-100 border-yellow-400 text-yellow-800',
  grey: 'bg-gray-100 border-gray-400 text-gray-800',
  black: 'bg-gray-800 border-gray-900 text-white',
}

const RECYCLABLE_INFO = {
  yes: { icon: CheckCircle, color: 'text-green-600', label: 'Recyclable', bg: 'bg-green-50' },
  no: { icon: XCircle, color: 'text-red-600', label: 'Not Recyclable', bg: 'bg-red-50' },
  conditional: { icon: AlertCircle, color: 'text-amber-600', label: 'Conditionally Recyclable', bg: 'bg-amber-50' },
  depends_on_location: { icon: AlertCircle, color: 'text-blue-600', label: 'Depends on Location', bg: 'bg-blue-50' },
  unknown: { icon: AlertCircle, color: 'text-gray-600', label: 'Unknown', bg: 'bg-gray-50' },
}

export default function Classify() {
  const { user } = useAuth()
  const [mode, setMode] = useState('text')
  const [input, setInput] = useState('')
  const [country, setCountry] = useState(user?.location_country || 'India')
  const [state, setState] = useState(user?.location_state || '')
  const [city, setCity] = useState(user?.location_city || '')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [imageHint, setImageHint] = useState('')
  const [confirmed, setConfirmed] = useState(null)
  const [showCamera, setShowCamera] = useState(false)
  const [correctionText, setCorrectionText] = useState('')
  const [showCorrectionForm, setShowCorrectionForm] = useState(false)
  const [correctionSubmitted, setCorrectionSubmitted] = useState(false)
  const fileRef = useRef()

  const handleTextClassify = async () => {
    if (!input.trim()) return toast.error('Please enter an item name')
    setLoading(true)
    setResult(null)
    setConfirmed(null)
    setCorrectionSubmitted(false)
    try {
      const res = await api.post('/classify/text', { item: input.trim(), country, state, city })
      setResult(res.data)
      if (res.data.points_awarded) toast.success(`+${res.data.points_awarded} points earned! 🎉`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Classification failed')
    } finally {
      setLoading(false)
    }
  }

  const handleImageClassify = async (fileOrBlob, sourceHint) => {
    const fileToSend = fileOrBlob || imageFile
    if (!fileToSend) return toast.error('Please select or capture an image')
    setLoading(true)
    setResult(null)
    setConfirmed(null)
    setCorrectionSubmitted(false)
    try {
      const formData = new FormData()
      // Camera blob needs a filename; file uploads already have one
      if (fileToSend instanceof Blob && !(fileToSend instanceof File)) {
        formData.append('image', fileToSend, 'camera_capture.jpg')
      } else {
        formData.append('image', fileToSend)
      }
      const hint = sourceHint || imageHint
      if (hint) formData.append('hint', hint)
      formData.append('country', country)
      formData.append('state', state)
      formData.append('city', city)
      const res = await api.post('/classify/image', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResult(res.data)
      if (res.data.points_awarded) toast.success(`+${res.data.points_awarded} points earned! 🎉`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Image classification failed')
    } finally {
      setLoading(false)
    }
  }

  // Called by CameraCapture when user confirms a captured frame
  const handleCameraCapture = (blob, dataUrl) => {
    setShowCamera(false)
    setImagePreview(dataUrl)
    setImageFile(blob)
    setResult(null)
    setConfirmed(null)
    // Auto-classify the captured image
    handleImageClassify(blob, '')
  }

  const handleConfirm = async (isCorrect) => {
    if (!result?.classification_id) return
    try {
      await api.post('/classify/confirm', {
        classification_id: result.classification_id,
        confirmed: isCorrect,
        correction: isCorrect ? null : input,
      })
      setConfirmed(isCorrect)
      if (isCorrect) toast.success('Thanks for confirming! +15 points 🌱')
      else toast('Correction saved. Thank you for improving our classifier!')
    } catch {
      toast.error('Failed to submit feedback')
    }
  }

  const handleSubmitCorrection = async () => {
    if (!correctionText.trim() || !result?.classification_id) return
    try {
      const res = await api.post('/classify/correct', {
        classification_id: result.classification_id,
        corrected_class: correctionText.trim(),
      })
      setCorrectionSubmitted(true)
      setShowCorrectionForm(false)
      if (res.data.gamification?.pointsEarned) {
        toast.success(`Correction saved! +${res.data.gamification.pointsEarned} points 🌱`)
      } else {
        toast.success('Correction saved. Thank you for helping improve the classifier!')
      }
    } catch {
      toast.error('Failed to submit correction')
    }
  }

  const handleImageSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be under 5MB')
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setResult(null)
    setConfirmed(null)
    setCorrectionSubmitted(false)
    setShowCamera(false)
  }

  const reset = () => {
    setResult(null)
    setInput('')
    setImageFile(null)
    setImagePreview(null)
    setImageHint('')
    setConfirmed(null)
    setShowCamera(false)
    setCorrectionText('')
    setShowCorrectionForm(false)
    setCorrectionSubmitted(false)
  }

  const recyclableInfo = result ? (RECYCLABLE_INFO[result.recyclable] || RECYCLABLE_INFO.unknown) : null
  const RecyclableIcon = recyclableInfo?.icon

  const isLowConfidence = result && (
    result.match_type === 'tf_below_threshold' ||
    result.match_type === 'model_unavailable' ||
    (result.confidence > 0 && result.confidence < 0.7 && result.classifier === 'TensorflowClassifier')
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Classify Waste</h1>
        <p className="text-gray-600 mt-1">Enter an item name, upload a photo, or use your camera to get disposal guidance.</p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {[
          { id: 'text', icon: Search, label: 'Text' },
          { id: 'image', icon: Upload, label: 'Image/Photo' },
        ].map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => { setMode(id); reset() }}
            className={clsx('flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              mode === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Location selector — uses centralized component */}
      <LocationSelector
        country={country}
        state={state}
        city={city}
        onCountryChange={setCountry}
        onStateChange={setState}
        onCityChange={setCity}
      />

      {/* Input area */}
      <div className="card">
        {mode === 'text' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Waste Item Name</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="e.g. Pizza box, Aluminium can, Old phone..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTextClassify()}
              />
              <button onClick={handleTextClassify} disabled={loading} className="btn-primary px-6">
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">Try: "plastic water bottle", "pizza box", "aluminium can", "old phone"</p>
          </div>
        ) : (
          <div>
            <input type="file" ref={fileRef} accept="image/*" onChange={handleImageSelect} className="hidden" />

            {/* Camera active */}
            {showCamera && !imagePreview && (
              <CameraCapture
                onCapture={handleCameraCapture}
                onClose={() => setShowCamera(false)}
              />
            )}

            {/* Image preview (from upload or camera) */}
            {imagePreview && !showCamera ? (
              <div className="space-y-3">
                <img src={imagePreview} alt="Preview" className="w-full max-h-48 object-contain rounded-lg border" />
                <div>
                  <label className="text-xs text-gray-600 font-medium block mb-1">
                    Item hint <span className="text-gray-400">(optional — helps when AI model is unavailable)</span>
                  </label>
                  <input
                    className="input text-sm"
                    placeholder="e.g. plastic bottle, cardboard box..."
                    value={imageHint}
                    onChange={e => setImageHint(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleImageClassify()} disabled={loading} className="btn-primary flex items-center gap-2">
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Classify Image
                  </button>
                  <button
                    onClick={() => { setImageFile(null); setImagePreview(null); setResult(null) }}
                    className="btn-secondary"
                  >
                    Change
                  </button>
                </div>
              </div>
            ) : !showCamera ? (
              /* Upload / Camera selection */
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {/* Upload option */}
                  <button
                    onClick={() => fileRef.current.click()}
                    className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-eco-400 hover:bg-eco-50 transition-colors"
                  >
                    <Upload className="w-7 h-7 text-gray-400" />
                    <span className="text-sm font-medium text-gray-600">Upload Image</span>
                    <span className="text-xs text-gray-400">JPG, PNG, WebP up to 5MB</span>
                  </button>

                  {/* Camera option */}
                  <button
                    onClick={() => setShowCamera(true)}
                    className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-eco-400 hover:bg-eco-50 transition-colors"
                  >
                    <Camera className="w-7 h-7 text-gray-400" />
                    <span className="text-sm font-medium text-gray-600">Use Camera</span>
                    <span className="text-xs text-gray-400">Live capture + flip</span>
                  </button>
                </div>
              </div>
            ) : null}

            {/* Model status note */}
            {result?.model_setup_note && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
                <strong>TensorFlow AI:</strong> {result.model_setup_note}
              </div>
            )}
            {result?.note && (
              <div className="mt-3 p-3 bg-amber-50 rounded-lg text-xs text-amber-700">
                ℹ️ {result.note}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Header result */}
          <div className={clsx('card border-l-4', isLowConfidence ? 'border-amber-400' : 'border-eco-500')}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-lg text-gray-900">{result.item_name}</h3>
                <p className="text-gray-600 text-sm">
                  Category: <span className="font-semibold text-gray-800">{result.category}</span>
                </p>
                {result.classifier && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Classified by: {result.classifier}
                  </p>
                )}
              </div>
              {result.confidence > 0 && (
                <div className="text-right">
                  <div className="text-xs text-gray-500">Confidence</div>
                  <div className={clsx('text-lg font-bold',
                    result.confidence >= 0.7 ? 'text-eco-600' :
                    result.confidence >= 0.5 ? 'text-amber-600' : 'text-red-500'
                  )}>
                    {Math.round(result.confidence * 100)}%
                  </div>
                </div>
              )}
            </div>

            {/* Low confidence / uncertain warning */}
            {result.is_uncertain && (
              <div className="mt-3 p-2.5 bg-amber-50 rounded-lg flex items-start gap-2 text-sm text-amber-800">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{result.uncertainty_reason}</span>
              </div>
            )}

            {/* TF model unavailable + no model_setup_note already shown */}
            {result.match_type === 'model_unavailable' && !result.model_setup_note && (
              <div className="mt-3 p-2.5 bg-blue-50 rounded-lg flex items-start gap-2 text-sm text-blue-800">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <span>AI classification model is currently unavailable. Place your Teachable Machine model files in <code className="bg-blue-100 px-1 rounded">backend/models/teachable_machine/</code>.</span>
              </div>
            )}
          </div>

          {/* Cannot identify — show retry + correction options */}
          {(result.match_type === 'tf_below_threshold' || result.match_type === 'model_unavailable') && !correctionSubmitted && (
            <div className="card border-amber-200 bg-amber-50">
              <h4 className="font-semibold text-amber-900 mb-2">Object not recognized with confidence</h4>
              <p className="text-sm text-amber-800 mb-3">
                You can help improve the system by providing the correct category.
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={reset}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-50 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Try Again
                </button>
                <button
                  onClick={() => setShowCorrectionForm(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-eco-600 text-white rounded-lg hover:bg-eco-700 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Provide Correct Category
                </button>
              </div>

              {showCorrectionForm && (
                <div className="mt-3 pt-3 border-t border-amber-200">
                  <label className="text-sm font-medium text-gray-700 block mb-1">What is this item?</label>
                  <input
                    className="input text-sm mb-2"
                    placeholder="e.g. plastic bottle, cardboard box, mobile phone..."
                    value={correctionText}
                    onChange={e => setCorrectionText(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSubmitCorrection}
                      disabled={!correctionText.trim()}
                      className="btn-primary text-sm py-1.5 px-4"
                    >
                      Submit Correction
                    </button>
                    <button
                      onClick={() => setShowCorrectionForm(false)}
                      className="btn-secondary text-sm py-1.5 px-4"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Your correction will be reviewed by an admin and used for future model improvement.
                  </p>
                </div>
              )}
            </div>
          )}

          {correctionSubmitted && (
            <div className="card bg-eco-50 border-eco-200 text-center">
              <p className="font-semibold text-eco-700">
                ✅ Thank you! Your correction was saved and will be reviewed for future model training.
              </p>
            </div>
          )}

          {/* Only show full result if category is known */}
          {result.category !== 'Unknown' && (
            <>
              {/* Recyclable status + Bin */}
              <div className="grid grid-cols-2 gap-4">
                <div className={clsx('card', recyclableInfo.bg)}>
                  <div className="flex items-center gap-2 mb-1">
                    <RecyclableIcon className={clsx('w-5 h-5', recyclableInfo.color)} />
                    <span className={clsx('font-semibold text-sm', recyclableInfo.color)}>{recyclableInfo.label}</span>
                  </div>
                  <p className="text-xs text-gray-600">Recyclable status for this item</p>
                </div>
                <div className={clsx('card border-2', BIN_COLORS[result.bin_color] || BIN_COLORS.grey)}>
                  <div className="font-semibold text-sm mb-1">🗑️ Recommended Bin</div>
                  <div className="font-bold">{result.local_rule?.bin_label || result.bin_label}</div>
                </div>
              </div>

              {/* Instructions */}
              <div className="card">
                <h4 className="font-semibold text-gray-900 mb-2">📋 Disposal Instructions</h4>
                <p className="text-gray-700 text-sm">{result.disposal_method}</p>
                {result.preparation_instructions && (
                  <div className="mt-3">
                    <h5 className="font-semibold text-gray-900 text-sm mb-1">🔧 Preparation Steps</h5>
                    <p className="text-gray-700 text-sm">{result.preparation_instructions}</p>
                  </div>
                )}
                {result.sustainability_info && (
                  <div className="mt-3 p-3 bg-eco-50 rounded-lg">
                    <h5 className="font-semibold text-eco-800 text-sm mb-1">🌿 Sustainability Tip</h5>
                    <p className="text-eco-700 text-sm">{result.sustainability_info}</p>
                  </div>
                )}
              </div>

              {/* Local rule */}
              {result.local_rule && (
                <div className="card bg-blue-50 border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-2">
                    📍 Local Rule: {country}{state && `, ${state}`}{city && `, ${city}`}
                  </h4>
                  <div className="space-y-1 text-sm">
                    {result.local_rule.collection_schedule && (
                      <p><span className="font-medium">Collection:</span> {result.local_rule.collection_schedule}</p>
                    )}
                    {result.local_rule.special_instructions && (
                      <p><span className="font-medium">Special Instructions:</span> {result.local_rule.special_instructions}</p>
                    )}
                    <p className="text-xs text-blue-600 mt-2">⚠️ {result.local_rule.disclaimer}</p>
                  </div>
                </div>
              )}

              {/* No local rule note */}
              {result.rule_note && !result.local_rule && (
                <div className="card bg-gray-50 border-gray-200">
                  <p className="text-sm text-gray-600">
                    ℹ️ {result.rule_note}
                  </p>
                </div>
              )}

              {/* Impact */}
              {result.impact && (
                <div className="card bg-eco-50 border-eco-200">
                  <h4 className="font-semibold text-eco-900 mb-3">🌍 Estimated Environmental Impact</h4>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-eco-700 font-bold">{result.impact.co2_saved_grams}g</div>
                      <div className="text-xs text-gray-600">CO₂ Saved</div>
                    </div>
                    <div>
                      <div className="text-blue-700 font-bold">{result.impact.water_saved_ml}mL</div>
                      <div className="text-xs text-gray-600">Water Saved</div>
                    </div>
                    <div>
                      <div className="text-amber-700 font-bold">{result.impact.energy_saved_wh}Wh</div>
                      <div className="text-xs text-gray-600">Energy Saved</div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{result.impact.disclaimer}</p>
                </div>
              )}

              {/* Circular economy tips */}
              {result.circular_economy_tips?.length > 0 && (
                <div className="card">
                  <h4 className="font-semibold text-gray-900 mb-2">🔄 Circular Economy Ideas</h4>
                  <ul className="space-y-1">
                    {result.circular_economy_tips.map((tip, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                        <Leaf className="w-3.5 h-3.5 text-eco-500 mt-0.5 shrink-0" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Confirm/correct — only for recognized items */}
              {confirmed === null && !correctionSubmitted && (
                <div className="card">
                  <h4 className="font-semibold text-gray-900 mb-3">Was this classification correct?</h4>
                  <p className="text-xs text-gray-500 mb-3">Your feedback improves our classifier and earns you points!</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleConfirm(true)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-eco-100 hover:bg-eco-200 text-eco-800 font-semibold text-sm transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" /> Yes, Correct! (+15 pts)
                    </button>
                    <button
                      onClick={() => handleConfirm(false)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-sm transition-colors"
                    >
                      <XCircle className="w-4 h-4" /> No, Incorrect (+5 pts)
                    </button>
                  </div>
                </div>
              )}

              {confirmed !== null && (
                <div className={clsx('card text-center', confirmed ? 'bg-eco-50' : 'bg-amber-50')}>
                  <p className={clsx('font-semibold', confirmed ? 'text-eco-700' : 'text-amber-700')}>
                    {confirmed
                      ? '✅ Thank you for confirming! Points added to your account.'
                      : '📝 Correction recorded. Thank you for helping improve WHERE TO DROP WASTE!'}
                  </p>
                </div>
              )}
            </>
          )}

          <button onClick={reset} className="btn-secondary w-full flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4" /> Classify Another Item
          </button>
        </div>
      )}
    </div>
  )
}
