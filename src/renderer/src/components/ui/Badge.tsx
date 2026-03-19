import React from 'react'
import { cn } from '../../utils/cn'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'muted'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        {
          default: 'bg-elevated text-text-secondary border border-border',
          success: 'bg-green-900/40 text-green-400 border border-green-800',
          danger: 'bg-red-900/40 text-red-400 border border-red-800',
          warning: 'bg-yellow-900/40 text-yellow-400 border border-yellow-800',
          info: 'bg-blue-900/40 text-blue-400 border border-blue-800',
          muted: 'bg-[#1a1d35] text-text-muted border border-border'
        }[variant],
        className
      )}
      {...props}
    />
  )
}
