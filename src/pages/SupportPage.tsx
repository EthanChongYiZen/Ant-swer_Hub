import React, { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, setDoc, doc, updateDoc, getDocs, Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { formatMessageTime, truncate } from '../lib/utils'
import Avatar from '../components/Avatar'
import { useToast } from '../components/ui/toast'

interface SupportMessage {
  id: string
  senderId: string
  senderName: string
  text: string
  timestamp: Timestamp | null
  replyTo: { id: string; senderName: string; text: string } | null
}

interface SupportThread {
  id: string
  userId: string
  userName: string
  status: 'open' | 'resolved'
  lastMessage: string
  updatedAt: Timestamp | null
}

interface ReplyState {
  id: string
  senderName: string
  text: string
}

export default function SupportPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'manager'

  return isAdmin
    ? <AdminSupportView />
    : <UserSupportView />
}

function UserSupportView() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<ReplyState | null>(null)
  const [status, setStatus] = useState<'open' | 'resolved'>('open')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'supportChats', user.uid, 'messages'), orderBy('timestamp', 'asc'))
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportMessage)))
    })
    return unsub
  }, [user])

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'supportChats', user.uid), snap => {
      if (snap.exists()) setStatus(snap.data().status ?? 'open')
    })
    return unsub
  }, [user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!text.trim() || !user) return
    const payload = {
      senderId: user.uid,
      senderName: user.displayName ?? 'User',
      text: text.trim(),
      timestamp: serverTimestamp(),
      replyTo: replyTo ?? null,
    }
    const t = text.trim()
    setText('')
    setReplyTo(null)
    await addDoc(collection(db, 'supportChats', user.uid, 'messages'), payload)
    await setDoc(doc(db, 'supportChats', user.uid), {
      userId: user.uid,
      userName: user.displayName ?? 'User',
      status: 'open',
      lastMessage: t,
      updatedAt: serverTimestamp(),
    }, { merge: true })
    toast('Message sent', 'success')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-border">
        <div>
          <h1 className="font-semibold text-foreground">Support Chat</h1>
          <p className="text-xs text-muted-foreground">WorldFirst support team</p>
        </div>
        <span className={`badge ${status === 'open' ? 'bg-success/10 text-success' : 'bg-gray-100 text-gray-500'}`}>
          {status === 'open' ? 'Open' : 'Resolved'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-3xl mb-2">💬</p>
            <p className="font-medium text-sm">Send a message to start the conversation</p>
            <p className="text-xs mt-1">Our support team will reply shortly</p>
          </div>
        )}
        {messages.map(msg => {
          const isSelf = msg.senderId === user?.uid
          return (
            <div
              key={msg.id}
              className={`flex ${isSelf ? 'justify-end' : 'justify-start'} group`}
              onMouseEnter={() => setHoveredId(msg.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {!isSelf && <Avatar name={msg.senderName} size="sm" className="mr-2 flex-shrink-0 self-end" />}
              <div className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-xs lg:max-w-md`}>
                {!isSelf && <span className="text-xs font-medium text-foreground mb-0.5 ml-1">{msg.senderName}</span>}
                {msg.replyTo && (
                  <div className={`mb-1 px-3 py-1.5 rounded-xl text-xs ${isSelf ? 'bg-primary/80 text-white/90' : 'bg-gray-100'}`}>
                    <div className={`border-l-2 pl-2 ${isSelf ? 'border-white/60' : 'border-primary'}`}>
                      <p className="font-semibold">{msg.replyTo.senderName}</p>
                      <p className="truncate">{truncate(msg.replyTo.text, 60)}</p>
                    </div>
                  </div>
                )}
                <div className={isSelf ? 'bubble-self' : 'bubble-other'}>{msg.text}</div>
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  {msg.timestamp ? formatMessageTime(msg.timestamp) : ''}
                </span>
              </div>
              {hoveredId === msg.id && (
                <button
                  className={`self-center mx-1 opacity-70 hover:opacity-100 text-muted-foreground ${isSelf ? 'order-first' : 'order-last'}`}
                  onClick={() => {
                    setReplyTo({ id: msg.id, senderName: msg.senderName, text: msg.text })
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
        <div ref={bottomRef} />
      </div>

      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-t border-primary/20">
          <div className="flex-1 border-l-2 border-primary pl-2 text-xs">
            <p className="font-semibold text-primary">{replyTo.senderName}</p>
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
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={replyTo ? `Reply to ${replyTo.senderName}…` : 'Describe your issue…'}
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

function AdminSupportView() {
  const { user } = useAuth()
  const [threads, setThreads] = useState<SupportThread[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<ReplyState | null>(null)
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
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportMessage)))
    })
    return unsub
  }, [selectedId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendReply() {
    if (!text.trim() || !selectedId || !user) return
    const payload = {
      senderId: user.uid,
      senderName: `${user.displayName ?? 'Admin'} (Support)`,
      text: text.trim(),
      timestamp: serverTimestamp(),
      replyTo: replyTo ?? null,
    }
    const t = text.trim()
    setText('')
    setReplyTo(null)
    await addDoc(collection(db, 'supportChats', selectedId, 'messages'), payload)
    await updateDoc(doc(db, 'supportChats', selectedId), { lastMessage: t, updatedAt: serverTimestamp() })
  }

  async function markResolved(id: string) {
    await updateDoc(doc(db, 'supportChats', id), { status: 'resolved' })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendReply()
    }
  }

  const openThreads = threads.filter(t => t.status === 'open')
  const resolvedThreads = threads.filter(t => t.status === 'resolved')
  const selectedThread = threads.find(t => t.id === selectedId)

  return (
    <div className="flex h-full">
      {/* Thread list */}
      <div className="w-72 flex-shrink-0 border-r border-border bg-white overflow-y-auto">
        <div className="px-4 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Support Inbox</h2>
          <p className="text-xs text-muted-foreground">{openThreads.length} open</p>
        </div>
        {openThreads.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-4 pt-3 pb-1">Open</p>
            {openThreads.map(t => <ThreadItem key={t.id} thread={t} selected={selectedId === t.id} onClick={() => setSelectedId(t.id)} />)}
          </div>
        )}
        {resolvedThreads.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-4 pt-3 pb-1">Resolved</p>
            {resolvedThreads.map(t => <ThreadItem key={t.id} thread={t} selected={selectedId === t.id} onClick={() => setSelectedId(t.id)} />)}
          </div>
        )}
        {threads.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No support chats yet</div>
        )}
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-3xl mb-2">📬</p>
              <p className="font-medium">Select a conversation</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-border">
              <div>
                <p className="font-semibold text-foreground">{selectedThread?.userName}</p>
                <span className={`badge ${selectedThread?.status === 'open' ? 'bg-success/10 text-success' : 'bg-gray-100 text-gray-500'}`}>
                  {selectedThread?.status}
                </span>
              </div>
              {selectedThread?.status === 'open' && (
                <button onClick={() => markResolved(selectedId)} className="btn-outline text-xs py-1.5">
                  Mark Resolved
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {messages.map(msg => {
                const isSelf = msg.senderId === user?.uid
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isSelf ? 'justify-end' : 'justify-start'} group`}
                    onMouseEnter={() => setHoveredId(msg.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {!isSelf && <Avatar name={msg.senderName} size="sm" className="mr-2 flex-shrink-0 self-end" />}
                    <div className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-xs lg:max-w-md`}>
                      {!isSelf && <span className="text-xs font-medium mb-0.5 ml-1">{msg.senderName}</span>}
                      {msg.replyTo && (
                        <div className={`mb-1 px-3 py-1.5 rounded-xl text-xs ${isSelf ? 'bg-primary/80 text-white/90' : 'bg-gray-100'}`}>
                          <div className={`border-l-2 pl-2 ${isSelf ? 'border-white/60' : 'border-primary'}`}>
                            <p className="font-semibold">{msg.replyTo.senderName}</p>
                            <p className="truncate">{truncate(msg.replyTo.text, 60)}</p>
                          </div>
                        </div>
                      )}
                      <div className={isSelf ? 'bubble-self' : 'bubble-other'}>{msg.text}</div>
                      <span className="text-[10px] text-muted-foreground mt-0.5">
                        {msg.timestamp ? formatMessageTime(msg.timestamp) : ''}
                      </span>
                    </div>
                    {hoveredId === msg.id && (
                      <button
                        className={`self-center mx-1 opacity-70 hover:opacity-100 text-muted-foreground ${isSelf ? 'order-first' : 'order-last'}`}
                        onClick={() => {
                          setReplyTo({ id: msg.id, senderName: msg.senderName, text: msg.text })
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
              <div ref={bottomRef} />
            </div>

            {replyTo && (
              <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-t border-primary/20">
                <div className="flex-1 border-l-2 border-primary pl-2 text-xs">
                  <p className="font-semibold text-primary">{replyTo.senderName}</p>
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
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={replyTo ? `Reply to ${replyTo.senderName}…` : 'Reply to user…'}
                    className="flex-1 resize-none bg-transparent text-sm outline-none max-h-32"
                    style={{ minHeight: '24px' }}
                  />
                </div>
                <button onClick={sendReply} disabled={!text.trim()} className="btn-primary px-3 py-2 mb-1">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ThreadItem({ thread, selected, onClick }: { thread: SupportThread; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 hover:bg-surface transition ${selected ? 'bg-primary/5' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm text-foreground truncate">{thread.userName}</span>
        <span className={`badge flex-shrink-0 ${thread.status === 'open' ? 'bg-success/10 text-success' : 'bg-gray-100 text-gray-500'}`}>
          {thread.status}
        </span>
      </div>
      <p className="text-xs text-muted-foreground truncate mt-0.5">{thread.lastMessage}</p>
    </button>
  )
}
