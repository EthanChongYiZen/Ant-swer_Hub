import React, { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, doc, updateDoc, deleteDoc, getDoc,
  increment, Timestamp,
} from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { formatRelativeTime, REGION_FLAGS, truncate } from '../lib/utils'
import Avatar from '../components/Avatar'
import { useToast } from '../components/ui/toast'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Post {
  id: string
  title: string
  body: string
  imageUrl: string | null
  authorId: string
  authorName: string
  authorPhotoURL: string | null
  authorRegion: string | null
  replyCount: number
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
                <button
                  onClick={() => onReply(node.id, node.authorName, node.body)}
                  className="text-xs text-muted-foreground hover:text-primary transition font-medium"
                >
                  Reply
                </button>
              )}
              {canDelete(node.authorId) && (
                <button
                  onClick={() => onDelete(node.id)}
                  className="text-xs text-muted-foreground hover:text-destructive transition"
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {node.children.map(child => (
        <ReplyNode
          key={child.id}
          node={child}
          postId={postId}
          onReply={onReply}
          replyingTo={replyingTo}
          canDelete={canDelete}
          onDelete={onDelete}
        />
      ))}
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
    const unsub = onSnapshot(doc(db, 'posts', postId), snap => {
      if (snap.exists()) setPost({ id: snap.id, ...snap.data() } as Post)
    })
    return unsub
  }, [postId])

  useEffect(() => {
    const q = query(collection(db, 'posts', postId, 'replies'), orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(q, snap => {
      setReplies(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reply)))
    })
    return unsub
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

  if (!post) return <div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /></div>

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Posts
        </button>

        <div className="card p-6 mb-4">
          {!editing ? (
            <>
              {post.imageUrl && (
                <img src={post.imageUrl} alt={post.title} className="w-full max-h-64 object-cover rounded-xl mb-4" />
              )}
              <h1 className="text-xl font-bold text-foreground mb-2">{post.title}</h1>
              <div className="flex items-center gap-2 mb-4">
                <Avatar name={post.authorName} photoURL={post.authorPhotoURL} size="sm" />
                <div>
                  <p className="text-sm font-medium text-foreground">{post.authorName}</p>
                  <p className="text-xs text-muted-foreground">
                    {post.authorRegion && `${REGION_FLAGS[post.authorRegion]} ${post.authorRegion} · `}
                    {post.createdAt ? formatRelativeTime(post.createdAt) : ''}
                  </p>
                </div>
              </div>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">{post.body}</p>
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
              <textarea
                ref={inputRef}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                rows={2}
                placeholder={replyingTo ? `Reply to ${replyingTo.name}…` : 'Write a reply…'}
                className="input-wf resize-none mb-2"
              />
              <button onClick={submitReply} disabled={!replyText.trim()} className="btn-primary text-xs py-1.5">
                Reply
              </button>
            </div>
          </div>
        </div>

        {/* Reply thread */}
        <div className="card p-4">
          {tree.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No replies yet — be the first!</p>
          ) : (
            tree.map(node => (
              <ReplyNode
                key={node.id}
                node={node}
                postId={postId}
                onReply={(id, name, text) => {
                  setReplyingTo({ id, name, text })
                  inputRef.current?.focus()
                }}
                replyingTo={replyingTo?.id ?? null}
                canDelete={canDelete}
                onDelete={deleteReply}
              />
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

  return (
    <div className="card p-5 cursor-pointer hover:shadow-md transition-shadow animate-fade-in" onClick={onSelect}>
      {post.imageUrl && (
        <img src={post.imageUrl} alt={post.title} className="w-full max-h-40 object-cover rounded-xl mb-3" />
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Avatar name={post.authorName} photoURL={post.authorPhotoURL} size="xs" />
          <div>
            <span className="text-xs font-medium text-foreground">{post.authorName}</span>
            {post.authorRegion && (
              <span className="text-xs text-muted-foreground ml-1.5">{REGION_FLAGS[post.authorRegion]}</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{post.createdAt ? formatRelativeTime(post.createdAt) : ''}</span>
        </div>
        {canManage && (
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setMenuOpen(!menuOpen)} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-gray-100">
              ⋯
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-card z-10 min-w-[120px]">
                <button
                  onClick={() => { setMenuOpen(false); onSelect() }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 rounded-t-xl"
                >
                  Edit
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete() }}
                  className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-destructive/5 rounded-b-xl"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <h2 className="font-semibold text-foreground mb-1">{post.title}</h2>
      <p className="text-sm text-muted-foreground line-clamp-3">{post.body}</p>
      <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
      </div>
    </div>
  )
}

// ─── Blog Page ────────────────────────────────────────────────────────────────

export default function BlogPage() {
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
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Post)))
    })
    return unsub
  }, [])

  async function handlePublish() {
    if (!title.trim() || !body.trim() || !user) return
    setPublishing(true)
    try {
      const docRef = await addDoc(collection(db, 'posts'), {
        title: title.trim(),
        body: body.trim(),
        imageUrl: null,
        authorId: user.uid,
        authorName: user.displayName ?? 'User',
        authorPhotoURL: user.photoURL,
        authorRegion: user.region,
        replyCount: 0,
        createdAt: serverTimestamp(),
      })

      if (imageFile) {
        const storageRef = ref(storage, `posts/${docRef.id}/${imageFile.name}`)
        const task = uploadBytesResumable(storageRef, imageFile)
        task.on('state_changed', snap => {
          setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100)
        })
        task.then(async () => {
          const url = await getDownloadURL(storageRef)
          await updateDoc(docRef, { imageUrl: url })
          setUploadProgress(0)
        })
      }

      setTitle('')
      setBody('')
      setImageFile(null)
      setComposerOpen(false)
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

  if (selectedPostId) {
    return <PostDetail postId={selectedPostId} onBack={() => setSelectedPostId(null)} />
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Posts</h1>
            <p className="text-sm text-muted-foreground">Global community · All regions</p>
          </div>
        </div>

        {/* "What's on your mind" prompt */}
        {!composerOpen && (
          <button onClick={() => setComposerOpen(true)} className="card p-4 mb-6 w-full flex items-center gap-3 hover:shadow-md transition-shadow">
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
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="input-wf font-medium"
                placeholder="Title *"
              />
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={4}
                className="input-wf resize-none"
                placeholder="Body *"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-xs text-primary border border-primary/30 rounded-xl px-3 py-1.5 hover:bg-primary/5 transition"
                >
                  {imageFile ? `📷 ${imageFile.name}` : '📷 Add image'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => setImageFile(e.target.files?.[0] ?? null)} />
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={handlePublish} disabled={!title.trim() || !body.trim() || publishing} className="btn-primary text-sm">
                  {publishing ? 'Publishing…' : 'Publish'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Posts */}
        <div className="space-y-4">
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onSelect={() => setSelectedPostId(post.id)}
              onDelete={() => deletePost(post.id)}
            />
          ))}
          {posts.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-4xl mb-3">📝</p>
              <p className="font-medium">No posts yet</p>
              <p className="text-sm">Be the first to share something with the community</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
