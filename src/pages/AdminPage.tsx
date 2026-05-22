import React, { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, doc, updateDoc, deleteDoc, getDocs, Timestamp, increment,
} from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/ui/toast'
import { formatMessageTime, formatRelativeTime, ALL_REGIONS, truncate, REGION_FLAGS } from '../lib/utils'
import Avatar from '../components/Avatar'
import { useSearchParams } from 'react-router-dom'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Announcement {
  id: string
  title: string
  content: string
  category: 'promotion' | 'news' | 'maintenance' | 'campaign'
  pinned: boolean
  badge?: string
  imageUrl?: string
  region: string
  linkLabel?: string
  linkUrl?: string
  createdAt: Timestamp | null
}

interface SupportThread {
  id: string
  userId: string
  userName: string
  status: 'open' | 'resolved'
  lastMessage: string
  updatedAt: Timestamp | null
}

interface SupportMessage {
  id: string
  senderId: string
  senderName: string
  text: string
  timestamp: Timestamp | null
  replyTo: { id: string; senderName: string; text: string } | null
}

interface ChatMessage {
  id: string
  userId: string
  userName: string
  userPhotoURL: string | null
  text: string
  timestamp: Timestamp | null
  replyTo: { id: string; userName: string; text: string } | null
}

interface ForumPost {
  id: string
  title: string
  body: string
  type: 'post' | 'poll' | 'event'
  imageUrl: string | null
  authorId: string
  authorName: string
  authorPhotoURL: string | null
  authorRegion: string | null
  regions: string[]
  replyCount: number
  // Poll fields
  pollOptions?: { label: string; votes: number; voterIds?: string[] }[]
  // Event fields
  eventRewardLabel?: string
  eventMaxWinners?: number
  eventWinners?: string[]
  createdAt: Timestamp | null
}

interface UserRecord {
  uid: string
  displayName: string | null
  email: string | null
}

const CATEGORY_STYLES: Record<string, string> = {
  promotion: 'bg-yellow-100 text-yellow-700',
  news: 'bg-blue-100 text-blue-700',
  maintenance: 'bg-red-100 text-red-700',
  campaign: 'bg-green-100 text-green-700',
}

const CATEGORY_EMOJIS: Record<string, string> = {
  promotion: '💰',
  news: '📰',
  maintenance: '🔧',
  campaign: '🎯',
}

// ─── Region Multi-Select Component ────────────────────────────────────────────

