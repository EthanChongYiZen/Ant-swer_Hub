import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns'
import { Timestamp } from 'firebase/firestore'

export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ')
}

export function formatRelativeTime(date: Date | Timestamp): string {
  const d = date instanceof Timestamp ? date.toDate() : date
  return formatDistanceToNow(d, { addSuffix: true })
}

export function formatMessageTime(date: Date | Timestamp): string {
  const d = date instanceof Timestamp ? date.toDate() : date
  return format(d, 'HH:mm')
}

export function formatDateLabel(date: Date | Timestamp): string {
  const d = date instanceof Timestamp ? date.toDate() : date
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMMM d, yyyy')
}

export function isSameDay(a: Date | Timestamp, b: Date | Timestamp): boolean {
  const da = a instanceof Timestamp ? a.toDate() : a
  const db = b instanceof Timestamp ? b.toDate() : b
  return format(da, 'yyyy-MM-dd') === format(db, 'yyyy-MM-dd')
}

export function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + '…' : str
}

export const REGION_FLAGS: Record<string, string> = {
  Malaysia: '🇲🇾',
  Singapore: '🇸🇬',
  China: '🇨🇳',
  'Hong Kong': '🇭🇰',
  Japan: '🇯🇵',
  'South Korea': '🇰🇷',
  Taiwan: '🇹🇼',
  Thailand: '🇹🇭',
  Vietnam: '🇻🇳',
  Philippines: '🇵🇭',
  Indonesia: '🇮🇩',
  India: '🇮🇳',
  Australia: '🇦🇺',
  'New Zealand': '🇳🇿',
  Bangladesh: '🇧🇩',
  Pakistan: '🇵🇰',
  'United Kingdom': '🇬🇧',
  Germany: '🇩🇪',
  France: '🇫🇷',
  Spain: '🇪🇸',
  Italy: '🇮🇹',
  Netherlands: '🇳🇱',
  Poland: '🇵🇱',
  Sweden: '🇸🇪',
  Switzerland: '🇨🇭',
  'United States': '🇺🇸',
  Canada: '🇨🇦',
  Mexico: '🇲🇽',
  Brazil: '🇧🇷',
  UAE: '🇦🇪',
  'Saudi Arabia': '🇸🇦',
  Qatar: '🇶🇦',
  Kuwait: '🇰🇼',
  'South Africa': '🇿🇦',
  Nigeria: '🇳🇬',
  Kenya: '🇰🇪',
}

export const ALL_REGIONS = Object.keys(REGION_FLAGS)
