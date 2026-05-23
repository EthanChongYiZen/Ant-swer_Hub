import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { REGION_FLAGS } from '../lib/utils'
import Avatar from '../components/Avatar'
import { cn } from '../lib/utils'
import antIcon from '../assets/ant-icon.jpg'

// ── Icons ────────────────────────────────────────────────────────────────────

function ChatIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  )
}
function MegaphoneIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  )
}
function ForumIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
    </svg>
  )
}
function SupportIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}
function BotIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.638-1.363 2.322l-1.364-.341M5 14.5l-1.402 1.402c-1 1-.03 2.638 1.363 2.322l1.364-.341m11.474 0l-7.474 1.868-7.474-1.868" />
    </svg>
  )
}
function ChartIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}
function UserIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}
function MenuIcon() {
  return (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
function XIcon() {
  return (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

// ── Nav item ─────────────────────────────────────────────────────────────────

interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
  end?: boolean
  onClick?: () => void
}

function NavItem({ to, icon, label, end, onClick }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-gray-700 hover:bg-gray-100'
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}

// ── Sidebar content ───────────────────────────────────────────────────────────

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin' || user?.role === 'manager'

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-200">
        <img src={antIcon} alt="Ant-Swer" className="w-8 h-8 rounded-xl object-cover flex-shrink-0" />
        <div>
          <span className="text-lg font-bold text-gray-800">Ant-Swer</span>
          {isAdmin && <span className="text-xs text-muted-foreground ml-1">Admin Console</span>}
        </div>
        {onClose && (
          <button onClick={onClose} className="ml-auto text-gray-500 hover:text-gray-800 p-1">
            <XIcon />
          </button>
        )}
      </div>

      {/* Region / Role badge */}
      <div className="px-4 py-3">
        {isAdmin ? (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/30 text-xs font-medium text-primary bg-primary/5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
            {user?.role === 'manager' ? 'Manager' : 'Admin'}
          </div>
        ) : user?.region ? (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-600">
            <span>{REGION_FLAGS[user.region] ?? '🌍'}</span>
            {user.region}
          </div>
        ) : null}
      </div>

      {/* Nav — unified, no section separators */}
      <nav className="flex-1 px-3 pb-2 overflow-y-auto space-y-0.5">
        <NavItem to="/dashboard/chat" icon={<ChatIcon />} label="Chat" onClick={onClose} />
        <NavItem to="/dashboard/announcements" icon={<MegaphoneIcon />} label="Announcements" onClick={onClose} />
        <NavItem to="/dashboard/forum" icon={<ForumIcon />} label="Discussion Forum" onClick={onClose} />
        <NavItem to="/dashboard/support" icon={<SupportIcon />} label="Support Chat" onClick={onClose} />
        <NavItem to="/dashboard/ai-assistant" icon={<BotIcon />} label="AI Assistant" onClick={onClose} />

        {/* Admin section */}
        {isAdmin && (
          <>
            <div className="h-px bg-gray-200 my-2" />
            <NavItem to="/dashboard/admin" end icon={<ChartIcon />} label="Admin Panel" onClick={onClose} />
          </>
        )}
      </nav>

      {/* Bottom: profile link + static logout */}
      <div className="border-t border-gray-200 px-3 py-3">
        {/* Profile bar — clicking navigates to profile page */}
        <Link
          to="/dashboard/profile"
          onClick={onClose}
          className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-gray-100 transition w-full"
        >
          <Avatar name={user?.displayName} photoURL={user?.photoURL} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{user?.displayName ?? 'User'}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-400 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        {/* Static sign out button */}
        <button
          onClick={handleLogout}
          className="mt-1 w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-[#f7f7f8] border-r border-gray-200 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-[#f7f7f8] border-r border-gray-200 z-50 animate-slide-up">
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <MenuIcon />
          </button>
          <div className="flex items-center gap-2">
            <img src={antIcon} alt="Ant-Swer" className="w-7 h-7 rounded-lg object-cover" />
            <span className="font-bold text-gray-800">Ant-Swer</span>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-hidden" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
