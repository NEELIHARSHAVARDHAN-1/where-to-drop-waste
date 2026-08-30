import { useState, useEffect } from 'react'
import api from '../services/api'
import { Leaf, Zap, Recycle, BookOpen, Lightbulb, Wrench, RefreshCw } from 'lucide-react'
import clsx from 'clsx'

const TIP_TYPE_ICONS = {
  daily: Leaf,
  eco_fact: Lightbulb,
  diy: Wrench,
  general: Recycle,
}

const CATEGORY_COLORS = {
  reduce: 'bg-blue-50 border-blue-200',
  reuse: 'bg-purple-50 border-purple-200',
  recycle: 'bg-eco-50 border-eco-200',
  compost: 'bg-orange-50 border-orange-200',
  fact: 'bg-amber-50 border-amber-200',
  upcycle: 'bg-pink-50 border-pink-200',
  ewaste: 'bg-yellow-50 border-yellow-200',
  general: 'bg-gray-50 border-gray-200',
}

const WASTE_CATEGORIES = [
  { id: 'Paper/Cardboard', icon: '📄', desc: 'Newspapers, cardboard boxes, magazines — keep dry and clean.' },
  { id: 'Plastic', icon: '♻️', desc: 'Bottles, containers — check resin code. Rinse before recycling.' },
  { id: 'Glass', icon: '🫙', desc: 'Bottles, jars — recyclable infinitely. Remove lids.' },
  { id: 'Metal', icon: '🔩', desc: 'Cans, foil, scrap — high recycling value, especially aluminium.' },
  { id: 'Organic/Wet Waste', icon: '🌿', desc: 'Food scraps, garden waste — ideal for composting.' },
  { id: 'E-waste', icon: '📱', desc: 'Electronics — take to certified e-waste centers only.' },
  { id: 'Hazardous Waste', icon: '⚠️', desc: 'Batteries, paint, chemicals — special handling required.' },
  { id: 'Textile', icon: '👕', desc: 'Clothing, shoes — donate or textile recycling.' },
  { id: 'Sanitary Waste', icon: '🏥', desc: 'Wrap securely. Never flush sanitary items.' },
  { id: 'Non-recyclable', icon: '🗑️', desc: 'General waste — minimize by choosing recyclable alternatives.' },
]

export default function Learn() {
  const [tips, setTips] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  const loadTips = async () => {
    setLoading(true)
    try {
      const params = filter !== 'all' ? `?type=${filter}&count=10` : '?count=15'
      const res = await api.get(`/tips${params}`)
      setTips(res.data)
    } catch (err) {
      setTips([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTips() }, [filter])

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Learn & Eco-tips</h1>
        <p className="text-gray-600 mt-1">Eco-facts, recycling guides, and circular economy ideas.</p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', label: 'All Tips' },
          { id: 'eco_fact', label: '💡 Eco Facts' },
          { id: 'daily', label: '🌱 Daily Tips' },
          { id: 'diy', label: '🔧 DIY Ideas' },
        ].map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)} className={clsx('px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
            filter === t.id ? 'bg-eco-600 text-white border-eco-600' : 'border-gray-200 text-gray-600 hover:border-eco-400 hover:text-eco-700'
          )}>
            {t.label}
          </button>
        ))}
        <button onClick={loadTips} className="px-3 py-1.5 rounded-full text-sm font-medium border border-gray-200 text-gray-600 hover:border-eco-400 flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading tips...</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {tips.map(tip => {
            const Icon = TIP_TYPE_ICONS[tip.tip_type] || Leaf
            const colorClass = CATEGORY_COLORS[tip.category] || CATEGORY_COLORS.general
            return (
              <div key={tip.id} className={clsx('card border', colorClass)}>
                <div className="flex items-start gap-3">
                  <div className="bg-white p-1.5 rounded-lg shadow-sm shrink-0">
                    <Icon className="w-4 h-4 text-eco-600" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 block mb-1">{tip.category} · {tip.tip_type}</span>
                    <h3 className="font-semibold text-gray-900 mb-1">{tip.title}</h3>
                    <p className="text-sm text-gray-700">{tip.content}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Waste Categories Guide */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">📚 Complete Waste Categories Guide</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {WASTE_CATEGORIES.map(cat => (
            <div key={cat.id} className="card flex items-start gap-3">
              <span className="text-2xl shrink-0">{cat.icon}</span>
              <div>
                <div className="font-semibold text-gray-900">{cat.id}</div>
                <p className="text-sm text-gray-600">{cat.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* The 5 R's */}
      <div className="bg-eco-50 rounded-xl p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">🔄 The 5 R's of Sustainable Living</h2>
        <div className="grid md:grid-cols-5 gap-4">
          {[
            { r: 'Refuse', icon: '🚫', desc: 'Say no to things you don\'t need, especially single-use items.' },
            { r: 'Reduce', icon: '📉', desc: 'Minimize what you buy and use. Less consumption = less waste.' },
            { r: 'Reuse', icon: '🔁', desc: 'Repair, borrow, or use multiple times before discarding.' },
            { r: 'Recycle', icon: '♻️', desc: 'Properly sort and recycle materials that can be processed.' },
            { r: 'Rot', icon: '🌱', desc: 'Compost organic materials to return nutrients to soil.' },
          ].map(({ r, icon, desc }) => (
            <div key={r} className="text-center">
              <div className="text-3xl mb-1">{icon}</div>
              <div className="font-bold text-eco-800">{r}</div>
              <p className="text-xs text-gray-600 mt-1">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Circular economy */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">🔄 Circular Economy Ideas</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { title: 'Plastic Bottle Planter', icon: '🌿', desc: 'Cut a plastic bottle in half, fill with soil, and grow herbs. Great for balconies.' },
            { title: 'Jar Storage System', icon: '🫙', desc: 'Old glass jars make perfect storage for spices, grains, or small items.' },
            { title: 'T-shirt Tote Bag', icon: '👜', desc: 'Cut the sleeves and neckline of an old T-shirt to create a no-sew tote bag.' },
            { title: 'Cardboard Organizer', icon: '📦', desc: 'Cut and fold cardboard boxes to create desk drawer organizers.' },
            { title: 'Newspaper Seed Pots', icon: '🌱', desc: 'Roll newspaper into small pots for starting seedlings. Plant directly in soil — it decomposes!' },
            { title: 'Tin Can Pencil Holder', icon: '✏️', desc: 'Clean tin cans make excellent desk organizers when wrapped in paper or twine.' },
          ].map(({ title, icon, desc }) => (
            <div key={title} className="card">
              <div className="text-2xl mb-2">{icon}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
              <p className="text-sm text-gray-600">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
