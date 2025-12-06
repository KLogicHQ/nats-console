'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  displayValue: string;
  setDisplayValue: (value: string) => void;
  registerItem: (value: string, label: string) => void;
  itemLabels: Map<string, string>;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}

export function Select({ value, onValueChange, children }: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const [displayValue, setDisplayValue] = React.useState('');
  const itemLabelsRef = React.useRef<Map<string, string>>(new Map());

  const registerItem = React.useCallback((itemValue: string, label: string) => {
    itemLabelsRef.current.set(itemValue, label);
    // Update display value if this is the currently selected item
    if (itemValue === value) {
      setDisplayValue(label);
    }
  }, [value]);

  // Use useLayoutEffect for synchronous updates before paint
  React.useLayoutEffect(() => {
    const label = itemLabelsRef.current.get(value);
    if (label) {
      setDisplayValue(label);
    }
  }, [value]);

  return (
    <SelectContext.Provider value={{
      value,
      onValueChange,
      open,
      setOpen,
      displayValue,
      setDisplayValue,
      registerItem,
      itemLabels: itemLabelsRef.current
    }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export function SelectTrigger({ className, children, ...props }: SelectTriggerProps) {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error('SelectTrigger must be used within Select');

  return (
    <button
      type="button"
      className={cn(
        'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      onClick={() => context.setOpen(!context.open)}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  );
}

interface SelectValueProps {
  placeholder?: string;
}

export function SelectValue({ placeholder }: SelectValueProps) {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error('SelectValue must be used within Select');

  const showPlaceholder = !context.value || !context.displayValue;

  return (
    <span className={showPlaceholder ? 'text-muted-foreground' : ''}>
      {context.displayValue || placeholder}
    </span>
  );
}

interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function SelectContent({ className, children, ...props }: SelectContentProps) {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error('SelectContent must be used within Select');

  // Always render children in a hidden container to allow item registration
  // This fixes the issue where items don't register until dropdown is opened
  if (!context.open) {
    return <div className="sr-only" aria-hidden="true">{children}</div>;
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => context.setOpen(false)} />
      <div
        className={cn(
          'absolute z-50 min-w-[8rem] w-full mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95',
          className
        )}
        {...props}
      >
        <div className="p-1">{children}</div>
      </div>
    </>
  );
}

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  children: React.ReactNode;
}

export function SelectItem({ className, value, children, ...props }: SelectItemProps) {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error('SelectItem must be used within Select');

  const isSelected = context.value === value;

  // Extract text content from children for display
  const getTextContent = (node: React.ReactNode): string => {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(getTextContent).join('');
    if (React.isValidElement(node)) {
      const props = node.props as { children?: React.ReactNode };
      if (props.children) {
        return getTextContent(props.children);
      }
    }
    return '';
  };

  const label = getTextContent(children);

  // Register this item's label on mount and when label changes
  // Use useLayoutEffect for synchronous registration before paint
  React.useLayoutEffect(() => {
    context.registerItem(value, label);
  }, [value, label, context.registerItem]);

  return (
    <div
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
        isSelected && 'bg-accent text-accent-foreground',
        className
      )}
      onClick={() => {
        context.onValueChange(value);
        context.setDisplayValue(label);
        context.setOpen(false);
      }}
      {...props}
    >
      {children}
    </div>
  );
}
