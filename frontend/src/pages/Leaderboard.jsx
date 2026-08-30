import { useState, useEffect } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Medal, Star, Flame, TrendingUp } from 'lucide-react'
import clsx from 'clsx'

const RANK_STYLES = {
  1: 'bg-amber-50 border-amber-300',
  2: 'bg-gray-50 border-gray-300',
  3: 'bg-orange-50 border-orange-300',
}
const RANK_ICONS = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function Leaderboard() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/leaderboard?limit=20')
      .then(res => setUsers(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-16 text-gray-500">Loading leaderboard...</div>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leaderboard</h1>
        <p className="text-gray-600 mt-1">Top recyclers in the WasteWise community.</p>
      </div>

      {/* Top 3 podium */}
      {users.length >= 3 && (
        <div className="flex items-end justify-center gap-4 py-4">
          {/* 2nd */}
          <div className="text-center flex-1">
            <div className="text-4xl mb-1">🥈</div>
            <div className="bg-gray-100 rounded-t-lg pt-8 pb-4 px-2">
              <div className="font-bold text-sm text-gray-900 truncate">{users[1].name}</div>
              <div className="text-eco-600 font-bold">{users[1].points}</div>
              <div className="text-xs text-gray-500">pts</div>
            </div>
          </div>
          {/* 1st */}
          <div className="text-center flex-1">
            <div className="text-4xl mb-1">🥇</div>
            <div className="bg-amber-50 border-2 border-amber-300 rounded-t-lg pt-12 pb-4 px-2">
              <div className="font-bold text-sm text-gray-900 truncate">{users[0].name}</div>
              <div className="text-eco-600 font-bold text-lg">{users[0].points}</div>
              <div className="text-xs text-gray-500">pts</div>
            </div>
          </div>
          {/* 3rd */}
          <div className="text-center flex-1">
            <div className="text-4xl mb-1">🥉</div>
            <div className="bg-orange-50 rounded-t-lg pt-4 pb-4 px-2">
              <div className="font-bold text-sm text-gray-900 truncate">{users[2].name}</div>
              <div className="text-eco-600 font-bold">{users[2].points}</div>
              <div className="text-xs text-gray-500">pts</div>
            </div>
          </div>
        </div>
      )}

      {/* Full list */}
      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className={clsx(
            'flex items-center gap-3 p-3 rounded-lg border',
            RANK_STYLES[u.rank] || 'bg-white border-gray-100',
            user?.id === u.id && 'ring-2 ring-eco-500'
          )}>
            <div className="w-8 text-center font-bold text-lg">{RANK_ICONS[u.rank] || `#${u.rank}`}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 truncate">{u.name}</span>
                {user?.id === u.id && <span className="text-xs bg-eco-100 text-eco-700 px-1.5 py-0.5 rounded-full">You</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />Level {u.level}</span>
                <span className="flex items-center gap-1"><Star className="w-3 h-3" />{u.recycling_score}% score</span>
                {u.streak_days > 0 && <span className="flex items-center gap-1"><Flame className="w-3 h-3 text-orange-500" />{u.streak_days}d</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-bold text-eco-600">{u.points}</div>
              <div className="text-xs text-gray-500">pts</div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 text-center">Leaderboard shows all registered users. Includes demo accounts.</p>
    </div>
  )
}
