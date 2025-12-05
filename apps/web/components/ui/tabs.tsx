'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  paramName?: string;
  className?: string;
}

interface TabsListProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

interface TabsContentProps {
  tabId: string;
  activeTab: string;
  children: React.ReactNode;
  className?: string;
}

export function useTabs(tabs: Tab[], defaultTab?: string, paramName = 'tab') {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = useMemo(() => {
    const paramValue = searchParams.get(paramName);
    if (paramValue && tabs.some(t => t.id === paramValue)) {
      return paramValue;
    }
    return defaultTab || tabs[0]?.id || '';
  }, [searchParams, paramName, tabs, defaultTab]);

  const setActiveTab = useCallback((tabId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, tabId);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, paramName, pathname, router]);

  return { activeTab, setActiveTab };
}

export function TabsList({ tabs, activeTab, onTabChange, className }: TabsListProps) {
  return (
    <div className={cn('border-b', className)}>
      <nav className="flex gap-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function TabsContent({ tabId, activeTab, children, className }: TabsContentProps) {
  if (tabId !== activeTab) {
    return null;
  }

  return <div className={className}>{children}</div>;
}

export function Tabs({ tabs, defaultTab, paramName = 'tab', className }: TabsProps & { children: React.ReactNode }) {
  const { activeTab, setActiveTab } = useTabs(tabs, defaultTab, paramName);

  return (
    <div className={className}>
      <TabsList tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
