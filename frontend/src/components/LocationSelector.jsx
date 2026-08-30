/**
 * LocationSelector Component
 *
 * Provides dependent Country → State/UT → City selection for India.
 * Loads state/city data from the backend API (centralized india_locations.json).
 * Optionally auto-detects location via browser geolocation + reverse geocoding.
 *
 * Props:
 *   country, state, city              — current values
 *   onCountryChange(val)
 *   onStateChange(val)
 *   onCityChange(val)
 *   showGeolocation (default true)    — show "Use My Location" button
 */

import { useState, useEffect, useRef } from 'react'
import { MapPin, RefreshCw, Navigation } from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'

const SUPPORTED_COUNTRIES = ['India', 'USA', 'UK', 'Germany', 'Australia', 'Canada', 'France', 'Japan']

export default function LocationSelector({
  country,
  state,
  city,
  onCountryChange,
  onStateChange,
  onCityChange,
  showGeolocation = true,
}) {
  const [indiaStates, setIndiaStates] = useState([])
  const [indiaCities, setIndiaCities] = useState([])
  const [loadingStates, setLoadingStates] = useState(false)
  const [loadingCities, setLoadingCities] = useState(false)
  const [detectingLocation, setDetectingLocation] = useState(false)
  const abortRef = useRef(null)

  // Load India states on mount
  useEffect(() => {
    loadIndiaStates()
  }, [])

  // Load cities when India state changes
  useEffect(() => {
    if (country === 'India' && state) {
      loadIndiaCities(state)
    } else {
      setIndiaCities([])
    }
  }, [country, state])

  async function loadIndiaStates() {
    setLoadingStates(true)
    try {
      const res = await api.get('/locations/india/states')
      setIndiaStates(res.data)
    } catch {
      // Fallback to a minimal set if API is unavailable
      setIndiaStates([
        { name: 'Maharashtra', type: 'state' },
        { name: 'Karnataka', type: 'state' },
        { name: 'Delhi', type: 'union_territory' },
        { name: 'Tamil Nadu', type: 'state' },
        { name: 'Gujarat', type: 'state' },
      ])
    } finally {
      setLoadingStates(false)
    }
  }

  async function loadIndiaCities(stateName) {
    setLoadingCities(true)
    try {
      const res = await api.get(`/locations/india/cities?state=${encodeURIComponent(stateName)}`)
      setIndiaCities(res.data.cities || [])
    } catch {
      setIndiaCities([])
    } finally {
      setLoadingCities(false)
    }
  }

  // ─── Geolocation handler ──────────────────────────────────────────────────
  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.')
      return
    }

    setDetectingLocation(true)
    toast('Requesting location access...', { icon: '📍', duration: 2000 })

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        try {
          const res = await api.get(`/locations/reverse-geocode?lat=${latitude}&lon=${longitude}`)
          if (res.data.success) {
            const { country: detectedCountry, state: detectedState, city: detectedCity } = res.data

            if (detectedCountry) onCountryChange(detectedCountry)
            if (detectedState) onStateChange(detectedState)
            if (detectedCity) onCityChange(detectedCity)

            toast.success(`Location detected: ${[detectedCity, detectedState, detectedCountry].filter(Boolean).join(', ')}`)
          } else {
            toast.error(res.data.error || 'Could not detect location. Please select manually.')
          }
        } catch {
          toast.error('Location detection failed. Please select manually.')
        } finally {
          setDetectingLocation(false)
        }
      },
      (err) => {
        setDetectingLocation(false)
        if (err.code === err.PERMISSION_DENIED) {
          toast.error('Location permission denied. Please select your location manually.')
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          toast.error('Location unavailable. Please select manually.')
        } else {
          toast.error('Location detection timed out. Please select manually.')
        }
      },
      { timeout: 10000, maximumAge: 300000 }
    )
  }

  const showIndia = country === 'India'

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-eco-600" />
          Your Location
          <span className="text-xs text-gray-500 font-normal">(for personalized rules)</span>
        </h3>
        {showGeolocation && (
          <button
            onClick={handleUseMyLocation}
            disabled={detectingLocation}
            className="flex items-center gap-1.5 text-xs text-eco-700 hover:text-eco-800 font-medium bg-eco-50 hover:bg-eco-100 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50"
            title="Detect my location automatically"
          >
            {detectingLocation
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <Navigation className="w-3.5 h-3.5" />
            }
            Use My Location
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Country */}
        <div>
          <label className="text-xs text-gray-600 font-medium block mb-1">Country</label>
          <select
            className="input text-sm"
            value={country}
            onChange={e => {
              onCountryChange(e.target.value)
              onStateChange('')
              onCityChange('')
            }}
          >
            {SUPPORTED_COUNTRIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* State / UT */}
        <div>
          <label className="text-xs text-gray-600 font-medium block mb-1">
            {showIndia ? 'State / UT' : 'State/Region'}
          </label>
          <select
            className="input text-sm"
            value={state}
            disabled={loadingStates}
            onChange={e => {
              onStateChange(e.target.value)
              onCityChange('')
            }}
          >
            <option value="">Any</option>
            {showIndia
              ? indiaStates.map(s => (
                <option key={s.name} value={s.name}>
                  {s.name}{s.type === 'union_territory' ? ' (UT)' : ''}
                </option>
              ))
              : null
            }
          </select>
        </div>

        {/* City */}
        <div>
          <label className="text-xs text-gray-600 font-medium block mb-1">City</label>
          <select
            className="input text-sm"
            value={city}
            disabled={loadingCities || !state}
            onChange={e => onCityChange(e.target.value)}
          >
            <option value="">Any</option>
            {showIndia && state && indiaCities.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {detectingLocation && (
        <p className="text-xs text-eco-600 mt-2 flex items-center gap-1">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Detecting your location...
        </p>
      )}
    </div>
  )
}
