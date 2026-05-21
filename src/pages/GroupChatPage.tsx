import { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, onSnapshot, query, orderBy, limit,
  serverTimestamp, setDoc, deleteDoc, doc, Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { formatMessageTime, formatDateLabel, isSameDay, truncate } from '../lib/utils'
import Avatar from '../components/Avatar'

interface ChatMessage {
  id: string
  userId: string
  userName: string
  userPhotoURL: string | null
  text: string
  timestamp: Timestamp | null
  replyTo: { id: string; userName: string; text: string } | null
}

interface ReplyState {
  id: string
  userName: string
  text: string
}

export default function GroupChatPage() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<ReplyState | null>(null)
  const [onlineCount, setOnlineCount] = useState(1)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const regionId = user?.region ?? 'global'

  // Subscribe messages
  useEffect(() => {
    const q = query(
      collection(db, 'messages', regionId, 'chats'),
      orderBy('timestamp', 'asc'),
      limit(100)
    )
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)))
    })
    return unsub
  }, [regionId])

  // Presence
  useEffect(() => {
    if (!user) return
    const ref = doc(db, 'presence', regionId, 'members', user.uid)
    setDoc(ref, { uid: user.uid, name: user.displayName, online: true, lastSeen: serverTimestamp() })
    return () => {
      setDoc(ref, { uid: user.uid, name: user.displayName, online: false, lastSeen: serverTimestamp() })
    }
  }, [user, regionId])

  // Online count
  useEffect(() => {
    const q = collection(db, 'presence', regionId, 'members')
    const unsub = onSnapshot(q, (snap) => {
      const online = snap.docs.filter(d => d.data().online).length
      setOnlineCount(Math.max(online, 1))
    })
    return unsub
  }, [regionId])

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!text.trim() || !user) return
    const payload = {
      userId: user.uid,
      userName: user.displayName ?? 'User',
      userPhotoURL: user.photoURL,
      text: text.trim(),
      timestamp: serverTimestamp(),
      replyTo: replyTo ?? null,
    }
    setText('')
    setReplyTo(null)
    await addDoc(collection(db, 'messages', regionId, 'chats'), payload)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Group messages by date
  const grouped: { label: string; messages: ChatMessage[] }[] = []
  let currentLabel = ''
  for (const msg of messages) {
    const label = msg.timestamp ? formatDateLabel(msg.timestamp) : 'Today'
    if (label !== currentLabel) {
      grouped.push({ label, messages: [msg] })
      currentLabel = label
    } else {
      grouped[grouped.length - 1].messages.push(msg)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-border">
        <div>
          <h1 className="font-semibold text-foreground">{user?.region ?? 'Global'} Community Chat</h1>
          <p className="text-xs text-muted-foreground">{onlineCount} online</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {grouped.map(({ label, messages: group }) => (
          <div key={label}>
            {/* Date divider */}
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
                <div
                  key={msg.id}
                  className={`flex ${isSelf ? 'justify-end' : 'justify-start'} group mb-1`}
                  onMouseEnter={() => setHoveredId(msg.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Avatar spacer / avatar */}
                  {!isSelf && (
                    <div className="w-8 mr-2 flex-shrink-0 flex items-end">
                      {showAvatar && <Avatar name={msg.userName} photoURL={msg.userPhotoURL} size="sm" />}
                    </div>
                  )}

                  <div className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-xs lg:max-w-md`}>
                    {showAvatar && !isSelf && (
                      <span className="text-xs font-medium text-foreground mb-0.5 ml-1">{msg.userName}</span>
                    )}

                    <div className="relative">
                      {/* Reply quote */}
                      {msg.replyTo && (
                        <div className={`mb-1 px-3 py-1.5 rounded-xl text-xs ${isSelf ? 'bg-primary/80 text-white/90' : 'bg-gray-100 text-foreground'}`}>
                          <div className={`border-l-2 pl-2 ${isSelf ? 'border-white/60' : 'border-primary'}`}>
                            <p className="font-semibold">{msg.replyTo.userName}</p>
                            <p className="truncate">{truncate(msg.replyTo.text, 60)}</p>
                          </div>
                        </div>
                      )}

                      <div className={isSelf ? 'bubble-self' : 'bubble-other'}>
                        {msg.text}
                      </div>

                      <span className="text-[10px] text-muted-foreground mt-0.5 block">
                        {msg.timestamp ? formatMessageTime(msg.timestamp) : ''}
                      </span>
                    </div>
                  </div>

                  {/* Reply button */}
                  {hoveredId === msg.id && (
                    <button
                      className={`self-center mx-1 opacity-70 hover:opacity-100 text-muted-foreground ${isSelf ? 'order-first' : 'order-last'}`}
                      onClick={() => {
                        setReplyTo({ id: msg.id, userName: msg.userName, text: msg.text })
                        inputRef.current?.focus()
                      }}
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reply preview */}
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

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-border">
        <div className="flex items-end gap-2">
          <Avatar name={user?.displayName} photoURL={user?.photoURL} size="sm" className="flex-shrink-0 mb-1" />
          <div className="flex-1 flex items-end gap-2 bg-surface rounded-xl border border-border px-3 py-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={replyTo ? `Reply to ${replyTo.userName}…` : `Message ${user?.region ?? 'community'}…`}
              className="flex-1 resize-none bg-transparent text-sm outline-none max-h-32"
              style={{ minHeight: '24px' }}
            />
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
