import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/ui/toast'
import antIcon from '../assets/ant-icon.jpg'

export default function RegisterPage() {
  const { register, loginWithGoogle } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      toast('Password must be at least 6 characters', 'error')
      return
    }
    setLoading(true)
    try {
      await register(name, email, password)
      navigate('/select-region')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed'
      toast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setLoading(true)
    try {
      await loginWithGoogle()
      navigate('/dashboard')
    } catch {
      toast('Google sign-up failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel ─────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-10 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #6b0f1a 0%, #1a0305 50%, #0d0d0d 100%)',
        }}
      >
        {/* Subtle radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 20% 50%, rgba(244,0,78,0.15) 0%, transparent 60%)',
          }}
        />

        {/* Logo */}
        <div className="relative flex items-center gap-2.5">
          <img src={antIcon} alt="Ant-Swer" className="w-8 h-8 rounded-xl object-cover flex-shrink-0" />
          <div>
            <span className="text-white font-bold text-base leading-none">Ant-Swer</span>
            <p className="text-white/50 text-[10px] leading-none mt-0.5">Global Community</p>
          </div>
        </div>

        {/* Headline */}
        <div className="relative">
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Start Your Journey<br />with Us Today.
          </h1>
          <p className="text-white/60 text-sm leading-relaxed max-w-xs">
            Create your free account and join thousands of merchants growing their business
            across borders with WorldFirst.
          </p>
        </div>

        {/* Feature bullets */}
        <div className="relative space-y-3">
          {[
            { icon: '🌍', text: 'Connect with merchants in your region' },
            { icon: '💡', text: 'Get answers from our AI assistant' },
            { icon: '🚀', text: 'Access exclusive campaigns & promotions' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs flex-shrink-0">
                {icon}
              </div>
              <span className="text-white/70 text-sm">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">

          {/* Mobile-only logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-base">A</span>
            </div>
            <span className="text-xl font-bold text-foreground">Ant-Swer</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">Create your account</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Already have an account?{' '}
            <Link to="/login" className="text-primary font-semibold hover:underline">
              Sign in
            </Link>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Full name
              </label>
              <input
                type="text"
                className="input-wf"
                placeholder="Your full name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Email address
              </label>
              <input
                type="email"
                className="input-wf"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Password
              </label>
              <input
                type="password"
                className="input-wf"
                placeholder="At least 6 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition disabled:opacity-60"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-muted-foreground">or continue with</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-foreground hover:bg-gray-50 transition disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>

          <p className="text-center text-xs text-muted-foreground mt-6">
            By signing up, you agree to Ant-Swer's{' '}
            <span className="text-primary hover:underline cursor-pointer">Terms of Service</span>
            {' '}and{' '}
            <span className="text-primary hover:underline cursor-pointer">Privacy Policy</span>
          </p>
        </div>
      </div>
    </div>
  )
}
