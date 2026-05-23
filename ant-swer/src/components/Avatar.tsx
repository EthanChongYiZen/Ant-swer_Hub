import { useMemo } from 'react'
import { cn } from '../lib/utils'

interface AvatarProps {
  name?: string | null
  photoURL?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  online?: boolean
  className?: string
}

const SIZE_MAP = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
}

const COLORS = [
  'bg-rose-500',
  'bg-violet-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
]

function nameHash(name: string): number {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

export default function Avatar({ name, photoURL, size = 'md', online, className }: AvatarProps) {
  const initials = useMemo(() => {
    if (!name) return '?'
    return name.trim().slice(0, 2).toUpperCase()
  }, [name])

  const color = useMemo(() => {
    if (!name) return COLORS[0]
    return COLORS[nameHash(name) % COLORS.length]
  }, [name])

  const sizeClass = SIZE_MAP[size]

  return (
    <div className={cn('relative inline-flex items-center justify-center flex-shrink-0', className)}>
      {photoURL ? (
        <img
          src={photoURL}
          alt={name ?? 'avatar'}
          className={cn('rounded-full object-cover', sizeClass)}
        />
      ) : (
        <div className={cn('rounded-full font-semibold text-white flex items-center justify-center', sizeClass, color)}>
          {initials}
        </div>
      )}
      {online !== undefined && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-white',
            size === 'xs' || size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5',
            online ? 'bg-success' : 'bg-gray-400'
          )}
        />
      )}
    </div>
  )
}
