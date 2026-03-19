import { cn } from '../../utils/cn'

interface HPBarProps {
  current: number
  max: number
  className?: string
  showLabel?: boolean
}

function getHpColor(pct: number): string {
  if (pct > 50) return '#22c55e'
  if (pct > 20) return '#f59e0b'
  return '#ef4444'
}

export function HPBar({ current, max, className, showLabel }: HPBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0
  const color = getHpColor(pct)
  return (
    <div className={cn('space-y-0.5', className)}>
      {showLabel && (
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>HP</span>
          <span>
            {current}/{max}
          </span>
        </div>
      )}
      <div className="h-1.5 bg-[#1a1d35] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}
