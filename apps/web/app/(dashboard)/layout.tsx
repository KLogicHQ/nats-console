'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { Sidebar } from '@/components/layout/sidebar';

export default function DashboardLayout({
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
    if (_hasHydrated && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, _hasHydrated, router]);

  // Always render the same container to prevent hydration mismatch
  return (
    <div className="flex h-screen">
      {!isReady || !_hasHydrated ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : !isAuthenticated ? (
        // Still loading while redirect happens
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          <Sidebar />
          <main className="flex-1 overflow-auto bg-white">
            <div className="p-6">{children}</div>
          </main>
        </>
      )}
    </div>
  );
}
