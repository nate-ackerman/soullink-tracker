import * as RadixSwitch from '@radix-ui/react-switch'
import { cn } from '../../utils/cn'

interface SwitchProps {
  checked: boolean
  onCheckedChange(checked: boolean): void
  label?: string
  description?: string
  disabled?: boolean
  id?: string
}

export function Switch({ checked, onCheckedChange, label, description, disabled, id }: SwitchProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <label htmlFor={id} className="text-sm font-medium text-text-primary cursor-pointer">
              {label}
            </label>
          )}
          {description && <p className="text-xs text-text-muted">{description}</p>}
        </div>
      )}
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
          'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent-teal focus:ring-offset-2 focus:ring-offset-[#13152a]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-accent-teal' : 'bg-border'
        )}
      >
        <RadixSwitch.Thumb
          className={cn(
            'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg',
            'ring-0 transition-transform duration-200 ease-in-out',
            checked ? 'translate-x-4' : 'translate-x-0'
          )}
        />
      </RadixSwitch.Root>
    </div>
  )
}
