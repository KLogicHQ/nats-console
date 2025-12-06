'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { Logo } from '@/components/logo';
import { Github } from 'lucide-react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, _hasHydrated } = useAuthStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Mark as ready after mount to prevent hydration mismatch
    setIsReady(true);
  }, []);

  useEffect(() => {
    // Only redirect after hydration is complete
    if (_hasHydrated && isAuthenticated) {
      router.push('/clusters');
    }
  }, [isAuthenticated, _hasHydrated, router]);

  // Always render the same initial structure to prevent hydration mismatch
  // The loading state is handled inside the layout container
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40">
      {!isReady || !_hasHydrated ? (
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      ) : isAuthenticated ? (
        // Still loading while redirect happens
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      ) : (
        <>
          <div className="mb-8">
            <Logo size="lg" href={undefined} />
          </div>
          <div className="w-full max-w-md">{children}</div>
          <a
            href="https://github.com/KLogicHQ/nats-console"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="h-4 w-4" />
            View on GitHub
          </a>
        </>
      )}
    </div>
  );
}
