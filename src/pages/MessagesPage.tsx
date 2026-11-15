import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCheck,
  MapPin,
  MessageCircle,
  Package,
  Search,
  Send,
  Store,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { apiFetch } from '../lib/api';
import { buildGoogleMapsDirectionsUrl } from '../lib/maps';
import type { ChatConversationItem, ChatMessageItem } from '../types/app';
import { SafeImage } from '../components/BusinessCard';
import { Link, navigate, usePathname } from '../components/RouterLink';

interface ThreadProduct {
  id: string;
  name: string;
  price: string;
  discountPrice: string | null;
  images: string[] | null;
  type: 'product' | 'service';
}

interface ThreadBusiness {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  coverUrl: string | null;
  isVerified: boolean;
  area: string | null;
  city: string | null;
  lat: number;
  lng: number;
  googleMapsUrl: string | null;
}

export const MessagesPage: React.FC = () => {
  const { search } = usePathname();
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const { subscribeChatEvents, pushToast, refreshUnreadChatCount, connected } = useRealtime();

  const [conversations, setConversations] = useState<ChatConversationItem[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [roleFilter, setRoleFilter] = useState<'all' | 'customer' | 'owner'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedId, setSelectedId] = useState<string>(() => {
    return new URLSearchParams(search).get('conv') || '';
  });
  const [activeConv, setActiveConv] = useState<ChatConversationItem | null>(null);
  const [threadBiz, setThreadBiz] = useState<ThreadBusiness | null>(null);
  const [threadProducts, setThreadProducts] = useState<ThreadProduct[]>([]);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [attachPickerOpen, setAttachPickerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ThreadProduct | null>(null);
  const [attachLocation, setAttachLocation] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const lastTypingEmitRef = useRef<number>(0);

  const loadConversations = useCallback(async () => {
    if (!firebaseUser) {
      setConversations([]);
      setLoadingConvs(false);
      return;
    }
    try {
      const res = await apiFetch<{ conversations: ChatConversationItem[] }>('/api/chat/conversations');
      const list = res.conversations || [];
      setConversations(list);
      if (!selectedId && list.length > 0 && window.innerWidth >= 768) {
        setSelectedId(list[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingConvs(false);
    }
  }, [firebaseUser, selectedId]);

  useEffect(() => {
    if (!authLoading) {
      void loadConversations();
    }
  }, [authLoading, loadConversations]);

  useEffect(() => {
    if (!selectedId || !firebaseUser) {
      setActiveConv(null);
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingThread(true);
    setOtherTyping(false);
    apiFetch<{
      conversation: ChatConversationItem;
      business: ThreadBusiness;
      products: ThreadProduct[];
      messages: ChatMessageItem[];
    }>(`/api/chat/conversations/${selectedId}/messages`)
      .then((res) => {
        if (cancelled) return;
        setActiveConv(res.conversation);
        setThreadBiz(res.business);
        setThreadProducts(res.products || []);
        setMessages(res.messages || []);
        setConversations((prev) =>
          prev.map((c) => (c.id === res.conversation.id ? { ...c, unreadCount: 0 } : c))
        );
        void refreshUnreadChatCount();
      })
      .catch((err) => {
        if (!cancelled) {
          pushToast({ title: (err as Error).message || 'Could not load thread', variant: 'error' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingThread(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, firebaseUser, pushToast, refreshUnreadChatCount]);

  useEffect(() => {
    const unsub = subscribeChatEvents((ev) => {
      if (ev.event === 'chat:message') {
        setConversations((prev) => {
          const exists = prev.some((c) => c.id === ev.conversationId);
          if (!exists) {
            void loadConversations();
            return prev;
          }
          const updated = prev.map((c) => {
            if (c.id !== ev.conversationId) return c;
            const isCurrentlyOpen = selectedId === ev.conversationId;
            return {
              ...c,
              lastMessageText: ev.message.text,
              lastMessageAt: ev.message.createdAt,
              unreadCount:
                isCurrentlyOpen || ev.message.senderId === profile?.id
                  ? 0
                  : c.unreadCount + 1,
            };
          });
          return updated.sort(
            (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
          );
        });

        if (selectedId === ev.conversationId) {
          setMessages((prev) =>
            prev.some((m) => m.id === ev.message.id) ? prev : [...prev, ev.message]
          );
          setOtherTyping(false);
          if (ev.message.senderId !== profile?.id) {
            void apiFetch(`/api/chat/conversations/${ev.conversationId}/read`, {
              method: 'POST',
            }).catch(() => {});
          }
        }
      } else if (ev.event === 'chat:typing' && ev.conversationId === selectedId && ev.senderId !== profile?.id) {
        setOtherTyping(ev.isTyping);
        if (ev.isTyping) {
          if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = window.setTimeout(() => setOtherTyping(false), 3500);
        }
      } else if (ev.event === 'chat:read' && ev.conversationId === selectedId && ev.readerId !== profile?.id) {
        setMessages((prev) => prev.map((m) => ({ ...m, isRead: true })));
      }
    });
    return () => {
      unsub();
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    };
  }, [selectedId, profile?.id, subscribeChatEvents, loadConversations]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, otherTyping]);

  const emitTyping = (isTyping: boolean) => {
    if (!selectedId) return;
    const now = Date.now();
    if (isTyping && now - lastTypingEmitRef.current < 1500) return;
    lastTypingEmitRef.current = now;
    void apiFetch(`/api/chat/conversations/${selectedId}/typing`, {
      method: 'POST',
      body: JSON.stringify({ isTyping }),
    }).catch(() => {});
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    const clean = draft.trim();
    if (!clean) return;
    setSending(true);
    emitTyping(false);
    try {
      const attachmentType = selectedProduct ? 'product' : attachLocation ? 'location' : null;
      const attachmentData = selectedProduct
        ? {
            id: selectedProduct.id,
            name: selectedProduct.name,
            price: Number(selectedProduct.discountPrice ?? selectedProduct.price),
            image: selectedProduct.images?.[0] || null,
            slug: threadBiz?.slug || '',
          }
        : attachLocation && threadBiz
          ? {
              label: [threadBiz.name, threadBiz.area, threadBiz.city].filter(Boolean).join(' · '),
              url: buildGoogleMapsDirectionsUrl(threadBiz.lat, threadBiz.lng, threadBiz.googleMapsUrl),
            }
          : null;

      const res = await apiFetch<{ message: ChatMessageItem }>(
        `/api/chat/conversations/${selectedId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ text: clean, attachmentType, attachmentData }),
        }
      );
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
      setDraft('');
      setSelectedProduct(null);
      setAttachLocation(false);
    } catch (err) {
      pushToast({ title: (err as Error).message || 'Could not send message', variant: 'error' });
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return conversations.filter((c) => {
      if (roleFilter === 'customer' && c.viewerRole !== 'customer') return false;
      if (roleFilter === 'owner' && c.viewerRole !== 'owner') return false;
      if (!q) return true;
      return (
        c.businessName.toLowerCase().includes(q) ||
        c.customerName.toLowerCase().includes(q) ||
        (c.lastMessageText || '').toLowerCase().includes(q)
      );
    });
  }, [conversations, roleFilter, searchQuery]);

  if (!authLoading && !firebaseUser) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <MessageCircle className="w-10 h-10 mx-auto text-blue-600 dark:text-blue-400" />
        <h1 className="mt-4 font-display text-2xl font-bold">Live Storefront Messages</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Sign in to chat directly with local businesses, share catalogue items, and get real-time updates.
        </p>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="mt-6 px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold"
        >
          Sign in to open inbox
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-6 py-3 sm:py-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden grid md:grid-cols-12 h-[calc(100dvh-8.5rem)] md:h-[calc(100vh-5rem)]">
        {/* Left Conversations List */}
        <aside
          className={`md:col-span-4 border-r border-slate-200 dark:border-slate-800 flex flex-col min-h-0 ${
            selectedId ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="font-display text-lg font-bold">Messages</h1>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {connected ? 'Live' : 'Reconnecting'}
              </span>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search storefronts or customers..."
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
              {(
                [
                  ['all', 'All'],
                  ['customer', 'Shopping'],
                  ['owner', 'Storefront'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRoleFilter(key)}
                  className={`flex-1 py-1.5 rounded-md font-semibold transition-colors ${
                    roleFilter === key
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {loadingConvs ? (
              <div className="p-4 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                ))}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <MessageCircle className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  No conversations yet
                </p>
                <p className="text-xs text-slate-500">
                  Visit any storefront and tap Message to start a live chat.
                </p>
                <Link
                  to="/search"
                  className="inline-block mt-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
                >
                  Explore Storefronts
                </Link>
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isSelected = c.id === selectedId;
                const counterpartName = c.viewerRole === 'owner' ? c.customerName : c.businessName;
                const counterpartAvatar =
                  c.viewerRole === 'owner' ? c.customerAvatar : c.businessLogo;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-4 py-3.5 flex items-center gap-3 transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="w-11 h-11 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0">
                      <SafeImage
                        src={counterpartAvatar}
                        alt={counterpartName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold truncate flex items-center gap-1 text-slate-900 dark:text-white">
                          <span className="truncate">{counterpartName}</span>
                          {c.viewerRole === 'customer' && c.businessVerified && (
                            <BadgeCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          )}
                        </p>
                        <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                          {new Date(c.lastMessageAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {c.viewerRole === 'owner' ? `${c.businessName} · ` : ''}
                          {c.lastMessageText || 'Say hello...'}
                        </p>
                        {c.unreadCount > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums shrink-0">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Active Chat Thread */}
        <section
          className={`md:col-span-8 flex flex-col min-h-0 ${
            selectedId ? 'flex' : 'hidden md:flex'
          }`}
        >
          {!selectedId || !activeConv ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Store className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3" />
              <h2 className="font-display text-base font-bold">Select a conversation</h2>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                Reply to customer enquiries in real time or message local businesses directly.
              </p>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedId('')}
                    aria-label="Back to conversations"
                    className="md:hidden min-w-[36px] min-h-[36px] rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0">
                    <SafeImage
                      src={
                        activeConv.viewerRole === 'owner'
                          ? activeConv.customerAvatar
                          : activeConv.businessLogo
                      }
                      alt={
                        activeConv.viewerRole === 'owner'
                          ? activeConv.customerName
                          : activeConv.businessName
                      }
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {activeConv.viewerRole === 'owner' && activeConv.customerHandle ? (
                        <Link
                          to={`/u/${activeConv.customerHandle}`}
                          className="font-display text-sm font-bold hover:underline truncate"
                        >
                          {activeConv.customerName}
                        </Link>
                      ) : (
                        <Link
                          to={`/b/${activeConv.businessSlug}`}
                          className="font-display text-sm font-bold hover:underline truncate"
                        >
                          {activeConv.viewerRole === 'owner'
                            ? activeConv.customerName
                            : activeConv.businessName}
                        </Link>
                      )}
                      {activeConv.viewerRole === 'customer' && activeConv.businessVerified && (
                        <BadgeCheck className="w-4 h-4 text-blue-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {otherTyping
                        ? 'Typing...'
                        : activeConv.viewerRole === 'owner'
                          ? `Enquiring about ${activeConv.businessName}`
                          : [threadBiz?.area, threadBiz?.city].filter(Boolean).join(', ') || 'Storefront Chat'}
                    </p>
                  </div>
                </div>

                <Link
                  to={`/b/${activeConv.businessSlug}`}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  View Storefront
                </Link>
              </div>

              {/* Messages Scroll Area */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50/70 dark:bg-slate-950/50">
                {loadingThread ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-12 w-2/3 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <p className="py-12 text-center text-xs text-slate-500">
                    No messages yet. Say hello to start chatting!
                  </p>
                ) : (
                  messages.map((m) => {
                    const mine = m.senderId === profile?.id;
                    const prodData =
                      m.attachmentType === 'product' && m.attachmentData ? m.attachmentData : null;
                    const locData =
                      m.attachmentType === 'location' && m.attachmentData ? m.attachmentData : null;

                    return (
                      <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                        {prodData && (
                          <Link
                            to={`/b/${activeConv.businessSlug}/p/${String(prodData.id || '')}`}
                            className="mb-1 max-w-xs p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5 hover:border-blue-500 transition-colors"
                          >
                            <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                              <SafeImage
                                src={prodData.image ? String(prodData.image) : undefined}
                                alt={String(prodData.name || 'Item')}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">
                                {String(prodData.name || 'Item')}
                              </p>
                              <p className="text-xs font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                                ₹{Number(prodData.price || 0).toLocaleString()}
                              </p>
                            </div>
                          </Link>
                        )}

                        {locData && (
                          <a
                            href={String(locData.url || '#')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mb-1 max-w-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs hover:border-emerald-500"
                          >
                            <MapPin className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="truncate font-medium">
                              {String(locData.label || activeConv.businessName)}
                            </span>
                          </a>
                        )}

                        <div
                          className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-xs sm:text-[13px] leading-relaxed ${
                            mine
                              ? 'bg-blue-600 text-white rounded-br-sm'
                              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-sm'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 tabular-nums">
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {mine &&
                            (m.isRead ? (
                              <CheckCheck className="w-3 h-3 text-blue-500" />
                            ) : (
                              <Check className="w-3 h-3" />
                            ))}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={endRef} />
              </div>

              {/* Attachment Picker Popover */}
              {attachPickerOpen && (
                <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Share product or location pin</span>
                    <button
                      type="button"
                      onClick={() => setAttachPickerOpen(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {threadBiz && (
                      <button
                        type="button"
                        onClick={() => {
                          setAttachLocation(true);
                          setSelectedProduct(null);
                          setAttachPickerOpen(false);
                        }}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium inline-flex items-center gap-1.5 shrink-0 hover:border-emerald-500"
                      >
                        <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Store Location Pin</span>
                      </button>
                    )}
                    {threadProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedProduct(p);
                          setAttachLocation(false);
                          setAttachPickerOpen(false);
                        }}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium inline-flex items-center gap-2 shrink-0 hover:border-blue-500"
                      >
                        <Package className="w-3.5 h-3.5 text-blue-500" />
                        <span className="max-w-[140px] truncate">{p.name}</span>
                        <span className="tabular-nums font-bold">
                          ₹{Number(p.discountPrice ?? p.price).toLocaleString()}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Attachment Pill */}
              {(selectedProduct || attachLocation) && (
                <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-blue-50/50 dark:bg-blue-950/20 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">
                    {selectedProduct
                      ? `Attached: ${selectedProduct.name} (₹${Number(selectedProduct.discountPrice ?? selectedProduct.price).toLocaleString()})`
                      : `Attached: Store Location Pin (${threadBiz?.name})`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProduct(null);
                      setAttachLocation(false);
                    }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Composer */}
              <form
                onSubmit={handleSend}
                className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
              >
                <button
                  type="button"
                  onClick={() => setAttachPickerOpen((v) => !v)}
                  aria-label="Attach product or location"
                  className="min-w-[40px] h-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Package className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  maxLength={1500}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    emitTyping(Boolean(e.target.value.trim()));
                  }}
                  placeholder="Write a message..."
                  className="flex-1 h-10 px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  aria-label="Send message"
                  className="min-w-[44px] h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-45"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
