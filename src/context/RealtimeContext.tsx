import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { ChatConversationItem, ChatMessageItem } from '../types/app';
import { useAuth } from './AuthContext';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  isRead: boolean;
  createdAt: string;
}

export interface ToastItem {
  id: string;
  title: string;
  body?: string;
  variant?: 'default' | 'success' | 'error';
  link?: string;
}

export type ChatSocketEvent =
  | {
      event: 'chat:message';
      conversationId: string;
      businessId: string;
      businessName: string;
      senderName: string;
      message: ChatMessageItem;
    }
  | {
      event: 'chat:typing';
      conversationId: string;
      senderId: string;
      isTyping: boolean;
    }
  | {
      event: 'chat:read';
      conversationId: string;
      readerId: string;
    };

interface RealtimeContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  unreadChatCount: number;
  connected: boolean;
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;
  markAllRead: () => Promise<void>;
  markOneRead: (id: string) => Promise<void>;
  requestBrowserPush: () => Promise<NotificationPermission | 'unsupported'>;
  refreshUnreadChatCount: () => Promise<void>;
  subscribeChatEvents: (listener: (ev: ChatSocketEvent) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  notifications: [],
  unreadCount: 0,
  unreadChatCount: 0,
  connected: false,
  toasts: [],
  pushToast: () => {},
  dismissToast: () => {},
  markAllRead: async () => {},
  markOneRead: async () => {},
  requestBrowserPush: async () => 'unsupported',
  refreshUnreadChatCount: async () => {},
  subscribeChatEvents: () => () => {},
});

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser, profile } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const chatListenersRef = useRef<Set<(ev: ChatSocketEvent) => void>>(new Set());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [{ ...toast, id }, ...prev].slice(0, 4));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!firebaseUser) {
      setNotifications([]);
      return;
    }
    try {
      const data = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
      setNotifications(data.notifications);
    } catch {
      // Ignore
    }
  }, [firebaseUser]);

  const refreshUnreadChatCount = useCallback(async () => {
    if (!firebaseUser) {
      setUnreadChatCount(0);
      return;
    }
    try {
      const data = await apiFetch<{ conversations: ChatConversationItem[] }>('/api/chat/conversations');
      const total = (data.conversations || []).reduce((acc, c) => acc + Number(c.unreadCount || 0), 0);
      setUnreadChatCount(total);
    } catch {
      // Ignore
    }
  }, [firebaseUser]);

  useEffect(() => {
    void loadNotifications();
    void refreshUnreadChatCount();
  }, [loadNotifications, refreshUnreadChatCount]);

  const subscribeChatEvents = useCallback((listener: (ev: ChatSocketEvent) => void) => {
    chatListenersRef.current.add(listener);
    return () => {
      chatListenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let url = `${proto}//${window.location.host}/ws`;
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          url += `?token=${encodeURIComponent(token)}`;
        } catch {
          // Ignore
        }
      }
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!closed) setConnected(true);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.event === 'notification:new' && msg.notification) {
            const incoming = msg.notification as NotificationItem;
            setNotifications((prev) => {
              if (prev.some((n) => n.id === incoming.id)) return prev;
              return [incoming, ...prev];
            });
            pushToast({
              title: incoming.title,
              body: incoming.body,
              variant: 'success',
              link: incoming.link,
            });
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification(incoming.title, {
                body: incoming.body,
                icon: '/pwa-192x192.png',
              });
            }
          } else if (
            msg.event === 'chat:message' ||
            msg.event === 'chat:typing' ||
            msg.event === 'chat:read'
          ) {
            const chatEv = msg as ChatSocketEvent;
            for (const listener of chatListenersRef.current) {
              listener(chatEv);
            }
            if (chatEv.event === 'chat:message' || chatEv.event === 'chat:read') {
              void refreshUnreadChatCount();
            }
          }
        } catch {
          // Ignore malformed message
        }
      };

      ws.onclose = () => {
        if (!closed) {
          setConnected(false);
          reconnectTimer = setTimeout(connect, 4000);
        }
      };
    }

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [firebaseUser, profile?.id, pushToast, refreshUnreadChatCount]);

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    if (firebaseUser) {
      await apiFetch('/api/notifications/read', { method: 'POST', body: JSON.stringify({}) }).catch(
        () => {}
      );
    }
  };

  const markOneRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    if (firebaseUser) {
      await apiFetch('/api/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ id }),
      }).catch(() => {});
    }
  };

  const requestBrowserPush = async () => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return await Notification.requestPermission();
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <RealtimeContext.Provider
      value={{
        notifications,
        unreadCount,
        unreadChatCount,
        connected,
        toasts,
        pushToast,
        dismissToast,
        markAllRead,
        markOneRead,
        requestBrowserPush,
        refreshUnreadChatCount,
        subscribeChatEvents,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = () => useContext(RealtimeContext);
