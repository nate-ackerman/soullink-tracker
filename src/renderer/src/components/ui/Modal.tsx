import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../utils/cn'

interface ModalProps {
  open: boolean
  onOpenChange(open: boolean): void
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({ open, onOpenChange, title, description, children, className, size = 'md' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/70 z-50"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
                  'bg-card border border-border rounded-lg shadow-2xl',
                  'focus:outline-none max-h-[90vh] overflow-y-auto',
                  {
                    sm: 'w-full max-w-sm',
                    md: 'w-full max-w-md',
                    lg: 'w-full max-w-lg',
                    xl: 'w-full max-w-2xl'
                  }[size],
                  className
                )}
              >
                <div className="flex items-center justify-between p-4 border-b border-border">
                  {title && (
                    <Dialog.Title className="text-base font-semibold text-text-primary">
                      {title}
                    </Dialog.Title>
                  )}
                  {description && (
                    <Dialog.Description className="text-sm text-text-secondary sr-only">
                      {description}
                    </Dialog.Description>
                  )}
                  <Dialog.Close className="ml-auto text-text-muted hover:text-text-primary transition-colors p-1 rounded hover:bg-elevated">
                    <X className="w-4 h-4" />
                  </Dialog.Close>
                </div>
                <div className="p-4">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
