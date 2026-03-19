import React from 'react'
import { cn } from '../../utils/cn'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#13152a] disabled:opacity-50 disabled:cursor-not-allowed',
          {
            primary:
              'bg-accent-red hover:bg-red-600 text-white focus:ring-accent-red',
            secondary:
              'bg-elevated hover:bg-[#2e3460] text-text-primary border border-border focus:ring-border-light',
            ghost:
              'hover:bg-elevated text-text-secondary hover:text-text-primary focus:ring-border',
            danger:
              'bg-red-700 hover:bg-red-800 text-white focus:ring-red-500',
            outline:
              'border border-border-light hover:bg-elevated text-text-primary focus:ring-border-light'
          }[variant],
          {
            sm: 'text-xs px-3 py-1.5 rounded',
            md: 'text-sm px-4 py-2 rounded',
            lg: 'text-base px-6 py-3 rounded'
          }[size],
          className
        )}
        {...props}
      >
        {loading && (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
