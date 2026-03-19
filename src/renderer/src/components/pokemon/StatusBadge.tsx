import { cn } from '../../utils/cn'

interface StatusBadgeProps {
  status: 'alive' | 'dead' | 'boxed' | 'released'
  className?: string
}

const STATUS_CONFIG = {
  alive: { label: 'Alive', className: 'bg-green-900/40 text-green-400 border-green-800' },
  dead: { label: 'Dead', className: 'bg-red-900/40 text-red-400 border-red-800' },
  boxed: { label: 'Boxed', className: 'bg-blue-900/40 text-blue-400 border-blue-800' },
  released: { label: 'Released', className: 'bg-gray-700/40 text-gray-400 border-gray-600' }
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  )
}
