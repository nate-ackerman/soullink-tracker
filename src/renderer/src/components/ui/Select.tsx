import React from 'react'
import { cn } from '../../utils/cn'
import { ChevronDown } from 'lucide-react'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string; group?: string }[]
  placeholder?: string
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder, id, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    // Group options
    const grouped: Record<string, typeof options> = {}
    const ungrouped: typeof options = []
    for (const opt of options) {
      if (opt.group) {
        if (!grouped[opt.group]) grouped[opt.group] = []
        grouped[opt.group].push(opt)
      } else {
        ungrouped.push(opt)
      }
    }

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-xs font-medium text-text-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full bg-input border border-border rounded px-3 py-2 text-sm text-text-primary',
              'appearance-none pr-8',
              'focus:outline-none focus:ring-1 focus:ring-border-light focus:border-border-light',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error && 'border-red-500',
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {ungrouped.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            {Object.entries(grouped).map(([group, opts]) => (
              <optgroup key={group} label={group}>
                {opts.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'
