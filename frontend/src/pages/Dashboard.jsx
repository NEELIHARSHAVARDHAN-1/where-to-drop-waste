import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { NavLink } from 'react-router-dom'
import api from '../services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Leaf, Zap, Droplets, Award, Flame, Star, TrendingUp, Lock } from 'lucide-react'

const CATEGORY_COLORS = {
  'Paper/Cardboard': '#3b82f6',
  'Plastic': '#f59e0b',
  'Glass': '#10b981',
  'Metal': '#6b7280',
  'Organic/Wet Waste': '#22c55e',
  'E-waste': '#8b5cf6',
  'Hazardous Waste': '#ef4444',
  'Textile': '#ec4899',
  'Sanitary Waste': '#f97316',
  'Unknown': '#94a3b8',
}

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    api.get('/dashboard')
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user])

  if (!user) return (
    <div className="max-w-lg mx-auto text-center py-16">
      <Lock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <h2 className="text-xl font-bold text-gray-900 mb-2">Sign in to view your Dashboard</h2>
      <p className="text-gray-500 mb-6">Track your recycling impact, points, and badges.</p>
      <div className="flex gap-3 justify-center">
        <NavLink to="/login" className="btn-secondary">Sign In</NavLink>
        <NavLink to="/register" className="btn-primary">Register Free</NavLink>
      </div>
    </div>
  )

  if (loading) return <div className="text-center py-16 text-gray-500">Loading your dashboard...</div>
  if (!data) return <div className="text-center py-8 text-gray-500">Could not load dashboard data.</div>

  const { user: userStats, impact, category_breakdown, active_challenges, weekly_activity } = data
  const levelInfo = userStats.level_info
  const nextLevel = userStats.next_level

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome back, {userStats.name}!</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-eco-600">{userStats.points} pts</div>
          <div className="text-sm text-gray-500">{levelInfo?.title || 'Waste Novice'}</div>
        </div>
      </div>

      {/* Level progress */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Level {levelInfo?.level} — {levelInfo?.title}</span>
          {nextLevel && <span className="text-xs text-gray-500">Next: Level {nextLevel.level} ({nextLevel.min} pts)</span>}
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div className="bg-eco-500 h-2.5 rounded-full transition-all" style={{ width: `${userStats.progress_to_next || 0}%` }} />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{userStats.points} pts</span>
          {nextLevel && <span>{nextLevel.min} pts</span>}
        </div>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <Star className="w-6 h-6 text-amber-500 mx-auto mb-1" />
          <div className="text-2xl font-bold text-gray-900">{userStats.points}</div>
          <div className="text-xs text-gray-500">Total Points</div>
        </div>
        <div className="card text-center">
          <TrendingUp className="w-6 h-6 text-eco-500 mx-auto mb-1" />
          <div className="text-2xl font-bold text-gray-900">{userStats.recycling_score || 0}%</div>
          <div className="text-xs text-gray-500">Recycling Score</div>
        </div>
        <div className="card text-center">
          <Flame className="w-6 h-6 text-orange-500 mx-auto mb-1" />
          <div className="text-2xl font-bold text-gray-900">{userStats.streak_days || 0}</div>
          <div className="text-xs text-gray-500">Day Streak</div>
        </div>
        <div className="card text-center">
          <Award className="w-6 h-6 text-purple-500 mx-auto mb-1" />
          <div className="text-2xl font-bold text-gray-900">{userStats.badges?.length || 0}</div>
          <div className="text-xs text-gray-500">Badges</div>
        </div>
      </div>

      {/* Environmental Impact */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">🌍 Your Environmental Impact</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="card bg-eco-50 border-eco-200 text-center">
            <Leaf className="w-6 h-6 text-eco-600 mx-auto mb-1" />
            <div className="text-xl font-bold text-eco-700">{impact.co2_kg} kg</div>
            <div className="text-xs text-gray-600">CO₂ Saved</div>
          </div>
          <div className="card bg-blue-50 border-blue-200 text-center">
            <Droplets className="w-6 h-6 text-blue-600 mx-auto mb-1" />
            <div className="text-xl font-bold text-blue-700">{impact.water_liters} L</div>
            <div className="text-xs text-gray-600">Water Saved</div>
          </div>
          <div className="card bg-amber-50 border-amber-200 text-center">
            <Zap className="w-6 h-6 text-amber-600 mx-auto mb-1" />
            <div className="text-xl font-bold text-amber-700">{impact.energy_kwh} kWh</div>
            <div className="text-xs text-gray-600">Energy Saved</div>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">{data.disclaimer}</p>
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Category pie */}
        {category_breakdown.length > 0 && (
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">Items by Category</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={category_breakdown.map(c => ({ name: c.category, value: c.count }))} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name.split('/')[0]} (${value})`}>
                  {category_breakdown.map((c, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[c.category] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Weekly activity */}
        {weekly_activity.length > 0 && (
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">Weekly Activity</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekly_activity}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tickFormatter={d => d.slice(5)} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} name="Items" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Badges */}
      {userStats.badges?.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">🏅 Your Badges</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {userStats.badges.map(b => (
              <div key={b.id} className="card text-center py-4 bg-amber-50 border-amber-200">
                <div className="text-3xl mb-1">{b.icon}</div>
                <div className="font-semibold text-sm text-gray-900">{b.name}</div>
                <div className="text-xs text-gray-500 mt-1">{b.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active challenges */}
      {active_challenges.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">🎯 Active Challenges</h2>
          <div className="space-y-3">
            {active_challenges.map(c => (
              <div key={c.challenge_id} className="card">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{c.title}</h3>
                  <span className="text-sm text-eco-600 font-semibold">{c.progress}/{c.target_value} {c.target_unit}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-eco-500 h-2 rounded-full" style={{ width: `${Math.min((c.progress / c.target_value) * 100, 100)}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1">Ends: {c.end_date}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
