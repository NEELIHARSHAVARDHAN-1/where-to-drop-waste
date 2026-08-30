import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  Home, Search, MapPin, BarChart2, Trophy, Award,
  BookOpen, User, Leaf, LogOut, Menu, X
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

const navLinks = [
  { to: '/', icon: Home, label: 'Home', end: true },
  { to: '/classify', icon: Search, label: 'Classify' },
  { to: '/rules', icon: MapPin, label: 'Rules' },
  { to: '/dashboard', icon: BarChart2, label: 'Dashboard' },
  { to: '/challenges', icon: Trophy, label: 'Challenges' },
  { to: '/leaderboard', icon: Award, label: 'Leaderboard' },
  { to: '/learn', icon: BookOpen, label: 'Learn' },
  { to: '/profile', icon: User, label: 'Profile' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <NavLink to="/" className="flex items-center gap-2 font-bold text-xl text-eco-700">
            <Leaf className="w-6 h-6" />
            <span>WHERE TO DROP WASTE</span>
          </NavLink>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => clsx(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-eco-50 text-eco-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden md:block text-sm text-gray-600">{user.name}</span>
                <span className="hidden md:flex items-center gap-1 text-xs bg-eco-100 text-eco-800 px-2 py-1 rounded-full font-semibold">
                  ⭐ {user.points || 0} pts
                </span>
                <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100" title="Logout">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="hidden md:flex gap-2">
                <NavLink to="/login" className="btn-secondary text-sm py-1.5">Sign In</NavLink>
                <NavLink to="/register" className="btn-primary text-sm py-1.5">Join Free</NavLink>
              </div>
            )}
            {/* Mobile menu toggle */}
            <button className="md:hidden p-2 text-gray-600" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1">
            {navLinks.map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => clsx(
                  'flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium',
                  isActive ? 'bg-eco-50 text-eco-700' : 'text-gray-600'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
            {!user && (
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <NavLink to="/login" onClick={() => setMobileOpen(false)} className="btn-secondary text-sm flex-1 text-center py-2">Sign In</NavLink>
                <NavLink to="/register" onClick={() => setMobileOpen(false)} className="btn-primary text-sm flex-1 text-center py-2">Join Free</NavLink>
              </div>
            )}
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <Outlet />
      </main>

      <footer className="bg-white border-t border-gray-200 py-6 text-center text-sm text-gray-500">
        <p className="flex items-center justify-center gap-1">
          <Leaf className="w-4 h-4 text-eco-500" />
          WHERE TO DROP WASTE — Making recycling simple, personalized, and impactful.
        </p>
        <p className="mt-1 text-xs text-gray-400">Environmental impact values are estimates. Verify recycling rules with your local municipality.</p>
      </footer>
    </div>
  )
}
