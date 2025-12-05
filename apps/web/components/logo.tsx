import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
  href?: string;
}

export function Logo({ className, showText = true, size = 'md', href = '/' }: LogoProps) {
  const sizes = {
    sm: { icon: 24, text: 'text-base' },
    md: { icon: 32, text: 'text-lg' },
    lg: { icon: 40, text: 'text-xl' },
  };

  const content = (
    <div className={cn('flex items-center gap-2', className)}>
      <Image
        src="/icon.svg"
        alt="NATS Console"
        width={sizes[size].icon}
        height={sizes[size].icon}
        className="rounded-lg"
      />
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
