import * as RadixScrollArea from '@radix-ui/react-scroll-area'
import { cn } from '../../utils/cn'

interface ScrollAreaProps {
  children: React.ReactNode
  className?: string
  viewportClassName?: string
}

export function ScrollArea({ children, className, viewportClassName }: ScrollAreaProps) {
  return (
    <RadixScrollArea.Root className={cn('overflow-hidden', className)}>
      <RadixScrollArea.Viewport className={cn('h-full w-full', viewportClassName)}>
        {children}
      </RadixScrollArea.Viewport>
      <RadixScrollArea.Scrollbar
        orientation="vertical"
        className="flex select-none touch-none p-0.5 bg-transparent transition-colors w-2.5 hover:bg-elevated"
      >
        <RadixScrollArea.Thumb className="flex-1 bg-border rounded-full relative" />
      </RadixScrollArea.Scrollbar>
      <RadixScrollArea.Corner />
    </RadixScrollArea.Root>
  )
}
