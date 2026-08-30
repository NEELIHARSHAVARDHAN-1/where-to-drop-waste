import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { Leaf, Eye, EyeOff } from 'lucide-react'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '', email: '', password: '',
    location_country: 'India', location_state: '', location_city: '',
    user_type: 'household',
  })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters')
    setLoading(true)
    try {
      await register(form)
      toast.success('Account created! Welcome to WasteWise 🌱')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.error || (err.response?.data?.errors?.[0]?.msg) || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="bg-eco-100 p-3 rounded-2xl">
              <Leaf className="w-8 h-8 text-eco-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Join WasteWise</h1>
          <p className="text-gray-500 mt-1">Start your recycling journey today</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input className="input" placeholder="Your name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required minLength={2} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input className="input" type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input className="input pr-10" type={showPass ? 'text' : 'password'} placeholder="Min 6 characters" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <select className="input text-sm" value={form.location_country} onChange={e => setForm(f => ({ ...f, location_country: e.target.value }))}>
                  {['India', 'USA', 'UK', 'Germany', 'Australia', 'Canada'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usage Type</label>
                <select className="input text-sm" value={form.user_type} onChange={e => setForm(f => ({ ...f, user_type: e.target.value }))}>
                  {['household', 'school', 'office', 'community'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State/Region</label>
                <input className="input text-sm" placeholder="e.g. Maharashtra" value={form.location_state} onChange={e => setForm(f => ({ ...f, location_state: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input className="input text-sm" placeholder="e.g. Mumbai" value={form.location_city} onChange={e => setForm(f => ({ ...f, location_city: e.target.value }))} />
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? 'Creating account...' : 'Create Free Account'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-600 mt-4">
            Already have an account? <NavLink to="/login" className="text-eco-600 hover:underline font-medium">Sign in →</NavLink>
          </p>
        </div>
      </div>
    </div>
  )
}
