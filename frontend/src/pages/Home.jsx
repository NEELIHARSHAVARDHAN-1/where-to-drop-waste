import { NavLink } from 'react-router-dom'
import { Search, MapPin, BarChart2, Trophy, Leaf, Recycle, Zap, Users, ArrowRight } from 'lucide-react'

const features = [
  { icon: Search, title: 'Smart Classification', desc: 'Type any waste item or upload a photo. Get instant category, disposal method, and recycling tips.', color: 'bg-blue-50 text-blue-600' },
  { icon: MapPin, title: 'Local Rules Engine', desc: 'Personalized guidance based on your city and country. Know exactly which bin to use.', color: 'bg-purple-50 text-purple-600' },
  { icon: BarChart2, title: 'Impact Dashboard', desc: 'Track your CO₂ savings, water conservation, and energy savings over time.', color: 'bg-eco-50 text-eco-600' },
  { icon: Trophy, title: 'Gamification', desc: 'Earn points, unlock badges, maintain streaks, and compete on the leaderboard.', color: 'bg-amber-50 text-amber-600' },
  { icon: Users, title: 'Community Challenges', desc: 'Join sustainability challenges with your community, school, or office.', color: 'bg-rose-50 text-rose-600' },
  { icon: Zap, title: 'Eco Education', desc: 'Daily eco-facts, circular economy ideas, and DIY upcycling tips.', color: 'bg-indigo-50 text-indigo-600' },
]

const stats = [
  { value: '35+', label: 'Waste Items Covered' },
  { value: '10', label: 'Waste Categories' },
  { value: '5+', label: 'Countries Supported' },
  { value: '100%', label: 'Free to Use' },
]

export default function Home() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="text-center py-12">
        <div className="flex justify-center mb-6">
          <div className="bg-eco-100 p-4 rounded-2xl">
            <Leaf className="w-12 h-12 text-eco-600" />
          </div>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          Recycle Right. <span className="text-eco-600">Every Time.</span>
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
          WasteWise is your AI-powered guide to waste segregation — giving you personalized, location-aware recycling advice and tracking your real environmental impact.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <NavLink to="/classify" className="btn-primary flex items-center justify-center gap-2 text-base px-6 py-3">
            <Search className="w-5 h-5" />
            Classify Waste Now
            <ArrowRight className="w-4 h-4" />
          </NavLink>
          <NavLink to="/register" className="btn-secondary flex items-center justify-center gap-2 text-base px-6 py-3">
            <Recycle className="w-5 h-5" />
            Join for Free
          </NavLink>
        </div>
        <p className="mt-4 text-sm text-gray-500">No account needed to classify waste. Sign up to track your impact.</p>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="card text-center">
            <div className="text-3xl font-bold text-eco-600">{s.value}</div>
            <div className="text-sm text-gray-600 mt-1">{s.label}</div>
          </div>
        ))}
      </section>

      {/* Features */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Everything you need to recycle correctly</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, title, desc, color }) => (
            <div key={title} className="card hover:shadow-md transition-shadow">
              <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
              <p className="text-sm text-gray-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-eco-50 rounded-2xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">How WasteWise Works</h2>
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { step: '1', title: 'Select Location', desc: 'Set your country, state, and city for personalized rules' },
            { step: '2', title: 'Classify Item', desc: 'Type, upload, or photograph your waste item' },
            { step: '3', title: 'Get Guidance', desc: 'Receive disposal instructions tailored to your location' },
            { step: '4', title: 'Track Impact', desc: 'Earn points and see your environmental contribution' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="text-center">
              <div className="w-10 h-10 bg-eco-600 text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-3">{step}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
              <p className="text-sm text-gray-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Waste categories */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-6">Waste Categories</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { cat: 'Paper/Cardboard', icon: '📄', color: 'bg-blue-50 border-blue-200' },
            { cat: 'Plastic', icon: '♻️', color: 'bg-yellow-50 border-yellow-200' },
            { cat: 'Glass', icon: '🫙', color: 'bg-green-50 border-green-200' },
            { cat: 'Metal', icon: '🔩', color: 'bg-gray-50 border-gray-200' },
            { cat: 'Organic/Wet Waste', icon: '🌿', color: 'bg-eco-50 border-eco-200' },
            { cat: 'E-waste', icon: '📱', color: 'bg-purple-50 border-purple-200' },
            { cat: 'Hazardous Waste', icon: '⚠️', color: 'bg-red-50 border-red-200' },
            { cat: 'Textile', icon: '👕', color: 'bg-pink-50 border-pink-200' },
            { cat: 'Sanitary Waste', icon: '🏥', color: 'bg-orange-50 border-orange-200' },
            { cat: 'Non-recyclable', icon: '🗑️', color: 'bg-slate-50 border-slate-200' },
          ].map(({ cat, icon, color }) => (
            <div key={cat} className={`border rounded-lg p-3 text-center ${color}`}>
              <div className="text-2xl mb-1">{icon}</div>
              <div className="text-xs font-medium text-gray-700">{cat}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center bg-gradient-to-r from-eco-700 to-eco-500 text-white rounded-2xl p-10">
        <h2 className="text-2xl font-bold mb-3">Start Recycling the Right Way Today</h2>
        <p className="text-eco-100 mb-6 max-w-xl mx-auto">Every item correctly segregated reduces landfill waste, conserves resources, and contributes to a healthier planet.</p>
        <NavLink to="/classify" className="bg-white text-eco-700 hover:bg-eco-50 font-semibold px-6 py-3 rounded-lg inline-flex items-center gap-2 transition-colors">
          <Search className="w-5 h-5" />
          Try It Free — No Sign Up Required
        </NavLink>
      </section>
    </div>
  )
}