function RegionMultiSelect({
  selected,
  onChange,
  label = 'Visible to',
}: {
  selected: string[]
  onChange: (regions: string[]) => void
  label?: string
}) {
  const allSelected = selected.includes('all')

  function toggle(r: string) {
    if (r === 'all') {
      onChange(allSelected ? [] : ['all'])
      return
    }
    // If currently "all" is selected, switch to just this one region
    if (allSelected) {
      onChange([r])
      return
    }
    const without = selected.filter(x => x !== r)
    if (selected.includes(r)) {
      onChange(without.length === 0 ? ['all'] : without)
    } else {
      onChange([...selected, r])
    }
  }

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      <div className="border border-border rounded-xl p-3 max-h-48 overflow-y-auto space-y-1 bg-white">
        <label className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded-lg hover:bg-gray-50 select-none">
          <input type="checkbox" checked={allSelected} onChange={() => toggle('all')} className="accent-primary w-3.5 h-3.5" />
          <span className="text-sm font-medium">🌍 All Regions</span>
        </label>
        <div className="h-px bg-border my-1" />
        {ALL_REGIONS.map(r => (
          <label key={r} className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded-lg hover:bg-gray-50 select-none">
            <input
              type="checkbox"
              checked={allSelected || selected.includes(r)}
              onChange={() => toggle(r)}
              className="accent-primary w-3.5 h-3.5"
            />
            <span className="text-sm">{REGION_FLAGS[r] ?? ''} {r}</span>
          </label>
        ))}
      </div>
      {selected.length === 0 && <p className="text-xs text-muted-foreground mt-1">Default: all regions</p>}
      {!allSelected && selected.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1">{selected.length} region{selected.length > 1 ? 's' : ''} selected</p>
      )}
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const [stats, setStats] = useState({ users: 0, announcements: 0, open: 0, resolved: 0 })

  useEffect(() => {
    async function load() {
      const [users, announcements, chats] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'announcements')),
        getDocs(collection(db, 'supportChats')),
      ])
      const open = chats.docs.filter(d => d.data().status === 'open').length
      setStats({ users: users.size, announcements: announcements.size, open, resolved: chats.size - open })
    }
    load()
  }, [])

  const cards = [
    { label: 'Total Users', value: stats.users, icon: '👥', color: 'bg-blue-50 text-blue-600' },
    { label: 'Announcements', value: stats.announcements, icon: '📢', color: 'bg-yellow-50 text-yellow-600' },
    { label: 'Open Support Chats', value: stats.open, icon: '💬', color: 'bg-green-50 text-green-600' },
    { label: 'Resolved Chats', value: stats.resolved, icon: '✅', color: 'bg-purple-50 text-purple-600' },
  ]

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground mb-4">Platform Overview</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="card p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3 ${c.color}`}>{c.icon}</div>
            <p className="text-2xl font-bold text-foreground">{c.value}</p>
            <p className="text-sm text-teal-600 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Announcements Tab ────────────────────────────────────────────────────────

function AnnouncementsTab() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<'promotion' | 'news' | 'maintenance' | 'campaign'>('news')
  const [badge, setBadge] = useState('')
  const [pinned, setPinned] = useState(false)
  const [regions, setRegions] = useState<string[]>(['all'])
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)))
    })
  }, [])

  async function handleCreate() {
    if (!title.trim() || !content.trim() || !user) return
    setSaving(true)
    const finalRegions = regions.length === 0 ? ['all'] : regions
    // For backward compat with old single-region field, store primary region
    const region = finalRegions.includes('all') ? 'all' : finalRegions[0]
    try {
      const docRef = await addDoc(collection(db, 'announcements'), {
        title: title.trim(),
        content: content.trim(),
        category,
        badge: badge.trim() || null,
        pinned,
        region,
        regions: finalRegions,
        linkLabel: linkLabel.trim() || null,
        linkUrl: linkUrl.trim() || null,
        imageUrl: null,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      })
      if (imageFile) {
        const storageRef = ref(storage, `announcements/${docRef.id}/${imageFile.name}`)
        const task = uploadBytesResumable(storageRef, imageFile)
        task.on('state_changed', snap => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100))
        await new Promise<void>((resolve, reject) => {
          task.on('state_changed', null, reject, async () => {
            const url = await getDownloadURL(storageRef)
            await updateDoc(docRef, { imageUrl: url })
            resolve()
          })
        })
      }
      setTitle(''); setContent(''); setBadge(''); setPinned(false)
      setRegions(['all']); setLinkLabel(''); setLinkUrl(''); setImageFile(null); setFormOpen(false)
      toast('Announcement created', 'success')
    } catch {
      toast('Failed to create announcement', 'error')
    } finally {
      setSaving(false)
      setUploadProgress(0)
    }
  }

  function regionLabel(a: Announcement) {
    const rs = (a as any).regions as string[] | undefined
    if (!rs || rs.length === 0 || rs.includes('all')) return '🌍 All'
    if (rs.length === 1) return `${REGION_FLAGS[rs[0]] ?? ''} ${rs[0]}`
    return `${rs.length} regions`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">{announcements.length} announcements</h2>
        <button onClick={() => setFormOpen(!formOpen)} className="btn-primary text-sm">
          {formOpen ? 'Cancel' : '+ New Announcement'}
        </button>
      </div>

      {formOpen && (
        <div className="card p-5 mb-6 animate-slide-up">
          <div className="space-y-3">
            <input value={title} onChange={e => setTitle(e.target.value)} className="input-wf font-medium" placeholder="Title" />
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={4} className="input-wf resize-none" placeholder="Content" />
            <div className="flex flex-wrap gap-3 items-center">
              <select value={category} onChange={e => setCategory(e.target.value as typeof category)} className="input-wf w-auto">
                <option value="news">📰 News</option>
                <option value="promotion">💰 Promotion</option>
                <option value="maintenance">🔧 Maintenance</option>
                <option value="campaign">🎯 Campaign</option>
              </select>
              <input value={badge} onChange={e => setBadge(e.target.value)} className="input-wf w-auto" placeholder="Badge (optional)" />
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="accent-primary" />
                Pin
              </label>
            </div>
            {/* Region multi-select */}
            <RegionMultiSelect selected={regions} onChange={setRegions} label="Target regions" />
            {/* Link button section */}
            <div className="border border-border rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Link Button (optional)</p>
              <div className="flex gap-2">
                <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} className="input-wf flex-1" placeholder="Button label (e.g. Learn More)" />
                <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className="input-wf flex-1" placeholder="URL (https://...)" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-primary border border-primary/30 rounded-xl px-3 py-1.5 hover:bg-primary/5 transition">
                {imageFile ? `📷 ${imageFile.name}` : '📷 Add image'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => setImageFile(e.target.files?.[0] ?? null)} />
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
            </div>
            <button onClick={handleCreate} disabled={!title.trim() || !content.trim() || saving} className="btn-primary">
              {saving ? 'Saving…' : 'Post Announcement'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {announcements.map(a => (
          <div key={a.id} className="card p-4">
            {a.imageUrl && (
              <div className="mb-3 rounded-xl overflow-hidden border border-border">
                <img src={a.imageUrl} alt={a.title} className="w-full max-h-48 object-cover" />
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`badge ${CATEGORY_STYLES[a.category] ?? 'bg-gray-100 text-gray-600'}`}>
                    {CATEGORY_EMOJIS[a.category] ?? ''} {a.category.charAt(0).toUpperCase() + a.category.slice(1)}
                  </span>
                  <span className="badge bg-gray-100 text-gray-600 text-xs">{regionLabel(a)}</span>
                  {a.pinned && <span className="badge bg-primary/10 text-primary">📌 Pinned</span>}
                  {a.badge && <span className="badge bg-primary text-white">{a.badge}</span>}
                  {a.createdAt && <span className="text-xs text-muted-foreground">{formatRelativeTime(a.createdAt)}</span>}
                </div>
                <p className="font-semibold text-foreground">{a.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{a.content}</p>
                {a.linkLabel && a.linkUrl && (
                  <div className="mt-2">
                    <a href={a.linkUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-lg hover:bg-primary/20 transition">
                      {a.linkLabel} ↗
                    </a>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => updateDoc(doc(db, 'announcements', a.id), { pinned: !a.pinned })} className="btn-ghost text-xs py-1 px-2">
                  {a.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button onClick={() => { deleteDoc(doc(db, 'announcements', a.id)); toast('Deleted', 'success') }}
                  className="text-xs px-2 py-1 rounded-lg hover:bg-destructive/10 text-destructive transition">Delete</button>
              </div>
            </div>
          </div>
        ))}
        {announcements.length === 0 && <p className="text-center text-muted-foreground py-12">No announcements yet</p>}
      </div>
    </div>
  )
}

// ─── Discussion Forum Tab (Admin) ─────────────────────────────────────────────

function DiscussionForumTab() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [posts, setPosts] = useState<ForumPost[]>([])
  const [userMap, setUserMap] = useState<Record<string, UserRecord>>({})
  const [composerOpen, setComposerOpen] = useState(false)
  const [postType, setPostType] = useState<'post' | 'poll' | 'event'>('post')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [regions, setRegions] = useState<string[]>([])
  const [expandedPost, setExpandedPost] = useState<string | null>(null)
  // Poll
  const [pollOptions, setPollOptions] = useState(['', ''])
  // Event
  const [eventRewardLabel, setEventRewardLabel] = useState('')
  const [eventMaxWinners, setEventMaxWinners] = useState(50)
  // Image upload
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ForumPost))))
  }, [])

  // Load all users once for name lookups
  useEffect(() => {
    getDocs(collection(db, 'users')).then(snap => {
      const map: Record<string, UserRecord> = {}
      snap.docs.forEach(d => {
        const data = d.data()
        map[d.id] = { uid: d.id, displayName: data.displayName ?? null, email: data.email ?? null }
      })
      setUserMap(map)
    })
  }, [])

  function userName(uid: string) {
    const u = userMap[uid]
    if (!u) return uid.slice(0, 8) + '…'
    return u.displayName ?? u.email ?? uid.slice(0, 8) + '…'
  }

  async function handlePublish() {
    if (!title.trim() || !body.trim() || !user) return
    setPublishing(true)
    const finalRegions = regions.length === 0 ? ['all'] : regions
    try {
      const base = {
        title: title.trim(),
        body: body.trim(),
        type: postType,
        imageUrl: null,
        authorId: user.uid,
        authorName: `${user.displayName ?? 'Admin'} (Admin)`,
        authorPhotoURL: user.photoURL,
        authorRegion: user.region,
        regions: finalRegions,
        replyCount: 0,
        createdAt: serverTimestamp(),
      }
      let docRef
      if (postType === 'poll') {
        const opts = pollOptions.filter(o => o.trim()).map(o => ({ label: o.trim(), votes: 0, voterIds: [] }))
        if (opts.length < 2) { toast('Add at least 2 poll options', 'error'); setPublishing(false); return }
        docRef = await addDoc(collection(db, 'posts'), { ...base, pollOptions: opts })
      } else if (postType === 'event') {
        docRef = await addDoc(collection(db, 'posts'), { ...base, eventRewardLabel: eventRewardLabel.trim(), eventMaxWinners, eventWinners: [] })
      } else {
        docRef = await addDoc(collection(db, 'posts'), base)
      }
      if (imageFile && docRef) {
        const storageRef = ref(storage, `posts/${docRef.id}/${imageFile.name}`)
        const task = uploadBytesResumable(storageRef, imageFile)
        await new Promise<void>((resolve, reject) => {
          task.on('state_changed',
            snap => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
            reject,
            async () => {
              const url = await getDownloadURL(storageRef)
              await updateDoc(docRef, { imageUrl: url })
              setUploadProgress(0)
              resolve()
            }
          )
        })
      }
      setTitle(''); setBody(''); setRegions([]); setPollOptions(['', ''])
      setEventRewardLabel(''); setEventMaxWinners(50); setImageFile(null); setComposerOpen(false)
      toast('Post published!', 'success')
    } catch {
      toast('Failed to publish', 'error')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Discussion Forum</h2>
        <button onClick={() => setComposerOpen(!composerOpen)} className="btn-primary text-sm">
          {composerOpen ? 'Cancel' : '+ New Post'}
        </button>
      </div>

      {composerOpen && (
        <div className="card p-5 mb-6 animate-slide-up">
          {/* Post type selector */}
          <div className="flex gap-1 bg-muted rounded-xl p-1 mb-4 w-fit">
            {(['post', 'poll', 'event'] as const).map(t => (
              <button key={t} onClick={() => setPostType(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
                  postType === t ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}>
                {t === 'post' ? '📝 Post' : t === 'poll' ? '📊 Poll' : '🎉 Event'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <input value={title} onChange={e => setTitle(e.target.value)} className="input-wf font-medium" placeholder="Title *" />
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} className="input-wf resize-none"
              placeholder={postType === 'event' ? 'Describe the event…' : postType === 'poll' ? 'Ask your question…' : 'Body *'} />

            {/* Poll options */}
            {postType === 'poll' && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Poll Options</p>
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={opt} onChange={e => setPollOptions(prev => prev.map((o, j) => j === i ? e.target.value : o))}
                      className="input-wf flex-1" placeholder={`Option ${i + 1}`} />
                    {pollOptions.length > 2 && (
                      <button onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))}
                        className="text-destructive text-xs px-2 hover:bg-destructive/10 rounded-lg">✕</button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 6 && (
                  <button onClick={() => setPollOptions(prev => [...prev, ''])}
                    className="text-xs text-primary font-medium hover:underline">+ Add option</button>
                )}
              </div>
            )}

            {/* Event options */}
            {postType === 'event' && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Reward Label</p>
                  <input value={eventRewardLabel} onChange={e => setEventRewardLabel(e.target.value)}
                    className="input-wf" placeholder="e.g. Get a voucher" />
                </div>
                <div className="w-32">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Max Winners</p>
                  <input type="number" value={eventMaxWinners} onChange={e => setEventMaxWinners(Number(e.target.value))}
                    className="input-wf" min={1} />
                </div>
              </div>
            )}

            {/* Region multi-select */}
            <RegionMultiSelect selected={regions} onChange={setRegions} label="Visible to" />

            {/* Image upload */}
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="text-xs text-primary border border-primary/30 rounded-xl px-3 py-1.5 hover:bg-primary/5 transition">
                {imageFile ? `📷 ${imageFile.name}` : '📷 Add image (optional)'}
              </button>
              {imageFile && (
                <button type="button" onClick={() => setImageFile(null)}
                  className="text-xs text-destructive hover:underline">Remove</button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => setImageFile(e.target.files?.[0] ?? null)} />
            </div>
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="h-1.5 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}

            <button onClick={handlePublish} disabled={!title.trim() || !body.trim() || publishing} className="btn-primary text-sm">
              {publishing ? 'Publishing…' : 'Post'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {posts.map(post => (
          <div key={post.id} className="card p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="badge bg-gray-100 text-gray-600 text-xs capitalize">
                  {post.type === 'poll' ? '📊 Poll' : post.type === 'event' ? '🎉 Event' : '📝 Post'}
                </span>
                <span className="text-xs text-muted-foreground">{post.authorName}</span>
                {post.createdAt && <span className="text-xs text-muted-foreground">{formatRelativeTime(post.createdAt)}</span>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}
                  className="text-xs text-primary hover:underline px-2 py-1"
                >
                  {expandedPost === post.id ? 'Collapse' : 'Details'}
                </button>
                <button onClick={() => { deleteDoc(doc(db, 'posts', post.id)); toast('Deleted', 'success') }}
                  className="text-xs text-destructive hover:bg-destructive/10 px-2 py-1 rounded-lg transition">Delete</button>
              </div>
            </div>

            {/* Post image */}
            {post.imageUrl && (
              <div className="mb-3 rounded-xl overflow-hidden border border-border">
                <img src={post.imageUrl} alt={post.title} className="w-full max-h-48 object-cover" />
              </div>
            )}

            <h3 className="font-semibold text-foreground">{post.title}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{post.body}</p>

            {/* Poll results with voter names */}
            {post.type === 'poll' && post.pollOptions && (
              <div className="mt-3 space-y-2">
                {post.pollOptions.map((opt, i) => {
                  const total = post.pollOptions!.reduce((s, o) => s + o.votes, 0)
                  const pct = total === 0 ? 0 : Math.round((opt.votes / total) * 100)
                  const voters = opt.voterIds ?? []
                  return (
                    <div key={i} className="rounded-xl border border-border overflow-hidden">
                      <div className="relative px-3 py-2">
                        <div className="absolute inset-0 bg-primary/10" style={{ width: `${pct}%` }} />
                        <div className="relative flex justify-between text-sm">
                          <span>{opt.label}</span>
                          <span className="text-muted-foreground font-medium">{opt.votes} votes ({pct}%)</span>
                        </div>
                      </div>
                      {expandedPost === post.id && voters.length > 0 && (
                        <div className="px-3 py-2 bg-gray-50 border-t border-border">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Voters:</p>
                          <div className="flex flex-wrap gap-1">
                            {voters.map(uid => (
                              <span key={uid} className="text-xs bg-white border border-border rounded-full px-2 py-0.5">
                                {userName(uid)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {expandedPost === post.id && voters.length === 0 && (
                        <div className="px-3 py-1.5 bg-gray-50 border-t border-border">
                          <p className="text-xs text-muted-foreground">No votes yet</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Event with claimer names */}
            {post.type === 'event' && post.eventRewardLabel && (
              <div className="mt-3">
                <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-xl border border-yellow-200">
                  <span className="text-xl">🎁</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-800">{post.eventRewardLabel}</p>
                    <p className="text-xs text-yellow-600">
                      First {post.eventMaxWinners} · {post.eventWinners?.length ?? 0} claimed
                    </p>
                  </div>
                  <button
                    onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}
                    className="text-xs text-yellow-700 underline"
                  >
                    {expandedPost === post.id ? 'Hide' : 'View'} claimers
                  </button>
                </div>
                {expandedPost === post.id && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-xl border border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Claimers ({post.eventWinners?.length ?? 0}/{post.eventMaxWinners}):
                    </p>
                    {(post.eventWinners?.length ?? 0) === 0 ? (
                      <p className="text-xs text-muted-foreground">No claimers yet</p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(post.eventWinners ?? []).map((uid, idx) => (
                          <span key={uid} className="text-xs bg-white border border-border rounded-full px-2 py-0.5">
                            {idx + 1}. {userName(uid)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-2">{post.replyCount} replies</p>
          </div>
        ))}
        {posts.length === 0 && <p className="text-center text-muted-foreground py-12">No posts yet</p>}
      </div>
    </div>
  )
}

// ─── Support Inbox Tab ────────────────────────────────────────────────────────

function SupportInboxTab() {
  const { user } = useAuth()
  const [threads, setThreads] = useState<SupportThread[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; senderName: string; text: string } | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'supportChats'), orderBy('updatedAt', 'desc')),
      snap => setThreads(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportThread)))
    )
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setReplyTo(null)
    const q = query(collection(db, 'supportChats', selectedId, 'messages'), orderBy('timestamp', 'asc'))
    return onSnapshot(q, snap => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportMessage))))
  }, [selectedId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function sendReply() {
    if (!text.trim() || !selectedId || !user) return
    const t = text.trim()
    setText('')
    setReplyTo(null)
    await addDoc(collection(db, 'supportChats', selectedId, 'messages'), {
      senderId: user.uid,
      senderName: `${user.displayName ?? 'Admin'} (Support)`,
      text: t,
      timestamp: serverTimestamp(),
      replyTo: replyTo ?? null,
    })
    await updateDoc(doc(db, 'supportChats', selectedId), { lastMessage: t, updatedAt: serverTimestamp() })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() }
  }

  const selectedThread = threads.find(t => t.id === selectedId)

  return (
    <div className="flex gap-4 h-[calc(100vh-200px)]">
      <div className="w-64 flex-shrink-0 card overflow-y-auto">
        <div className="p-3 border-b border-border">
          <p className="font-semibold text-sm text-foreground">Support Inbox</p>
        </div>
        {threads.map(t => (
          <button key={t.id} onClick={() => setSelectedId(t.id)}
            className={`w-full text-left px-3 py-2.5 hover:bg-surface transition border-b border-border last:border-0 ${selectedId === t.id ? 'bg-primary/5' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground truncate">{t.userName}</span>
              <span className={`badge flex-shrink-0 text-[10px] ${t.status === 'open' ? 'bg-success/10 text-success' : 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{t.lastMessage}</p>
          </button>
        ))}
        {threads.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No chats yet</p>}
      </div>

      <div className="flex-1 flex flex-col card overflow-hidden">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Select a conversation</div>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-white">
              <p className="font-semibold text-sm text-foreground">{selectedThread?.userName}</p>
              {selectedThread?.status === 'open' && (
                <button onClick={() => updateDoc(doc(db, 'supportChats', selectedId), { status: 'resolved' })} className="btn-outline text-xs py-1.5">
                  Mark Resolved
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {messages.map(msg => {
                const isSelf = msg.senderId === user?.uid
                return (
                  <div key={msg.id} className={`flex ${isSelf ? 'justify-end' : 'justify-start'} group`}
                    onMouseEnter={() => setHoveredId(msg.id)} onMouseLeave={() => setHoveredId(null)}>
                    {!isSelf && <Avatar name={msg.senderName} size="xs" className="mr-1.5 flex-shrink-0 self-end" />}
                    <div className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-xs`}>
                      {!isSelf && <span className="text-xs font-medium mb-0.5 ml-1">{msg.senderName}</span>}
                      {msg.replyTo && (
                        <div className={`mb-1 px-3 py-1 rounded-xl text-xs ${isSelf ? 'bg-primary/80 text-white/90' : 'bg-gray-100'}`}>
                          <div className={`border-l-2 pl-2 ${isSelf ? 'border-white/60' : 'border-primary'}`}>
                            <p className="font-semibold">{msg.replyTo.senderName}</p>
                            <p className="truncate">{truncate(msg.replyTo.text, 50)}</p>
                          </div>
                        </div>
                      )}
                      <div className={isSelf ? 'bubble-self' : 'bubble-other'}>{msg.text}</div>
                    </div>
                    {hoveredId === msg.id && (
                      <button className={`self-center mx-1 opacity-70 hover:opacity-100 text-muted-foreground ${isSelf ? 'order-first' : 'order-last'}`}
                        onClick={() => { setReplyTo({ id: msg.id, senderName: msg.senderName, text: msg.text }); inputRef.current?.focus() }}>
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                      </button>
                    )}
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
            {replyTo && (
              <div className="flex items-center gap-2 px-4 py-1.5 bg-primary/5 border-t border-primary/20 text-xs">
                <div className="flex-1 border-l-2 border-primary pl-2">
                  <p className="font-semibold text-primary">{replyTo.senderName}</p>
                  <p className="text-muted-foreground truncate">{truncate(replyTo.text, 60)}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-muted-foreground">✕</button>
              </div>
            )}
            <div className="px-3 py-2 border-t border-border bg-white flex items-end gap-2">
              <div className="flex-1 bg-surface rounded-xl border border-border px-3 py-1.5">
                <textarea ref={inputRef} rows={1} value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder="Reply to user…" className="w-full resize-none bg-transparent text-sm outline-none max-h-20" style={{ minHeight: '24px' }} />
              </div>
              <button onClick={sendReply} disabled={!text.trim()} className="btn-primary px-3 py-2">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Group Chat Monitor Tab ───────────────────────────────────────────────────

function GroupChatTab() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [region, setRegion] = useState<string>(ALL_REGIONS[0])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const q = query(
      collection(db, 'messages', region, 'chats'),
      orderBy('timestamp', 'asc')
    )
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)))
    })
  }, [region])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function sendMessage() {
    if (!text.trim() || !user) return
    const t = text.trim()
    setText('')
    await addDoc(collection(db, 'messages', region, 'chats'), {
      userId: user.uid,
      userName: `${user.displayName ?? 'Admin'} (Admin)`,
      userPhotoURL: user.photoURL ?? null,
      text: t,
      timestamp: serverTimestamp(),
      replyTo: null,
    })
  }

  async function deleteMessage(id: string) {
    try {
      await deleteDoc(doc(db, 'messages', region, 'chats', id))
      toast('Message deleted', 'success')
    } catch {
      toast('Failed to delete', 'error')
    }
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) return
    await updateDoc(doc(db, 'messages', region, 'chats', id), { text: editText.trim() })
    setEditingId(null)
    setEditText('')
    toast('Message updated', 'success')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-foreground">Group Chat Monitor</h2>
        <select
          value={region}
          onChange={e => setRegion(e.target.value)}
          className="input-wf w-auto text-sm"
        >
          {ALL_REGIONS.map(r => (
            <option key={r} value={r}>{REGION_FLAGS[r] ?? ''} {r}</option>
          ))}
        </select>
      </div>

      <div className="card flex flex-col" style={{ height: 'calc(100vh - 280px)' }}>
        {/* Message list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {messages.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-12">No messages in this region chat</p>
          )}
          {messages.map(msg => {
            const isSelf = msg.userId === user?.uid
            return (
              <div
                key={msg.id}
                className={`flex ${isSelf ? 'justify-end' : 'justify-start'} group mb-1`}
                onMouseEnter={() => setHoveredId(msg.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {!isSelf && (
                  <Avatar name={msg.userName} photoURL={msg.userPhotoURL} size="xs" className="mr-1.5 flex-shrink-0 self-end" />
                )}
                <div className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-xs lg:max-w-md`}>
                  {!isSelf && (
                    <span className="text-xs font-medium text-muted-foreground mb-0.5 ml-1">{msg.userName}</span>
                  )}
                  {editingId === msg.id ? (
                    <div className="flex gap-1 items-end">
                      <textarea
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        rows={2}
                        className="input-wf text-sm resize-none w-56"
                        autoFocus
                      />
                      <button onClick={() => saveEdit(msg.id)} className="btn-primary text-xs px-2 py-1">Save</button>
                      <button onClick={() => { setEditingId(null); setEditText('') }} className="btn-ghost text-xs px-2 py-1">✕</button>
                    </div>
                  ) : (
                    <div className={isSelf ? 'bubble-self' : 'bubble-other'}>{msg.text}</div>
                  )}
                  {msg.timestamp && (
                    <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                      {formatMessageTime(msg.timestamp)}
                    </span>
                  )}
                </div>

                {/* Action buttons on hover */}
                {hoveredId === msg.id && editingId !== msg.id && (
                  <div className={`self-center flex items-center gap-1 mx-1 ${isSelf ? 'order-first' : 'order-last'}`}>
                    {/* Edit button */}
                    <button
                      onClick={() => { setEditingId(msg.id); setEditText(msg.text) }}
                      title="Edit message"
                      className="opacity-70 hover:opacity-100 text-muted-foreground p-0.5 hover:text-primary transition"
                    >
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={() => deleteMessage(msg.id)}
                      title="Delete message"
                      className="opacity-70 hover:opacity-100 text-destructive p-0.5 transition"
                    >
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-3 py-2 border-t border-border bg-white flex items-end gap-2">
          <div className="flex-1 bg-surface rounded-xl border border-border px-3 py-1.5">
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Send as Admin to ${region} chat…`}
              className="w-full resize-none bg-transparent text-sm outline-none max-h-20"
              style={{ minHeight: '24px' }}
            />
          </div>
          <button onClick={sendMessage} disabled={!text.trim()} className="btn-primary px-3 py-2">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Admin Page ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'forum', label: 'Discussion Forum' },
  { id: 'groupchat', label: 'Group Chat' },
  { id: 'support', label: 'Support Inbox' },
] as const

type TabId = typeof TABS[number]['id']

export default function AdminPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') as TabId) ?? 'overview'

  if (user?.role !== 'admin' && user?.role !== 'manager') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="font-semibold text-foreground">Access Restricted</p>
          <p className="text-sm text-muted-foreground mt-1">You don't have permission to view this page</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-lg">🛡️</span>
            <h1 className="text-xl font-bold text-foreground">Admin Panel</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Logged in as <span className="font-semibold text-primary">{user?.displayName ?? 'User'} ADMIN</span>
          </p>
        </div>

        <div className="flex gap-1 bg-muted rounded-xl p-1 mb-6 w-fit">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setSearchParams({ tab: t.id })}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === t.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab />}
        {tab === 'announcements' && <AnnouncementsTab />}
        {tab === 'forum' && <DiscussionForumTab />}
        {tab === 'groupchat' && <GroupChatTab />}
        {tab === 'support' && <SupportInboxTab />}
      </div>
    </div>
  )
}
