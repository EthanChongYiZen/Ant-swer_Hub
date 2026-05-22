import React, { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, doc, updateDoc, deleteDoc,
  increment, Timestamp,
} from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { formatRelativeTime, REGION_FLAGS, ALL_REGIONS, truncate } from '../lib/utils'
import Avatar from '../components/Avatar'
import { useToast } from '../components/ui/toast'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Post {
  id: string
  title: string
  body: string
  type?: 'post' | 'poll' | 'event'
  imageUrl: string | null
  authorId: string
  authorName: string
  authorPhotoURL: string | null
  authorRegion: string | null
  regions: string[]
  replyCount: number
  // Poll
  pollOptions?: { label: string; votes: number; voterIds?: string[] }[]
  // Event
  eventRewardLabel?: string
  eventMaxWinners?: number
  eventWinners?: string[]
  createdAt: Timestamp | null
}

interface Reply {
  id: string
  body: string
  parentReplyId: string | null
  depth: number
  deleted: boolean
  authorId: string
  authorName: string
  authorPhotoURL: string | null
  authorRegion: string | null
  createdAt: Timestamp | null
}

interface ReplyTree extends Reply {
  children: ReplyTree[]
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

function buildTree(replies: Reply[]): ReplyTree[] {
  const map = new Map<string, ReplyTree>()
  for (const r of replies) map.set(r.id, { ...r, children: [] })
  const roots: ReplyTree[] = []
  for (const r of replies) {
    const node = map.get(r.id)!
    if (r.parentReplyId && map.has(r.parentReplyId)) {
      map.get(r.parentReplyId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

// ─── ReplyNode ────────────────────────────────────────────────────────────────

function ReplyNode({
  node, postId, onReply, replyingTo, canDelete, onDelete,
}: {
  node: ReplyTree
  postId: string
  onReply: (id: string, name: string, text: string) => void
  replyingTo: string | null
  canDelete: (authorId: string) => boolean
  onDelete: (id: string) => void
}) {
  return (
    <div className={node.depth >= 1 ? 'ml-8 border-l-2 border-border pl-3' : ''}>
      <div className="flex gap-2 py-2">
        <Avatar name={node.authorName} photoURL={node.authorPhotoURL} size="sm" className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{node.authorName}</span>
            {node.authorRegion && (
              <span className="text-xs text-muted-foreground">{REGION_FLAGS[node.authorRegion]} {node.authorRegion}</span>
            )}
            <span className="text-xs text-muted-foreground">{node.createdAt ? formatRelativeTime(node.createdAt) : ''}</span>
          </div>
          <p className={`text-sm mt-1 ${node.deleted ? 'text-muted-foreground italic' : 'text-foreground'}`}>
            {node.body}
          </p>
          {!node.deleted && (
            <div className="flex items-center gap-3 mt-1">
              {node.depth < 3 && (
                <button onClick={() => onReply(node.id, node.authorName, node.body)}
                  className="text-xs text-muted-foreground hover:text-primary transition font-medium">
                  Reply
                </button>
              )}
              {canDelete(node.authorId) && (
                <button onClick={() => onDelete(node.id)}
                  className="text-xs text-muted-foreground hover:text-destructive transition">
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {node.children.map(child => (
        <ReplyNode key={child.id} node={child} postId={postId} onReply={onReply}
          replyingTo={replyingTo} canDelete={canDelete} onDelete={onDelete} />
      ))}
    </div>
  )
}

// ─── Poll Widget (user-facing: vote) ─────────────────────────────────────────

function PollWidget({ post }: { post: Post }) {
  const { user } = useAuth()
  const alreadyVoted = post.pollOptions?.some(o => o.voterIds?.includes(user?.uid ?? '')) ?? false
  const [voted, setVoted] = useState(alreadyVoted)

  async function handleVote(i: number) {
    if (voted || !user) return
    const opts = post.pollOptions!.map((o, idx) =>
      idx === i
        ? { ...o, votes: o.votes + 1, voterIds: [...(o.voterIds ?? []), user.uid] }
        : o
    )
    await updateDoc(doc(db, 'posts', post.id), { pollOptions: opts })
    setVoted(true)
  }

  const total = post.pollOptions?.reduce((s, o) => s + o.votes, 0) ?? 0

  return (
    <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
      {post.pollOptions?.map((opt, i) => {
        const pct = total === 0 ? 0 : Math.round((opt.votes / total) * 100)
        return (
          <button key={i} onClick={() => handleVote(i)} disabled={voted}
            className="w-full text-left relative overflow-hidden rounded-xl border border-border px-3 py-2 hover:border-primary/40 transition disabled:opacity-80">
            <div className="absolute inset-0 bg-primary/10" style={{ width: `${pct}%` }} />
            <div className="relative flex justify-between text-sm">
              <span>{opt.label}</span>
              <span className="text-muted-foreground">{opt.votes} ({pct}%)</span>
            </div>
          </button>
        )
      })}
      {voted && <p className="text-xs text-muted-foreground">Vote recorded!</p>}
    </div>
  )
}

// ─── Event Widget (user-facing: claim reward) ────────────────────────────────

function EventWidget({ post }: { post: Post }) {
  const { user } = useAuth()
  const claimed = post.eventWinners?.includes(user?.uid ?? '') ?? false
  const full = (post.eventWinners?.length ?? 0) >= (post.eventMaxWinners ?? 50)

  async function handleClaim(e: React.MouseEvent) {
    e.stopPropagation()
    if (claimed || full || !user) return
    await updateDoc(doc(db, 'posts', post.id), {
      eventWinners: [...(post.eventWinners ?? []), user.uid],
    })
  }

  return (
    <div className="mt-3 flex items-center gap-3 p-3 bg-yellow-50 rounded-xl border border-yellow-200" onClick={e => e.stopPropagation()}>
      <span className="text-xl flex-shrink-0">🎁</span>
      <div className="flex-1">
        <p className="text-sm font-medium text-yellow-800">{post.eventRewardLabel}</p>
        <p className="text-xs text-yellow-600">
          First {post.eventMaxWinners} · {post.eventWinners?.length ?? 0} claimed
        </p>
      </div>
      <button
        onClick={handleClaim}
        disabled={claimed || full}
        className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-xl transition ${
          claimed ? 'bg-green-100 text-green-700' :
          full ? 'bg-gray-100 text-gray-400' :
          'bg-yellow-500 text-white hover:bg-yellow-600'
        }`}
      >
        {claimed ? 'Claimed!' : full ? 'Full' : 'Claim'}
      </button>
    </div>
  )
}

// ─── Post Detail ──────────────────────────────────────────────────────────────

function PostDetail({ postId, onBack }: { postId: string; onBack: () => void }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [post, setPost] = useState<Post | null>(null)
  const [replies, setReplies] = useState<Reply[]>([])
  const [replyText, setReplyText] = useState('')
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string; text: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    return onSnapshot(doc(db, 'posts', postId), snap => {
      if (snap.exists()) setPost({ id: snap.id, ...snap.data() } as Post)
    })
  }, [postId])

  useEffect(() => {
    const q = query(collection(db, 'posts', postId, 'replies'), orderBy('createdAt', 'asc'))
    return onSnapshot(q, snap => {
      setReplies(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reply)))
    })
  }, [postId])

  async function submitReply() {
    if (!replyText.trim() || !user) return
    const payload = {
      body: replyText.trim(),
      parentReplyId: replyingTo?.id ?? null,
      depth: replyingTo ? (replies.find(r => r.id === replyingTo.id)?.depth ?? 0) + 1 : 0,
      deleted: false,
      authorId: user.uid,
      authorName: user.displayName ?? 'User',
      authorPhotoURL: user.photoURL,
      authorRegion: user.region,
      createdAt: serverTimestamp(),
    }
    setReplyText('')
    setReplyingTo(null)
    await addDoc(collection(db, 'posts', postId, 'replies'), payload)
    await updateDoc(doc(db, 'posts', postId), { replyCount: increment(1) })
  }

  async function deleteReply(replyId: string) {
    await updateDoc(doc(db, 'posts', postId, 'replies', replyId), { deleted: true, body: '[deleted]' })
    await updateDoc(doc(db, 'posts', postId), { replyCount: increment(-1) })
    toast('Reply deleted', 'success')
  }

  async function saveEdit() {
    if (!editTitle.trim() || !editBody.trim()) return
    await updateDoc(doc(db, 'posts', postId), { title: editTitle, body: editBody, updatedAt: serverTimestamp() })
    setEditing(false)
    toast('Post updated', 'success')
  }

  async function deletePost() {
    await deleteDoc(doc(db, 'posts', postId))
    toast('Post deleted', 'success')
    onBack()
  }

  function canDelete(authorId: string) {
    if (!user) return false
    return user.uid === authorId || user.role === 'admin' || user.role === 'manager'
  }

  const tree = buildTree(replies)
  const postType = post?.type ?? 'post'

  if (!post) return <div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /></div>

  const regionLabel = post.regions?.includes('all') || !post.regions?.length
    ? 'All regions'
    : post.regions.join(', ')

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Forum
        </button>

        <div className="card p-6 mb-4">
          {!editing ? (
            <>
              {post.imageUrl && (
                <img src={post.imageUrl} alt={post.title} className="w-full max-h-64 object-cover rounded-xl mb-4" />
              )}
              {postType !== 'post' && (
                <span className="badge bg-primary/10 text-primary text-xs mb-2 inline-block">
                  {postType === 'poll' ? '📊 Poll' : '🎉 Event'}
                </span>
              )}
              <h1 className="text-xl font-bold text-foreground mb-2">{post.title}</h1>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Avatar name={post.authorName} photoURL={post.authorPhotoURL} size="sm" />
                <div>
                  <p className="text-sm font-medium text-foreground">{post.authorName}</p>
                  <p className="text-xs text-muted-foreground">
                    {post.authorRegion && `${REGION_FLAGS[post.authorRegion] ?? ''} ${post.authorRegion} · `}
                    {post.createdAt ? formatRelativeTime(post.createdAt) : ''}
                  </p>
                </div>
                <span className="ml-auto badge bg-gray-100 text-gray-600 text-xs">📍 {regionLabel}</span>
              </div>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">{post.body}</p>

              {/* Poll widget for users */}
              {postType === 'poll' && post.pollOptions && <PollWidget post={post} />}
              {/* Event widget for users */}
              {postType === 'event' && post.eventRewardLabel && <EventWidget post={post} />}

              {(user?.uid === post.authorId || user?.role === 'admin' || user?.role === 'manager') && (
                <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                  {user.uid === post.authorId && (
                    <button onClick={() => { setEditing(true); setEditTitle(post.title); setEditBody(post.body) }} className="btn-outline text-xs py-1.5">
                      Edit
                    </button>
                  )}
                  <button onClick={deletePost} className="text-xs px-4 py-1.5 rounded-xl border border-destructive/30 text-destructive hover:bg-destructive/5 transition">
                    Delete
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="input-wf font-semibold" />
              <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={5} className="input-wf resize-none" />
              <div className="flex gap-2">
                <button onClick={saveEdit} className="btn-primary text-xs py-1.5">Save</button>
                <button onClick={() => setEditing(false)} className="btn-ghost text-xs py-1.5">Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* Reply composer */}
        <div className="card p-4 mb-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">{post.replyCount} {post.replyCount === 1 ? 'Reply' : 'Replies'}</h2>
          {replyingTo && (
            <div className="flex items-center gap-2 mb-2 text-xs border-l-2 border-primary pl-2">
              <p className="text-muted-foreground flex-1">Replying to <strong>{replyingTo.name}</strong>: {truncate(replyingTo.text, 60)}</p>
              <button onClick={() => setReplyingTo(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
          )}
          <div className="flex gap-2">
            <Avatar name={user?.displayName} photoURL={user?.photoURL} size="sm" className="flex-shrink-0 mt-1" />
            <div className="flex-1">
              <textarea ref={inputRef} value={replyText} onChange={e => setReplyText(e.target.value)} rows={2}
                placeholder={replyingTo ? `Reply to ${replyingTo.name}…` : 'Write a reply…'}
                className="input-wf resize-none mb-2" />
              <button onClick={submitReply} disabled={!replyText.trim()} className="btn-primary text-xs py-1.5">Reply</button>
            </div>
          </div>
        </div>

        {/* Reply thread */}
        <div className="card p-4">
          {tree.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No replies yet — be the first!</p>
          ) : (
            tree.map(node => (
              <ReplyNode key={node.id} node={node} postId={postId}
                onReply={(id, name, text) => { setReplyingTo({ id, name, text }); inputRef.current?.focus() }}
                replyingTo={replyingTo?.id ?? null} canDelete={canDelete} onDelete={deleteReply} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({ post, onSelect, onDelete }: { post: Post; onSelect: () => void; onDelete: () => void }) {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const canManage = user?.uid === post.authorId
  const postType = post.type ?? 'post'

  const regionLabel = post.regions?.includes('all') || !post.regions?.length
    ? '🌍 All'
    : post.regions.slice(0, 2).map(r => REGION_FLAGS[r] ?? r).join(' ') + (post.regions.length > 2 ? ` +${post.regions.length - 2}` : '')

  return (
    <div className="card p-5 cursor-pointer hover:shadow-md transition-shadow animate-fade-in" onClick={onSelect}>
      {post.imageUrl && (
        <img src={post.imageUrl} alt={post.title} className="w-full max-h-40 object-cover rounded-xl mb-3" />
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {postType !== 'post' && (
            <span className="badge bg-primary/10 text-primary text-xs">
              {postType === 'poll' ? '📊 Poll' : '🎉 Event'}
            </span>
          )}
          <Avatar name={post.authorName} photoURL={post.authorPhotoURL} size="xs" />
          <span className="text-xs font-medium text-foreground">{post.authorName}</span>
          {post.authorRegion && (
            <span className="text-xs text-muted-foreground">{REGION_FLAGS[post.authorRegion]}</span>
          )}
          <span className="text-xs text-muted-foreground">{post.createdAt ? formatRelativeTime(post.createdAt) : ''}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground">{regionLabel}</span>
          {canManage && (
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setMenuOpen(!menuOpen)} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-gray-100">⋯</button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-card z-10 min-w-[120px]">
                  <button onClick={() => { setMenuOpen(false); onSelect() }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 rounded-t-xl">Edit</button>
                  <button onClick={() => { setMenuOpen(false); onDelete() }}
                    className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-destructive/5 rounded-b-xl">Delete</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <h2 className="font-semibold text-foreground mb-1">{post.title}</h2>
      <p className="text-sm text-muted-foreground line-clamp-2">{post.body}</p>
      {/* Poll preview */}
      {postType === 'poll' && post.pollOptions && (
        <p className="text-xs text-muted-foreground mt-2">
          {post.pollOptions.length} options · {post.pollOptions.reduce((s, o) => s + o.votes, 0)} votes
        </p>
      )}
      {/* Event preview */}
      {postType === 'event' && post.eventRewardLabel && (
        <p className="text-xs text-yellow-600 mt-2">🎁 {post.eventRewardLabel} · {post.eventWinners?.length ?? 0}/{post.eventMaxWinners} claimed</p>
      )}
      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
      </div>
    </div>
  )
}

// ─── Region Multi-Select (Forum) ──────────────────────────────────────────────

function RegionMultiSelect({
  selected,
  onChange,
  label,
}: {
  selected: string[]
  onChange: (r: string[]) => void
  label: string
}) {
  const allSelected = selected.includes('all')

  function toggle(r: string) {
    if (r === 'all') { onChange(allSelected ? [] : ['all']); return }
    if (allSelected) { onChange([r]); return }
    const without = selected.filter(x => x !== r)
    if (selected.includes(r)) onChange(without.length === 0 ? ['all'] : without)
    else onChange([...selected, r])
  }

  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <div className="border border-border rounded-xl p-3 max-h-44 overflow-y-auto space-y-0.5 bg-white">
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
      {!allSelected && selected.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1">{selected.length} region{selected.length > 1 ? 's' : ''} selected</p>
      )}
    </div>
  )
}

// ─── Forum Page ───────────────────────────────────────────────────────────────

export default function ForumPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [postRegions, setPostRegions] = useState<string[]>(['all'])
  const [filterRegions, setFilterRegions] = useState<string[]>(['all'])
  const [filterOpen, setFilterOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function openComposer() {
    setPostRegions(user?.region ? [user.region] : ['all'])
    setComposerOpen(true)
  }

  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Post)))
    })
  }, [])

  const filteredPosts = posts.filter(post => {
    if (filterRegions.includes('all')) return true
    const regions = post.regions ?? ['all']
    return regions.includes('all') || filterRegions.some(f => regions.includes(f))
  })

  async function handlePublish() {
    if (!title.trim() || !body.trim() || !user) return
    setPublishing(true)
    const finalRegions = postRegions.length === 0 ? ['all'] : postRegions
    try {
      const docRef = await addDoc(collection(db, 'posts'), {
        title: title.trim(),
        body: body.trim(),
        type: 'post',
        imageUrl: null,
        authorId: user.uid,
        authorName: user.displayName ?? 'User',
        authorPhotoURL: user.photoURL,
        authorRegion: user.region,
        regions: finalRegions,
        replyCount: 0,
        createdAt: serverTimestamp(),
      })
      if (imageFile) {
        const storageRef = ref(storage, `posts/${docRef.id}/${imageFile.name}`)
        const task = uploadBytesResumable(storageRef, imageFile)
        task.on('state_changed', snap => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100))
        task.then(async () => {
          const url = await getDownloadURL(storageRef)
          await updateDoc(docRef, { imageUrl: url })
          setUploadProgress(0)
        })
      }
      setTitle(''); setBody(''); setImageFile(null); setComposerOpen(false)
      toast('Post published!', 'success')
    } catch {
      toast('Failed to publish post', 'error')
    } finally {
      setPublishing(false)
    }
  }

  async function deletePost(id: string) {
    await deleteDoc(doc(db, 'posts', id))
    toast('Post deleted', 'success')
  }

  const filterLabel = filterRegions.includes('all')
    ? '🌍 All Regions'
    : filterRegions.length === 1
      ? `${REGION_FLAGS[filterRegions[0]] ?? ''} ${filterRegions[0]}`
      : `${filterRegions.length} regions`

  if (selectedPostId) {
    return <PostDetail postId={selectedPostId} onBack={() => setSelectedPostId(null)} />
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Discussion Forum</h1>
            <p className="text-sm text-muted-foreground">Share business insights and community updates</p>
          </div>
          {/* Region filter — button that opens multi-select dropdown */}
          <div className="relative">
            <button
              onClick={() => setFilterOpen(v => !v)}
              className="input-wf w-auto text-sm flex items-center gap-2 cursor-pointer"
            >
              <span>{filterLabel}</span>
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-border rounded-xl shadow-lg w-56">
                <div className="p-3 max-h-64 overflow-y-auto space-y-0.5">
                  <label className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded-lg hover:bg-gray-50 select-none">
                    <input type="checkbox" checked={filterRegions.includes('all')} onChange={() => setFilterRegions(['all'])} className="accent-primary w-3.5 h-3.5" />
                    <span className="text-sm font-medium">🌍 All Regions</span>
                  </label>
                  <div className="h-px bg-border my-1" />
                  {ALL_REGIONS.map(r => (
                    <label key={r} className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded-lg hover:bg-gray-50 select-none">
                      <input
                        type="checkbox"
                        checked={filterRegions.includes('all') || filterRegions.includes(r)}
                        onChange={() => {
                          if (filterRegions.includes('all')) {
                            // Switch from "All" to just this one region
                            setFilterRegions([r])
                          } else if (filterRegions.includes(r)) {
                            const without = filterRegions.filter(x => x !== r)
                            setFilterRegions(without.length === 0 ? ['all'] : without)
                          } else {
                            setFilterRegions([...filterRegions, r])
                          }
                        }}
                        className="accent-primary w-3.5 h-3.5"
                      />
                      <span className="text-sm">{REGION_FLAGS[r] ?? ''} {r}</span>
                    </label>
                  ))}
                </div>
                <div className="border-t border-border p-2">
                  <button onClick={() => setFilterOpen(false)} className="w-full text-xs text-center text-primary font-medium py-1 hover:underline">Done</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* "What's on your mind" prompt */}
        {!composerOpen && (
          <button onClick={openComposer} className="card p-4 mb-6 w-full flex items-center gap-3 hover:shadow-md transition-shadow">
            <Avatar name={user?.displayName} photoURL={user?.photoURL} size="sm" className="flex-shrink-0" />
            <span className="text-sm text-muted-foreground">What's on your mind? Write a post…</span>
          </button>
        )}

        {/* Composer */}
        {composerOpen && (
          <div className="card p-5 mb-6 animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground">New Post</h2>
              <button onClick={() => setComposerOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <input value={title} onChange={e => setTitle(e.target.value)} className="input-wf font-medium" placeholder="Title *" />
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={4} className="input-wf resize-none" placeholder="Body *" />

              {/* Region multi-select */}
              <RegionMultiSelect selected={postRegions} onChange={setPostRegions} label="Post visible to" />

              <div className="flex items-center gap-3">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="text-xs text-primary border border-primary/30 rounded-xl px-3 py-1.5 hover:bg-primary/5 transition">
                  {imageFile ? `📷 ${imageFile.name}` : '📷 Add image'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => setImageFile(e.target.files?.[0] ?? null)} />
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
              </div>
              <button onClick={handlePublish} disabled={!title.trim() || !body.trim() || publishing} className="btn-primary text-sm">
                {publishing ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          </div>
        )}

        {/* Posts */}
        <div className="space-y-4">
          {filteredPosts.map(post => (
            <PostCard key={post.id} post={post}
              onSelect={() => setSelectedPostId(post.id)}
              onDelete={() => deletePost(post.id)} />
          ))}
          {filteredPosts.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-4xl mb-3">📝</p>
              <p className="font-medium">No posts yet</p>
              <p className="text-sm">
                {filterRegions.includes('all')
                  ? 'Be the first to share something with the community'
                  : `No posts for selected region${filterRegions.length > 1 ? 's' : ''} yet`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
