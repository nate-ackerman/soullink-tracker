import { cn } from '../../utils/cn'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-8 text-center gap-3', className)}>
      {icon && <div className="text-text-muted opacity-50">{icon}</div>}
      <div className="space-y-1">
        <p className="text-sm font-medium text-text-secondary">{title}</p>
        {description && <p className="text-xs text-text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}
