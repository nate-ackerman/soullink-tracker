import { cn } from '../../utils/cn'

interface ProgressBarProps {
  value: number
  max?: number
  color?: string
  className?: string
  label?: string
  showPercent?: boolean
}

export function ProgressBar({ value, max = 100, color = '#38b2ac', className, label, showPercent }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className={cn('space-y-1', className)}>
      {(label || showPercent) && (
        <div className="flex justify-between text-xs text-text-secondary">
          {label && <span>{label}</span>}
          {showPercent && <span>{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="h-2 bg-[#1a1d35] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}
