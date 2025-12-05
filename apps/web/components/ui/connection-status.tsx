'use client';

import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useWebSocketContext } from '@/components/providers/websocket-provider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ConnectionStatus() {
  const { status, isConnected } = useWebSocketContext();

  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          icon: Wifi,
          color: 'text-green-500',
          label: 'Connected',
          description: 'Real-time updates active',
        };
      case 'connecting':
        return {
          icon: Loader2,
          color: 'text-yellow-500 animate-spin',
          label: 'Connecting',
          description: 'Establishing connection...',
        };
      case 'reconnecting':
        return {
          icon: Loader2,
          color: 'text-yellow-500 animate-spin',
          label: 'Reconnecting',
          description: 'Attempting to reconnect...',
        };
      case 'disconnected':
      default:
        return {
          icon: WifiOff,
          color: 'text-muted-foreground',
          label: 'Disconnected',
          description: 'Real-time updates unavailable',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted transition-colors">
            <Icon className={`h-4 w-4 ${config.color}`} />
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {config.label}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{config.label}</p>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
