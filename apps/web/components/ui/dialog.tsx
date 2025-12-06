'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

// Context to pass onOpenChange to DialogContent
const DialogContext = React.createContext<{ onOpenChange: (open: boolean) => void } | null>(null);

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  // Handle escape key
  React.useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <DialogContext.Provider value={{ onOpenChange }}>
      <div className="fixed inset-0 z-50">
        <div
          className="fixed inset-0 bg-black/50 animate-in fade-in-0"
          onClick={() => onOpenChange(false)}
        />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <div
            className="relative bg-background rounded-lg shadow-lg max-h-[90vh] overflow-auto animate-in fade-in-0 zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        </div>
      </div>
    </DialogContext.Provider>
  );
}

type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full' | '2xl';

const sizeClasses: Record<DialogSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-xl',
  xl: 'max-w-3xl',
  full: 'max-w-5xl',
  '2xl': 'max-w-6xl',
};

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: DialogSize;
  onClose?: () => void;
}

export function DialogContent({
  className,
  children,
  size = 'lg',
  onClose,
  ...props
}: DialogContentProps) {
  const context = React.useContext(DialogContext);
  const handleClose = onClose || (context ? () => context.onOpenChange(false) : undefined);

  return (
    <div
      className={cn('w-full p-6 relative', sizeClasses[size], className)}
      {...props}
    >
      {handleClose && (
        <Button
          variant="outline"
          size="icon"
          className="absolute right-4 top-4 h-8 w-8"
          onClick={handleClose}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      )}
      {children}
    </div>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 text-center sm:text-left mb-4 pr-10', className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6', className)}
      {...props}
    />
  );
}
