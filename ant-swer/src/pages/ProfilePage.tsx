import { useState, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Avatar from '../components/Avatar'
import { useToast } from '../components/ui/toast'

export default function ProfilePage() {
  const { user, updateUserProfile, changePassword } = useAuth()
  const { toast } = useToast()

  // Photo upload
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Password change
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const url = URL.createObjectURL(file)
    setPhotoPreview(url)
  }

  async function handleSavePhoto() {
    if (!photoFile) return
    setSaving(true)
    try {
      await updateUserProfile({ photoFile })
      setPhotoFile(null)
      if (photoPreview) URL.revokeObjectURL(photoPreview)
      setPhotoPreview(null)
      toast('Profile photo updated!', 'success')
    } catch {
      toast('Failed to update photo', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    if (!newPassword.trim()) return
    if (newPassword !== confirmPassword) {
      toast('Passwords do not match', 'error')
      return
    }
    if (newPassword.length < 6) {
      toast('Password must be at least 6 characters', 'error')
      return
    }
    setSavingPassword(true)
    try {
      await changePassword(newPassword)
      setNewPassword('')
      setConfirmPassword('')
      setShowPasswordForm(false)
      toast('Password changed successfully!', 'success')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/requires-recent-login') {
        toast('Please sign out and sign in again to change your password', 'error')
      } else {
        toast('Failed to change password', 'error')
      }
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Profile</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your account information</p>
        </div>

        {/* Photo section */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">Profile Photo</h2>
          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="w-20 h-20 rounded-full object-cover border-2 border-primary/20" />
              ) : (
                <Avatar name={user?.displayName} photoURL={user?.photoURL} size="lg" />
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary rounded-full flex items-center justify-center text-white shadow-md hover:bg-primary/90 transition"
                title="Change photo"
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{user?.displayName ?? 'User'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
              <p className="text-xs text-muted-foreground mt-1">Tap the pencil icon to select a new photo</p>
              {photoFile && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleSavePhoto}
                    disabled={saving}
                    className="btn-primary text-xs py-1.5"
                  >
                    {saving ? 'Saving…' : 'Save Photo'}
                  </button>
                  <button
                    onClick={() => { setPhotoFile(null); if (photoPreview) URL.revokeObjectURL(photoPreview); setPhotoPreview(null) }}
                    className="btn-ghost text-xs py-1.5"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Account info (read-only) */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">Account Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Full Name</label>
              <div className="input-wf bg-gray-50 text-foreground/70 cursor-default select-none">
                {user?.displayName ?? '—'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Email Address</label>
              <div className="input-wf bg-gray-50 text-foreground/70 cursor-default select-none">
                {user?.email ?? '—'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Region</label>
              <div className="input-wf bg-gray-50 text-foreground/70 cursor-default select-none">
                {user?.region ?? '—'}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Contact support to update your name or email.</p>
          </div>
        </div>

        {/* Password section */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Password</h2>
            {!showPasswordForm && (
              <button
                onClick={() => setShowPasswordForm(true)}
                className="text-xs text-primary font-medium hover:underline"
              >
                Change password
              </button>
            )}
          </div>

          {!showPasswordForm ? (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Password</label>
              <div className="input-wf bg-gray-50 text-foreground/70 cursor-default select-none tracking-widest">
                ••••••••
              </div>
            </div>
          ) : (
            <div className="space-y-3 animate-slide-up">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="input-wf"
                  placeholder="At least 6 characters"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="input-wf"
                  placeholder="Repeat password"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword() }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleChangePassword}
                  disabled={!newPassword || !confirmPassword || savingPassword}
                  className="btn-primary text-sm"
                >
                  {savingPassword ? 'Saving…' : 'Update Password'}
                </button>
                <button
                  onClick={() => { setShowPasswordForm(false); setNewPassword(''); setConfirmPassword('') }}
                  className="btn-ghost text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
