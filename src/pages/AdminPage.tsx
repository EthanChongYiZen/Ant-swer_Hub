import React, { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, doc, updateDoc, deleteDoc, getDocs, Timestamp,
} from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/ui/toast'
import { formatMessageTime, formatRelativeTime, ALL_REGIONS, truncate } from '../lib/utils'
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

const CATEGORY_STYLES: Record<string, string> = {
  promotion: 'bg-yellow-100 text-yellow-700',
  news: 'bg-blue-100 text-blue-700',
  maintenance: 'bg-red-100 text-red-700',
  campaign: 'bg-green-100 text-green-700',
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
      setStats({
        users: users.size,
        announcements: announcements.size,
        open,
        resolved: chats.size - open,
      })
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
            <p className="text-sm text-muted-foreground mt-0.5">{c.label}</p>
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
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)))
    })
    return unsub
  }, [])

  async function handleCreate() {
    if (!title.trim() || !content.trim() || !user) return
    setSaving(true)
    try {
      const docRef = await addDoc(collection(db, 'announcements'), {
        title: title.trim(),
        content: content.trim(),
        category,
        badge: badge.trim() || null,
        pinned,
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
      setTitle(''); setContent(''); setBadge(''); setPinned(false); setImageFile(null); setFormOpen(false)
      toast('Announcement created', 'success')
    } catch {
      toast('Failed to create announcement', 'error')
    } finally {
      setSaving(false)
      setUploadProgress(0)
    }
  }

  async function togglePin(id: string, pinned: boolean) {
    await updateDoc(doc(db, 'announcements', id), { pinned: !pinned })
    toast(!pinned ? 'Pinned' : 'Unpinned', 'success')
  }

  async function handleDelete(id: string) {
    await deleteDoc(doc(db, 'announcements', id))
    toast('Deleted', 'success')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Announcements</h2>
        <button onClick={() => setFormOpen(!formOpen)} className="btn-primary text-sm">
          {formOpen ? 'Cancel' : '+ Create'}
        </button>
      </div>

      {formOpen && (
        <div className="card p-5 mb-6 animate-slide-up">
          <div className="space-y-3">
            <input value={title} onChange={e => setTitle(e.target.value)} className="input-wf font-medium" placeholder="Title" />
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={4} className="input-wf resize-none" placeholder="Content" />
            <div className="flex flex-wrap gap-3">
              <select value={category} onChange={e => setCategory(e.target.value as typeof category)} className="input-wf w-auto">
                <option value="news">News</option>
                <option value="promotion">Promotion</option>
                <option value="maintenance">Maintenance</option>
                <option value="campaign">Campaign</option>
              </select>
              <input value={badge} onChange={e => setBadge(e.target.value)} className="input-wf w-auto" placeholder="Badge (optional)" />
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="accent-primary" />
                Pin this announcement
              </label>
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
              {saving ? 'Saving…' : 'Publish'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {announcements.map(a => (
          <div key={a.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`badge ${CATEGORY_STYLES[a.category] ?? 'bg-gray-100 text-gray-600'}`}>{a.category}</span>
                  {a.pinned && <span className="badge bg-primary/10 text-primary">📌 Pinned</span>}
                  {a.badge && <span className="badge bg-primary text-white">{a.badge}</span>}
                  {a.createdAt && <span className="text-xs text-muted-foreground">{formatRelativeTime(a.createdAt)}</span>}
                </div>
                <p className="font-semibold text-foreground">{a.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{a.content}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => togglePin(a.id, a.pinned)} className="btn-ghost text-xs py-1 px-2">
                  {a.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button onClick={() => handleDelete(a.id)} className="text-xs px-2 py-1 rounded-lg hover:bg-destructive/10 text-destructive transition">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {announcements.length === 0 && (
          <p className="text-center text-muted-foreground py-12">No announcements yet</p>
        )}
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
    const unsub = onSnapshot(
      query(collection(db, 'supportChats'), orderBy('updatedAt', 'desc')),
      snap => setThreads(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportThread)))
    )
    return unsub
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setReplyTo(null)
    const q = query(collection(db, 'supportChats', selectedId, 'messages'), orderBy('timestamp', 'asc'))
    const unsub = onSnapshot(q, snap => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportMessage))))
    return unsub
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
      {/* Thread list */}
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

      {/* Chat */}
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

// ─── Group Chat Tab ───────────────────────────────────────────────────────────

function GroupChatTab() {
  const { user } = useAuth()
  const [region, setRegion] = useState(ALL_REGIONS[0])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; userName: string; text: string } | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = query(collection(db, 'messages', region, 'chats'), orderBy('timestamp', 'asc'), )
    const unsub = onSnapshot(q, snap => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage))))
    return unsub
  }, [region])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function sendMessage() {
    if (!text.trim() || !user) return
    const t = text.trim()
    setText('')
    setReplyTo(null)
    await addDoc(collection(db, 'messages', region, 'chats'), {
      userId: user.uid,
      userName: `${user.displayName ?? 'Admin'} (Admin)`,
      userPhotoURL: user.photoURL,
      text: t,
      timestamp: serverTimestamp(),
      replyTo: replyTo ?? null,
    })
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-foreground">Group Chat Monitor</h2>
        <select value={region} onChange={e => setRegion(e.target.value)} className="input-wf w-auto">
          {ALL_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="card h-[500px] flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {messages.map(msg => (
            <div key={msg.id} className="flex items-start gap-2 group"
              onMouseEnter={() => setHoveredId(msg.id)} onMouseLeave={() => setHoveredId(null)}>
              <Avatar name={msg.userName} photoURL={msg.userPhotoURL} size="xs" className="flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{msg.userName}</span>
                  <span className="text-[10px] text-muted-foreground">{msg.timestamp ? formatMessageTime(msg.timestamp) : ''}</span>
                </div>
                {msg.replyTo && (
                  <div className="text-xs bg-gray-100 rounded-lg px-2 py-1 mb-0.5 border-l-2 border-primary mt-0.5">
                    <span className="font-semibold">{msg.replyTo.userName}: </span>
                    {truncate(msg.replyTo.text, 50)}
                  </div>
                )}
                <p className="text-sm text-foreground">{msg.text}</p>
              </div>
              {hoveredId === msg.id && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setReplyTo({ id: msg.id, userName: msg.userName, text: msg.text })}
                    className="text-[10px] text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded hover:bg-gray-100">
                    Reply
                  </button>
                  <button onClick={() => deleteDoc(doc(db, 'messages', region, 'chats', msg.id))}
                    className="text-[10px] text-destructive hover:bg-destructive/10 px-1.5 py-0.5 rounded">
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
          {messages.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No messages in {region} yet</p>}
          <div ref={bottomRef} />
        </div>

        {replyTo && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-primary/5 border-t border-primary/20 text-xs">
            <div className="flex-1 border-l-2 border-primary pl-2">
              <p className="font-semibold text-primary">{replyTo.userName}</p>
              <p className="text-muted-foreground truncate">{truncate(replyTo.text, 60)}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-muted-foreground">✕</button>
          </div>
        )}

        <div className="px-3 py-2 border-t border-border bg-white flex items-end gap-2">
          <div className="flex-1 bg-surface rounded-xl border border-border px-3 py-1.5">
            <textarea rows={1} value={text} onChange={e => setText(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder={`Message ${region} as Admin…`}
              className="w-full resize-none bg-transparent text-sm outline-none max-h-20" style={{ minHeight: '24px' }} />
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
  { id: 'support', label: 'Support Inbox' },
  { id: 'group-chat', label: 'Group Chat' },
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
        <h1 className="text-xl font-bold text-foreground mb-6">Admin Panel</h1>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-xl p-1 mb-6 w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setSearchParams({ tab: t.id })}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab />}
        {tab === 'announcements' && <AnnouncementsTab />}
        {tab === 'support' && <SupportInboxTab />}
        {tab === 'group-chat' && <GroupChatTab />}
      </div>
    </div>
  )
}
