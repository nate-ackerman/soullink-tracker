import { getTypeColor } from '../../data/typeColors'
import { cn } from '../../utils/cn'

interface TypeBadgeProps {
  type: string
  size?: 'sm' | 'md'
  className?: string
}

export function TypeBadge({ type, size = 'md', className }: TypeBadgeProps) {
  const color = getTypeColor(type)
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-medium rounded uppercase tracking-wide',
        size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1',
        className
      )}
      style={{ backgroundColor: color, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
    >
      {type}
    </span>
  )
}
