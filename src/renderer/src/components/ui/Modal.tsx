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
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  'fixed inset-x-0 top-[5vh] mx-auto z-50',
                  'bg-card border border-border rounded-lg shadow-2xl',
                  'focus:outline-none max-h-[90vh] overflow-hidden flex flex-col',
                  {
                    sm: 'w-full max-w-sm',
                    md: 'w-full max-w-md',
                    lg: 'w-full max-w-lg',
                    xl: 'w-full max-w-2xl'
                  }[size],
                  className
                )}
              >
                <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
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
                <div className="p-4 flex flex-col flex-1 min-h-0">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
