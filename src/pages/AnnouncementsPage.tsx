import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { formatRelativeTime } from '../lib/utils'

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

const CATEGORY_STYLES: Record<string, string> = {
  promotion: 'bg-yellow-100 text-yellow-700',
  news: 'bg-blue-100 text-blue-700',
  maintenance: 'bg-red-100 text-red-700',
  campaign: 'bg-green-100 text-green-700',
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)))
    })
    return unsub
  }, [])

  const pinned = announcements.filter(a => a.pinned)
  const regular = announcements.filter(a => !a.pinned)

  return (
    <div className="h-full overflow-y-auto px-6 py-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-foreground mb-6">Announcements</h1>

      {pinned.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Pinned</p>
          <div className="space-y-4">
            {pinned.map(a => <AnnouncementCard key={a.id} announcement={a} />)}
          </div>
        </div>
      )}

      {regular.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Latest</p>
          <div className="space-y-4">
            {regular.map(a => <AnnouncementCard key={a.id} announcement={a} />)}
          </div>
        </div>
      )}

      {announcements.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">📢</p>
          <p className="font-medium">No announcements yet</p>
          <p className="text-sm">Check back soon for updates from WorldFirst</p>
        </div>
      )}
    </div>
  )
}

function AnnouncementCard({ announcement: a }: { announcement: Announcement }) {
  return (
    <div className="card p-5 animate-fade-in">
      {a.imageUrl && (
        <img src={a.imageUrl} alt={a.title} className="w-full max-h-48 object-cover rounded-xl mb-4" />
      )}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h2 className="font-semibold text-foreground text-base leading-tight">{a.title}</h2>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {a.pinned && (
            <span className="badge bg-primary/10 text-primary">📌 Pinned</span>
          )}
          {a.badge && (
            <span className="badge bg-primary text-white">{a.badge}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`badge ${CATEGORY_STYLES[a.category] ?? 'bg-gray-100 text-gray-600'}`}>
          {a.category.charAt(0).toUpperCase() + a.category.slice(1)}
        </span>
        {a.createdAt && (
          <span className="text-xs text-muted-foreground">{formatRelativeTime(a.createdAt)}</span>
        )}
      </div>
      <p className="text-sm text-foreground/80 whitespace-pre-wrap">{a.content}</p>
    </div>
  )
}
