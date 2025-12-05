'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '@/stores/auth';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface WebSocketMessage {
  type: string;
  channel?: string;
  data?: any;
  timestamp?: number;
}

type MessageHandler = (data: any, channel: string) => void;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const subscribedChannels = useRef<Set<string>>(new Set());
  const messageHandlers = useRef<Map<string, Set<MessageHandler>>>(new Map());

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  const { accessToken, isAuthenticated } = useAuthStore();

  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000;

  const connect = useCallback(() => {
    if (!accessToken || !isAuthenticated) {
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');

    const ws = new WebSocket(`${WS_URL}?token=${accessToken}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttempts.current = 0;

      // Resubscribe to channels
      subscribedChannels.current.forEach((channel) => {
        ws.send(JSON.stringify({ type: 'subscribe', channel }));
      });
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        setLastMessage(message);

        if (message.type === 'message' && message.channel) {
          const handlers = messageHandlers.current.get(message.channel);
          handlers?.forEach((handler) => handler(message.data, message.channel!));

          // Also notify wildcard handlers
          const wildcardHandlers = messageHandlers.current.get('*');
          wildcardHandlers?.forEach((handler) => handler(message.data, message.channel!));
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;

      // Attempt reconnection
      if (isAuthenticated && reconnectAttempts.current < maxReconnectAttempts) {
        const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts.current);
        reconnectAttempts.current += 1;
        setStatus('reconnecting');

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [accessToken, isAuthenticated]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus('disconnected');
    reconnectAttempts.current = 0;
  }, []);

  const subscribe = useCallback((channel: string, handler?: MessageHandler) => {
    subscribedChannels.current.add(channel);

    if (handler) {
      if (!messageHandlers.current.has(channel)) {
        messageHandlers.current.set(channel, new Set());
      }
      messageHandlers.current.get(channel)!.add(handler);
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', channel }));
    }

    // Return unsubscribe function
    return () => {
      if (handler) {
        messageHandlers.current.get(channel)?.delete(handler);
      }
    };
  }, []);

  const unsubscribe = useCallback((channel: string) => {
    subscribedChannels.current.delete(channel);
    messageHandlers.current.delete(channel);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', channel }));
    }
  }, []);

  const send = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Auto-connect when authenticated
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, accessToken, connect, disconnect]);

  return {
    status,
    isConnected: status === 'connected',
    lastMessage,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    send,
  };
}

// Singleton instance for global access
let globalWsInstance: ReturnType<typeof useWebSocket> | null = null;

export function getWebSocketInstance(): ReturnType<typeof useWebSocket> | null {
  return globalWsInstance;
}
