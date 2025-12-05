import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
  href?: string;
}

export function Logo({ className, showText = true, size = 'md', href = '/' }: LogoProps) {
  const sizes = {
    sm: { icon: 'h-6 w-6', text: 'text-base' },
    md: { icon: 'h-8 w-8', text: 'text-lg' },
    lg: { icon: 'h-10 w-10', text: 'text-xl' },
  };

  const content = (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'rounded-lg bg-primary flex items-center justify-center',
          sizes[size].icon
        )}
      >
        <span className="text-primary-foreground font-bold text-sm">N</span>
      </div>
      {showText && (
        <span className={cn('font-semibold', sizes[size].text)}>NATS Console</span>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
