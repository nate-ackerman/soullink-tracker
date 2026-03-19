import { cn } from '../../utils/cn'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      className={cn(
        'border-2 border-border-light border-t-accent-teal rounded-full animate-spin',
        { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }[size],
        className
      )}
    />
  )
}

export function SpinnerScreen({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted">
      <Spinner size="lg" />
      {message && <p className="text-sm">{message}</p>}
    </div>
  )
}
