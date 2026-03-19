import * as RadixTooltip from '@radix-ui/react-tooltip'
import { cn } from '../../utils/cn'

interface TooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

export function Tooltip({ children, content, side = 'top', className }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={4}
            className={cn(
              'z-50 px-2 py-1.5 text-xs rounded bg-elevated border border-border text-text-primary shadow-lg',
              'animate-in fade-in-0 zoom-in-95',
              className
            )}
          >
            {content}
            <RadixTooltip.Arrow className="fill-elevated" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  )
}
