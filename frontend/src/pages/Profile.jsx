import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { NavLink, useNavigate } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'
import { User, MapPin, Star, Award, Flame, Edit3, Check, X, LogOut, Lock } from 'lucide-react'

export default function Profile() {
  const { user, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [badges, setBadges] = useState([])
  const [recentActivity, setRecentActivity] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    setForm({ name: user.name, location_country: user.location_country || 'India', location_state: user.location_state || '', location_city: user.location_city || '', user_type: user.user_type || 'household' })
    api.get('/gamification/badges').then(res => setBadges(res.data)).catch(() => {})
    api.get('/classify/history?limit=5').then(res => setRecentActivity(res.data.items)).catch(() => {})
  }, [user])

  if (!user) return (
    <div className="max-w-lg mx-auto text-center py-16">
      <Lock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <h2 className="text-xl font-bold text-gray-900 mb-2">Sign in to view your profile</h2>
      <div className="flex gap-3 justify-center mt-6">
        <NavLink to="/login" className="btn-secondary">Sign In</NavLink>
        <NavLink to="/register" className="btn-primary">Register Free</NavLink>
      </div>
    </div>
  )

  const saveProfile = async () => {
    setLoading(true)
    try {
      const res = await api.patch('/auth/profile', form)
      updateUser(res.data)
      setEditing(false)
      toast.success('Profile updated!')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/')
    toast.success('Logged out successfully')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <div className="flex gap-2">
          <button onClick={() => setEditing(!editing)} className="btn-secondary text-sm flex items-center gap-1.5">
            <Edit3 className="w-3.5 h-3.5" /> {editing ? 'Cancel' : 'Edit'}
          </button>
          <button onClick={handleLogout} className="btn-secondary text-sm flex items-center gap-1.5 text-red-600 hover:text-red-700">
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </div>

      {/* Profile card */}
      <div className="card">
        <div className="flex items-start gap-4">
          <div className="bg-eco-100 rounded-full w-16 h-16 flex items-center justify-center text-2xl font-bold text-eco-700">
            {user.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1">
            {editing ? (
              <input className="input text-xl font-bold mb-1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            ) : (
              <h2 className="text-xl font-bold text-gray-900">{user.name}</h2>
            )}
            <p className="text-gray-500">{user.email}</p>
            <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
              <span className="flex items-center gap-1"><Star className="w-4 h-4 text-amber-500" />{user.points || 0} points</span>
              <span className="flex items-center gap-1"><Flame className="w-4 h-4 text-orange-500" />{user.streak_days || 0} day streak</span>
              <span className="flex items-center gap-1"><Award className="w-4 h-4 text-purple-500" />{badges.length} badges</span>
            </div>
          </div>
        </div>
      </div>

      {/* Location & Settings */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><MapPin className="w-4 h-4 text-eco-600" /> Location & Settings</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'location_country', label: 'Country', options: ['India', 'USA', 'UK', 'Germany', 'Australia'] },
            { key: 'location_state', label: 'State/Region', text: true },
            { key: 'location_city', label: 'City', text: true },
            { key: 'user_type', label: 'Usage Type', options: ['household', 'school', 'office', 'community'] },
          ].map(({ key, label, options, text }) => (
            <div key={key}>
              <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
              {editing ? (
                options ? (
                  <select className="input text-sm" value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}>
                    {options.map(o => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input className="input text-sm" value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                )
              ) : (
                <div className="text-sm text-gray-900 py-2.5 px-4 bg-gray-50 rounded-lg">{user[key] || '—'}</div>
              )}
            </div>
          ))}
        </div>
        {editing && (
          <div className="flex gap-2 mt-4">
            <button onClick={saveProfile} disabled={loading} className="btn-primary flex items-center gap-2"><Check className="w-4 h-4" /> Save Changes</button>
            <button onClick={() => setEditing(false)} className="btn-secondary flex items-center gap-2"><X className="w-4 h-4" /> Cancel</button>
          </div>
        )}
      </div>

      {/* Badges */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">🏅 My Badges ({badges.length})</h3>
        {badges.length === 0 ? (
          <p className="text-sm text-gray-500">No badges yet. Start classifying waste to earn your first badge!</p>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            {badges.map(b => (
              <div key={b.id} className="text-center p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div className="text-3xl mb-1">{b.icon}</div>
                <div className="font-semibold text-xs text-gray-900">{b.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">📋 Recent Activity</h3>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-gray-500">No classifications yet. <NavLink to="/classify" className="text-eco-600 underline">Classify your first item!</NavLink></p>
        ) : (
          <div className="space-y-2">
            {recentActivity.map(a => (
              <div key={a.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-50">
                <div>
                  <span className="font-medium text-gray-900">{a.input_text || 'Image upload'}</span>
                  <span className="text-gray-500 ml-2">→ {a.category}</span>
                </div>
                <div className="text-xs text-gray-400">{new Date(a.timestamp).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Account stats */}
      <div className="card bg-eco-50 border-eco-200">
        <h3 className="font-semibold text-eco-900 mb-2">Account Summary</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div><div className="text-xl font-bold text-eco-700">{user.points || 0}</div><div className="text-xs text-gray-600">Points</div></div>
          <div><div className="text-xl font-bold text-eco-700">{user.recycling_score || 0}%</div><div className="text-xs text-gray-600">Score</div></div>
          <div><div className="text-xl font-bold text-eco-700">Level {user.level || 1}</div><div className="text-xs text-gray-600">Rank</div></div>
        </div>
        <p className="text-xs text-gray-500 mt-2">Member since {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'today'}</p>
      </div>
    </div>
  )
}
