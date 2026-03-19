import * as RadixTabs from '@radix-ui/react-tabs'
import { cn } from '../../utils/cn'

interface Tab {
  id: string
  label: string
  icon?: React.ReactNode
}

interface TabsProps {
  tabs: Tab[]
  value: string
  onValueChange(value: string): void
  children: React.ReactNode
  className?: string
}

export function Tabs({ tabs, value, onValueChange, children, className }: TabsProps) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={cn('flex flex-col', className)}>
      <RadixTabs.List className="flex border-b border-border gap-1 px-1">
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.id}
            value={tab.id}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors',
              'border-b-2 border-transparent -mb-px',
              'text-text-muted hover:text-text-secondary',
              'data-[state=active]:text-text-primary data-[state=active]:border-accent-teal',
              'focus:outline-none'
            )}
          >
            {tab.icon}
            {tab.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  )
}

export const TabContent = RadixTabs.Content
