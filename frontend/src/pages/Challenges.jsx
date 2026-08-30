import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import { Trophy, Users, Calendar, CheckCircle, Plus } from 'lucide-react'
import clsx from 'clsx'

const CHALLENGE_TYPE_COLORS = {
  community: 'bg-blue-100 text-blue-700',
  educational: 'bg-purple-100 text-purple-700',
  personal: 'bg-eco-100 text-eco-700',
}

export default function Challenges() {
  const { user } = useAuth()
  const [challenges, setChallenges] = useState([])
  const [myChallenges, setMyChallenges] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [allRes] = await Promise.all([api.get('/challenges')])
        setChallenges(allRes.data)
        if (user) {
          const myRes = await api.get('/challenges/my')
          setMyChallenges(myRes.data)
        }
      } catch (err) {
        toast.error('Failed to load challenges')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [user])

  const joinChallenge = async (id) => {
    if (!user) return toast.error('Please sign in to join challenges')
    try {
      await api.post(`/challenges/${id}/join`)
      const myRes = await api.get('/challenges/my')
      setMyChallenges(myRes.data)
      toast.success('Challenge joined! Good luck 🎯')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to join challenge')
    }
  }

  const isJoined = (id) => myChallenges.some(c => c.id === id)
  const getMyChallenge = (id) => myChallenges.find(c => c.id === id)

  if (loading) return <div className="text-center py-16 text-gray-500">Loading challenges...</div>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Community Challenges</h1>
        <p className="text-gray-600 mt-1">Join sustainability challenges and make a collective impact.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {[{ id: 'all', label: `All (${challenges.length})` }, { id: 'my', label: `My Challenges (${myChallenges.length})` }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={clsx('px-4 py-2 rounded-md text-sm font-medium transition-colors', tab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'all' && (
        <div className="space-y-4">
          {challenges.map(c => {
            const myC = getMyChallenge(c.id)
            return (
              <div key={c.id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-900">{c.title}</h3>
                      <span className={clsx('badge text-xs', CHALLENGE_TYPE_COLORS[c.challenge_type] || 'bg-gray-100 text-gray-600')}>
                        {c.challenge_type}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{c.description}</p>
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Trophy className="w-3.5 h-3.5 text-amber-500" />{c.points_reward} pts</span>
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{c.participant_count} participants</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Ends {c.end_date}</span>
                    </div>
                    <div className="mt-2 text-sm font-medium text-gray-700">
                      Target: {c.target_value} {c.target_unit}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {myC ? (
                      <div className="text-center">
                        <div className="text-xs text-gray-500 mb-1">Progress</div>
                        <div className="text-eco-600 font-bold">{myC.progress}/{c.target_value}</div>
                        {myC.completed ? (
                          <span className="flex items-center gap-1 text-xs text-eco-600 mt-1"><CheckCircle className="w-3.5 h-3.5" /> Done!</span>
                        ) : (
                          <div className="w-16 bg-gray-200 rounded-full h-1.5 mt-1">
                            <div className="bg-eco-500 h-1.5 rounded-full" style={{ width: `${Math.min((myC.progress / c.target_value) * 100, 100)}%` }} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <button onClick={() => joinChallenge(c.id)} className="btn-primary text-sm flex items-center gap-1 py-1.5">
                        <Plus className="w-3.5 h-3.5" /> Join
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'my' && (
        <div className="space-y-4">
          {myChallenges.length === 0 ? (
            <div className="card text-center py-8">
              <Trophy className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500">You haven't joined any challenges yet.</p>
              <button onClick={() => setTab('all')} className="btn-primary mt-4">Browse Challenges</button>
            </div>
          ) : myChallenges.map(c => (
            <div key={c.id} className={clsx('card', c.completed && 'border-eco-300 bg-eco-50')}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-gray-900">{c.title}</h3>
                {c.completed ? (
                  <span className="flex items-center gap-1 text-eco-600 font-semibold text-sm"><CheckCircle className="w-4 h-4" /> Completed!</span>
                ) : (
                  <span className="text-amber-600 font-semibold text-sm">{c.progress}/{c.target_value}</span>
                )}
              </div>
              {!c.completed && (
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div className="bg-eco-500 h-2 rounded-full" style={{ width: `${Math.min((c.progress / c.target_value) * 100, 100)}%` }} />
                </div>
              )}
              <p className="text-sm text-gray-600">{c.description}</p>
              <div className="flex gap-4 text-xs text-gray-500 mt-2">
                <span>Joined: {c.joined_at?.split('T')[0]}</span>
                <span>Ends: {c.end_date}</span>
                <span className="text-amber-600 font-semibold">🏆 {c.points_reward} pts</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
