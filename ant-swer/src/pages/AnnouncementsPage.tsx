import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { formatRelativeTime, REGION_FLAGS } from '../lib/utils'

interface Announcement {
  id: string
  title: string
  content: string
  category: 'promotion' | 'news' | 'maintenance' | 'campaign'
  pinned: boolean
  badge?: string
  imageUrl?: string
  region: string  // 'all' or specific region name (legacy single-region field)
  regions?: string[]  // multi-region array (newer)
  linkLabel?: string
  linkUrl?: string
  createdAt: Timestamp | null
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

export default function AnnouncementsPage() {
  const { user } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)))
    })
    return unsub
  }, [])

  // Filter: show global + user's region announcements
  // Supports both legacy `region` string and new `regions[]` array
  const userRegion = user?.region ?? null
  const visible = announcements.filter(a => {
    const regions = a.regions && a.regions.length > 0 ? a.regions : [a.region ?? 'all']
    return regions.includes('all') || (userRegion ? regions.includes(userRegion) : false)
  })

  const pinned = visible.filter(a => a.pinned)
  const regular = visible.filter(a => !a.pinned)

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Announcements</h1>
          {userRegion && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {REGION_FLAGS[userRegion] ?? ''} Showing updates for {userRegion} and global
            </p>
          )}
        </div>
      </div>

      {pinned.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">📌 Pinned</p>
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

      {visible.length === 0 && (
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
  // Build region display from the newer `regions[]` or fall back to legacy `region`
  const regionList = a.regions && a.regions.length > 0 ? a.regions : [a.region ?? 'all']
  const showRegion = !regionList.includes('all')

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
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={`badge ${CATEGORY_STYLES[a.category] ?? 'bg-gray-100 text-gray-600'}`}>
          {CATEGORY_EMOJIS[a.category] ?? ''} {a.category.charAt(0).toUpperCase() + a.category.slice(1)}
        </span>
        {showRegion && (
          <span className="badge bg-gray-100 text-gray-600 text-xs">
            {regionList.slice(0, 3).map(r => `${REGION_FLAGS[r] ?? ''} ${r}`).join(', ')}
            {regionList.length > 3 ? ` +${regionList.length - 3}` : ''}
          </span>
        )}
        {a.createdAt && (
          <span className="text-xs text-muted-foreground">{formatRelativeTime(a.createdAt)}</span>
        )}
      </div>
      <p className="text-sm text-foreground/80 whitespace-pre-wrap">{a.content}</p>
      {a.linkLabel && a.linkUrl && (
        <div className="mt-4">
          <a
            href={a.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary/90 transition"
          >
            {a.linkLabel}
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      )}
    </div>
  )
}
