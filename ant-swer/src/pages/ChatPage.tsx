import { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, onSnapshot, query, orderBy, limit,
  serverTimestamp, setDoc, deleteDoc, doc, Timestamp, getDoc, getDocs, where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { formatMessageTime, formatDateLabel, REGION_FLAGS, truncate } from '../lib/utils'
import Avatar from '../components/Avatar'
import { useToast } from '../components/ui/toast'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  userId: string
  userName: string
  userEmail?: string | null
  userPhotoURL: string | null
  text: string
  timestamp: Timestamp | null
  replyTo: { id: string; userName: string; text: string } | null
}

interface FriendUser {
  uid: string
  displayName: string | null
  photoURL: string | null
  region: string | null
  email: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dmChannelId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_')
}

// ─── Avatar with email tooltip ────────────────────────────────────────────────

function AvatarWithTooltip({
  name, photoURL, email, size = 'sm',
}: {
  name?: string | null
  photoURL?: string | null
  email?: string | null
  size?: 'xs' | 'sm' | 'md'
}) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)

  function handleEnter() {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPos({ top: rect.top - 32, left: rect.left + rect.width / 2 })
    }
    setShow(true)
  }

  return (
    <div
      ref={ref}
      className="relative inline-flex items-center justify-center flex-shrink-0"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      <Avatar name={name} photoURL={photoURL} size={size} />
      {show && email && (
        <div
          className="fixed z-[9999] pointer-events-none -translate-x-1/2 -translate-y-full"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="bg-gray-900 text-white text-[10px] rounded-lg px-2 py-1 whitespace-nowrap shadow-lg">
            {email}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Message row (shared between GroupChat and DM) ───────────────────────────

function MessageRow({
  msg, isSelf, showAvatar, hoveredId, setHoveredId,
  onReply, onDelete, deleteCollection,
}: {
  msg: ChatMessage
  isSelf: boolean
  showAvatar: boolean
  hoveredId: string | null
  setHoveredId: (id: string | null) => void
  onReply: (msg: ChatMessage) => void
  onDelete: (id: string) => void
  deleteCollection: string
}) {
  return (
    <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'} group mb-1`}
      onMouseEnter={() => setHoveredId(msg.id)} onMouseLeave={() => setHoveredId(null)}>
      {!isSelf && (
        <div className="w-8 mr-2 flex-shrink-0 flex items-end">
          {showAvatar && (
            <AvatarWithTooltip name={msg.userName} photoURL={msg.userPhotoURL} email={msg.userEmail} size="sm" />
          )}
        </div>
      )}
      <div className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-xs lg:max-w-md`}>
        {showAvatar && !isSelf && (
          <span className="text-xs font-medium text-foreground mb-0.5 ml-1">{msg.userName}</span>
        )}
        <div className="relative">
          {msg.replyTo && (
            <div className={`mb-1 px-3 py-1.5 rounded-xl text-xs ${isSelf ? 'bg-primary/80 text-white/90' : 'bg-gray-100 text-foreground'}`}>
              <div className={`border-l-2 pl-2 ${isSelf ? 'border-white/60' : 'border-primary'}`}>
                <p className="font-semibold">{msg.replyTo.userName}</p>
                <p className="truncate">{truncate(msg.replyTo.text, 60)}</p>
              </div>
            </div>
          )}
          <div className={isSelf ? 'bubble-self' : 'bubble-other'}>{msg.text}</div>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">
            {msg.timestamp ? formatMessageTime(msg.timestamp) : ''}
          </span>
        </div>
      </div>
      {/* Action buttons on hover */}
      {hoveredId === msg.id && (
        <div className={`self-center flex items-center gap-1 mx-1 ${isSelf ? 'order-first' : 'order-last'}`}>
          {/* Reply */}
          <button className="opacity-70 hover:opacity-100 text-muted-foreground p-0.5"
            onClick={() => onReply(msg)} title="Reply">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          {/* Delete own message */}
          {isSelf && (
            <button className="opacity-70 hover:opacity-100 text-destructive p-0.5"
              onClick={() => onDelete(msg.id)} title="Delete message">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Group Chat Panel ─────────────────────────────────────────────────────────

function GroupChatPanel() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; userName: string; text: string } | null>(null)
  const [onlineCount, setOnlineCount] = useState(1)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const regionId = user?.region ?? 'global'

  useEffect(() => {
    const q = query(
      collection(db, 'messages', regionId, 'chats'),
      orderBy('timestamp', 'asc'),
      limit(100)
    )
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)))
    })
  }, [regionId])

  useEffect(() => {
    if (!user) return
    const ref = doc(db, 'presence', regionId, 'members', user.uid)
    setDoc(ref, { uid: user.uid, name: user.displayName, online: true, lastSeen: serverTimestamp() })
    return () => { setDoc(ref, { uid: user.uid, name: user.displayName, online: false, lastSeen: serverTimestamp() }) }
  }, [user, regionId])

  useEffect(() => {
    return onSnapshot(collection(db, 'presence', regionId, 'members'), snap => {
      setOnlineCount(Math.max(snap.docs.filter(d => d.data().online).length, 1))
    })
  }, [regionId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function sendMessage() {
    if (!text.trim() || !user) return
    const payload = {
      userId: user.uid,
      userName: user.displayName ?? 'User',
      userEmail: user.email ?? null,
      userPhotoURL: user.photoURL,
      text: text.trim(),
      timestamp: serverTimestamp(),
      replyTo: replyTo ?? null,
    }
    setText('')
    setReplyTo(null)
    await addDoc(collection(db, 'messages', regionId, 'chats'), payload)
  }

  async function deleteMessage(id: string) {
    await deleteDoc(doc(db, 'messages', regionId, 'chats', id))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const grouped: { label: string; messages: ChatMessage[] }[] = []
  let currentLabel = ''
  for (const msg of messages) {
    const label = msg.timestamp ? formatDateLabel(msg.timestamp) : 'Today'
    if (label !== currentLabel) { grouped.push({ label, messages: [msg] }); currentLabel = label }
    else grouped[grouped.length - 1].messages.push(msg)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-border">
        <div>
          <h2 className="font-semibold text-foreground">
            {REGION_FLAGS[regionId] ?? '🌍'} {user?.region ?? 'Global'} Community Chat
          </h2>
          <p className="text-xs text-muted-foreground">{messages.length} messages · {onlineCount} online</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <span className="text-4xl mb-3">{REGION_FLAGS[regionId] ?? '🌍'}</span>
            <p className="font-medium text-foreground">No messages yet</p>
            <p className="text-sm mt-1">Be the first to say something!</p>
          </div>
        )}
        {grouped.map(({ label, messages: group }) => (
          <div key={label}>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground font-medium">{label}</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            {group.map((msg, idx) => {
              const isSelf = msg.userId === user?.uid
              const prevMsg = idx > 0 ? group[idx - 1] : null
              const showAvatar = !prevMsg || prevMsg.userId !== msg.userId
              return (
                <MessageRow key={msg.id} msg={msg} isSelf={isSelf} showAvatar={showAvatar}
                  hoveredId={hoveredId} setHoveredId={setHoveredId}
                  onReply={m => { setReplyTo({ id: m.id, userName: m.userName, text: m.text }); inputRef.current?.focus() }}
                  onDelete={deleteMessage}
                  deleteCollection={`messages/${regionId}/chats`}
                />
              )
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-t border-primary/20">
          <div className="flex-1 border-l-2 border-primary pl-2 text-xs">
            <p className="font-semibold text-primary">{replyTo.userName}</p>
            <p className="text-muted-foreground truncate">{truncate(replyTo.text, 80)}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="px-4 py-3 bg-white border-t border-border">
        <div className="flex items-end gap-2">
          <Avatar name={user?.displayName} photoURL={user?.photoURL} size="sm" className="flex-shrink-0 mb-1" />
          <div className="flex-1 flex items-end gap-2 bg-surface rounded-xl border border-border px-3 py-2">
            <textarea ref={inputRef} rows={1} value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={replyTo ? `Reply to ${replyTo.userName}…` : `Message ${user?.region ?? 'community'}…`}
              className="flex-1 resize-none bg-transparent text-sm outline-none max-h-32" style={{ minHeight: '24px' }} />
          </div>
          <button onClick={sendMessage} disabled={!text.trim()} className="btn-primary px-3 py-2 mb-1">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── DM Panel ─────────────────────────────────────────────────────────────────

function DMPanel({ friend }: { friend: FriendUser }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; userName: string; text: string } | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const channelId = user ? dmChannelId(user.uid, friend.uid) : ''

  useEffect(() => {
    if (!channelId) return
    const q = query(
      collection(db, 'directMessages', channelId, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(100)
    )
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)))
    })
  }, [channelId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function sendMessage() {
    if (!text.trim() || !user || !channelId) return
    const payload = {
      userId: user.uid,
      userName: user.displayName ?? 'User',
      userEmail: user.email ?? null,
      userPhotoURL: user.photoURL,
      text: text.trim(),
      timestamp: serverTimestamp(),
      replyTo: replyTo ?? null,
    }
    setText('')
    setReplyTo(null)
    await addDoc(collection(db, 'directMessages', channelId, 'messages'), payload)
  }

  async function deleteMessage(id: string) {
    await deleteDoc(doc(db, 'directMessages', channelId, 'messages', id))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const grouped: { label: string; messages: ChatMessage[] }[] = []
  let currentLabel = ''
  for (const msg of messages) {
    const label = msg.timestamp ? formatDateLabel(msg.timestamp) : 'Today'
    if (label !== currentLabel) { grouped.push({ label, messages: [msg] }); currentLabel = label }
    else grouped[grouped.length - 1].messages.push(msg)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-border">
        <AvatarWithTooltip name={friend.displayName} photoURL={friend.photoURL} email={friend.email} size="sm" />
        <div>
          <h2 className="font-semibold text-foreground">{friend.displayName ?? 'User'}</h2>
          <p className="text-xs text-muted-foreground">{friend.region ? `${REGION_FLAGS[friend.region] ?? ''} ${friend.region}` : friend.email}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-3xl mb-3">👋</p>
            <p className="font-medium text-foreground">Start the conversation</p>
            <p className="text-sm mt-1">Say hi to {friend.displayName ?? 'your friend'}!</p>
          </div>
        )}
        {grouped.map(({ label, messages: group }) => (
          <div key={label}>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground font-medium">{label}</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            {group.map((msg, idx) => {
              const isSelf = msg.userId === user?.uid
              const prevMsg = idx > 0 ? group[idx - 1] : null
              const showAvatar = !prevMsg || prevMsg.userId !== msg.userId
              return (
                <MessageRow key={msg.id} msg={msg} isSelf={isSelf} showAvatar={showAvatar}
                  hoveredId={hoveredId} setHoveredId={setHoveredId}
                  onReply={m => { setReplyTo({ id: m.id, userName: m.userName, text: m.text }); inputRef.current?.focus() }}
                  onDelete={deleteMessage}
                  deleteCollection={`directMessages/${channelId}/messages`}
                />
              )
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-t border-primary/20">
          <div className="flex-1 border-l-2 border-primary pl-2 text-xs">
            <p className="font-semibold text-primary">{replyTo.userName}</p>
            <p className="text-muted-foreground truncate">{truncate(replyTo.text, 80)}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="px-4 py-3 bg-white border-t border-border">
        <div className="flex items-end gap-2">
          <Avatar name={user?.displayName} photoURL={user?.photoURL} size="sm" className="flex-shrink-0 mb-1" />
          <div className="flex-1 flex items-end gap-2 bg-surface rounded-xl border border-border px-3 py-2">
            <textarea ref={inputRef} rows={1} value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={`Message ${friend.displayName ?? 'friend'}…`}
              className="flex-1 resize-none bg-transparent text-sm outline-none max-h-32" style={{ minHeight: '24px' }} />
          </div>
          <button onClick={sendMessage} disabled={!text.trim()} className="btn-primary px-3 py-2 mb-1">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Friend Modal ─────────────────────────────────────────────────────────

function AddFriendModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [searching, setSearching] = useState(false)

  async function handleAdd() {
    if (!email.trim() || !user) return
    if (email.trim().toLowerCase() === user.email?.toLowerCase()) {
      toast("You can't add yourself", 'error')
      return
    }
    setSearching(true)
    try {
      const q = query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase()))
      const snap = await getDocs(q)
      if (snap.empty) {
        toast('No user found with that email', 'error')
        return
      }
      const friendDoc = snap.docs[0]
      const friendUid = friendDoc.id
      const existing = await getDoc(doc(db, 'friends', user.uid, 'list', friendUid))
      if (existing.exists()) {
        toast('Already in your friends list', 'error')
        return
      }
      const friendData = friendDoc.data()
      await setDoc(doc(db, 'friends', user.uid, 'list', friendUid), {
        uid: friendUid,
        displayName: friendData.displayName ?? null,
        photoURL: friendData.photoURL ?? null,
        region: friendData.region ?? null,
        email: friendData.email ?? null,
        addedAt: serverTimestamp(),
      })
      await setDoc(doc(db, 'friends', friendUid, 'list', user.uid), {
        uid: user.uid,
        displayName: user.displayName ?? null,
        photoURL: user.photoURL ?? null,
        region: user.region ?? null,
        email: user.email ?? null,
        addedAt: serverTimestamp(),
      })
      toast(`${friendData.displayName ?? email} added!`, 'success')
      onClose()
    } catch {
      toast('Something went wrong', 'error')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 animate-slide-up">
        <h2 className="font-semibold text-foreground mb-1">Add Friend</h2>
        <p className="text-sm text-muted-foreground mb-4">Enter their email address to start chatting.</p>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          className="input-wf mb-3" placeholder="friend@example.com" autoFocus />
        <div className="flex gap-2">
          <button onClick={handleAdd} disabled={!email.trim() || searching} className="btn-primary flex-1">
            {searching ? 'Searching…' : 'Add Friend'}
          </button>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── Chat Page ────────────────────────────────────────────────────────────────

type ChatView = 'group' | string

export default function ChatPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [friends, setFriends] = useState<FriendUser[]>([])
  const [view, setView] = useState<ChatView>('group')
  const [showAddFriend, setShowAddFriend] = useState(false)

  useEffect(() => {
    if (!user) return
    return onSnapshot(
      collection(db, 'friends', user.uid, 'list'),
      snap => setFriends(snap.docs.map(d => d.data() as FriendUser))
    )
  }, [user])

  async function removeFriend(friendUid: string) {
    if (!user) return
    const channelId = dmChannelId(user.uid, friendUid)
    try {
      // Delete from this user's friends list only (other user keeps their side)
      await deleteDoc(doc(db, 'friends', user.uid, 'list', friendUid))
      // Delete all messages in the DM channel
      const msgsSnap = await getDocs(collection(db, 'directMessages', channelId, 'messages'))
      await Promise.all(msgsSnap.docs.map(d => deleteDoc(d.ref)))
      // Navigate away if currently viewing that chat
      if (view === friendUid) setView('group')
      toast('Contact removed', 'success')
    } catch {
      toast('Failed to remove contact', 'error')
    }
  }

  const activeFriend = friends.find(f => f.uid === view) ?? null

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <div className="w-56 flex-shrink-0 flex flex-col bg-[#f7f7f8] border-r border-gray-200">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
          <h1 className="font-semibold text-foreground text-sm">Chat</h1>
          <button onClick={() => setShowAddFriend(true)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-primary hover:bg-primary/10 transition"
            title="Add friend">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {/* Group chat */}
          <button onClick={() => setView('group')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition ${view === 'group' ? 'bg-primary/10' : 'hover:bg-gray-100'}`}>
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-base">
              {REGION_FLAGS[user?.region ?? ''] ?? '🌍'}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${view === 'group' ? 'text-primary' : 'text-foreground'}`}>Community Chat</p>
              <p className="text-xs text-muted-foreground truncate">{user?.region ?? 'Global'}</p>
            </div>
          </button>

          {friends.length > 0 && (
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 py-2 mt-1">
              Direct Messages
            </p>
          )}

          {friends.map(f => (
            <div key={f.uid} className={`group relative flex items-center gap-2.5 px-3 py-2.5 transition cursor-pointer ${view === f.uid ? 'bg-primary/10' : 'hover:bg-gray-100'}`}
              onClick={() => setView(f.uid)}>
              <AvatarWithTooltip name={f.displayName} photoURL={f.photoURL} email={f.email} size="sm" />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${view === f.uid ? 'text-primary' : 'text-foreground'}`}>
                  {f.displayName ?? 'User'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {f.region ? `${REGION_FLAGS[f.region] ?? ''} ${f.region}` : f.email}
                </p>
              </div>
              {/* Remove button — appears on hover */}
              <button
                onClick={e => { e.stopPropagation(); removeFriend(f.uid) }}
                title="Remove contact"
                className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {friends.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">No direct messages yet.</p>
              <button onClick={() => setShowAddFriend(true)}
                className="mt-2 text-xs text-primary font-medium hover:underline">
                Add a friend
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 min-w-0">
        {view === 'group' ? <GroupChatPanel />
          : activeFriend ? <DMPanel friend={activeFriend} />
          : <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Select a conversation</div>}
      </div>

      {showAddFriend && <AddFriendModal onClose={() => setShowAddFriend(false)} />}
    </div>
  )
}
