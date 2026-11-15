import React, { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  Check,
  CheckCheck,
  ExternalLink,
  MapPin,
  MessageCircle,
  Send,
  ShoppingBag,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { apiFetch } from '../lib/api';
import type { ChatConversationItem, ChatMessageItem } from '../types/app';
import { SafeImage } from './BusinessCard';
import { Link, navigate } from './RouterLink';

export interface StorefrontChatProduct {
  id: string;
  name: string;
  price: string | number;
  discountPrice?: string | number | null;
  image?: string | null;
}

interface StorefrontChatDrawerProps {
  open: boolean;
  onClose: () => void;
  business: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
    coverUrl?: string | null;
    isVerified?: boolean;
    city?: string | null;
  };
  initialProduct?: StorefrontChatProduct | null;
}

const STARTER_PROMPTS = [
  'Is this available today?',
  'What are your current hours?',
  'Can I reserve or pick this up?',
];

export const StorefrontChatDrawer: React.FC<StorefrontChatDrawerProps> = ({
  open,
  onClose,
  business,
  initialProduct,
}) => {
  const { firebaseUser, profile } = useAuth();
  const { subscribeChatEvents, pushToast, refreshUnreadChatCount } = useRealtime();

  const [conversation, setConversation] = useState<ChatConversationItem | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [attachedProduct, setAttachedProduct] = useState<StorefrontChatProduct | null>(
    initialProduct || null
  );

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const lastTypingEmitRef = useRef<number>(0);

  useEffect(() => {
    setAttachedProduct(initialProduct || null);
  }, [initialProduct]);

  useEffect(() => {
    if (!open || !firebaseUser) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const startRes = await apiFetch<{ conversation: ChatConversationItem }>(
          '/api/chat/conversations',
          {
            method: 'POST',
            body: JSON.stringify({ businessId: business.id }),
          }
        );
        if (cancelled) return;
        const conv = startRes.conversation;
        setConversation(conv);

        const msgRes = await apiFetch<{ messages: ChatMessageItem[] }>(
          `/api/chat/conversations/${conv.id}/messages`
        );
        if (cancelled) return;
        setMessages(msgRes.messages || []);
        void refreshUnreadChatCount();
      } catch (err) {
        if (!cancelled) {
          pushToast({ title: (err as Error).message || 'Could not open chat', variant: 'error' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, firebaseUser, business.id, pushToast, refreshUnreadChatCount]);

  useEffect(() => {
    if (!open || !conversation) return;
    const unsub = subscribeChatEvents((ev) => {
      if (ev.conversationId !== conversation.id) return;
      if (ev.event === 'chat:message') {
        setMessages((prev) => {
          if (prev.some((m) => m.id === ev.message.id)) return prev;
          return [...prev, ev.message];
        });
        setOtherTyping(false);
        if (ev.message.senderId !== profile?.id) {
          void apiFetch(`/api/chat/conversations/${conversation.id}/read`, {
            method: 'POST',
          }).catch(() => {});
        }
      } else if (ev.event === 'chat:typing' && ev.senderId !== profile?.id) {
        setOtherTyping(ev.isTyping);
        if (ev.isTyping) {
          if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
          typingTimerRef.current = window.setTimeout(() => setOtherTyping(false), 3500);
        }
      } else if (ev.event === 'chat:read' && ev.readerId !== profile?.id) {
        setMessages((prev) => prev.map((m) => ({ ...m, isRead: true })));
      }
    });
    return () => {
      unsub();
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    };
  }, [open, conversation, profile?.id, subscribeChatEvents]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, otherTyping, open]);

  const emitTyping = (isTyping: boolean) => {
    if (!conversation) return;
    const now = Date.now();
    if (isTyping && now - lastTypingEmitRef.current < 1500) return;
    lastTypingEmitRef.current = now;
    void apiFetch(`/api/chat/conversations/${conversation.id}/typing`, {
      method: 'POST',
      body: JSON.stringify({ isTyping }),
    }).catch(() => {});
  };

  const handleSend = async (e?: React.FormEvent, overrideText?: string) => {
    e?.preventDefault();
    if (!conversation || !firebaseUser) return;
    const text = (overrideText ?? draft).trim();
    if (!text) return;
    setSending(true);
    emitTyping(false);
    try {
      const payload = {
        text,
        attachmentType: attachedProduct ? ('product' as const) : null,
        attachmentData: attachedProduct
          ? {
              id: attachedProduct.id,
              name: attachedProduct.name,
              price: Number(attachedProduct.discountPrice ?? attachedProduct.price),
              image: attachedProduct.image || null,
              slug: business.slug,
            }
          : null,
      };
      const res = await apiFetch<{ message: ChatMessageItem }>(
        `/api/chat/conversations/${conversation.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
      if (!overrideText) setDraft('');
      setAttachedProduct(null);
    } catch (err) {
      pushToast({ title: (err as Error).message || 'Message failed', variant: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:p-4 bg-black/50 backdrop-blur-xs">
          <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
          <motion.div
            initial={{ y: '100%', opacity: 0.7 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative z-10 w-full sm:max-w-md h-[84vh] sm:h-[620px] rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Mobile Drag Handle */}
            <div className="sm:hidden pt-2.5 flex justify-center">
              <span className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 shrink-0">
                  <SafeImage
                    src={business.logoUrl || business.coverUrl}
                    alt={business.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                      {business.name}
                    </h3>
                    {business.isVerified && (
                      <BadgeCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {otherTyping ? 'Typing...' : business.city ? `Live Storefront Chat · ${business.city}` : 'Live Storefront Chat'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {conversation && (
                  <Link
                    to={`/messages?conv=${conversation.id}`}
                    onClick={onClose}
                    aria-label="Open full inbox"
                    className="min-w-[36px] min-h-[36px] rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close chat"
                  className="min-w-[36px] min-h-[36px] rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!firebaseUser ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
                <MessageCircle className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                <h4 className="font-display text-base font-bold">Sign in to message {business.name}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                  Ask about live stock, bookings, pricing, or directions directly in real-time chat.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate('/login');
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
                >
                  Sign in with Google
                </button>
              </div>
            ) : (
              <>
                {/* Message Thread */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50/70 dark:bg-slate-950/50">
                  {loading ? (
                    <div className="space-y-3">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className={`h-11 rounded-2xl animate-pulse ${
                            i % 2 === 0
                              ? 'w-2/3 bg-slate-200 dark:bg-slate-800'
                              : 'w-1/2 ml-auto bg-blue-100 dark:bg-blue-950/40'
                          }`}
                        />
                      ))}
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-8 text-center space-y-3">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Start a live conversation with {business.name}.
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {STARTER_PROMPTS.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => void handleSend(undefined, prompt)}
                            className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-200 hover:border-blue-500 transition-colors"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((m) => {
                      const mine = m.senderId === profile?.id;
                      const prodData =
                        m.attachmentType === 'product' && m.attachmentData ? m.attachmentData : null;
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                        >
                          {prodData && (
                            <Link
                              to={`/b/${business.slug}/p/${String(prodData.id || '')}`}
                              onClick={onClose}
                              className="mb-1 max-w-[82%] p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5 text-left hover:border-blue-500 transition-colors"
                            >
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                                <SafeImage
                                  src={prodData.image ? String(prodData.image) : undefined}
                                  alt={String(prodData.name || 'Item')}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate text-slate-900 dark:text-white">
                                  {String(prodData.name || 'Catalogue Item')}
                                </p>
                                <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                                  ₹{Number(prodData.price || 0).toLocaleString()}
                                </p>
                              </div>
                            </Link>
                          )}

                          {m.attachmentType === 'location' && m.attachmentData && (
                            <div className="mb-1 max-w-[82%] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs">
                              <MapPin className="w-4 h-4 text-emerald-500 shrink-0" />
                              <span className="truncate">
                                {String(m.attachmentData.label || business.name)}
                              </span>
                            </div>
                          )}

                          <div
                            className={`max-w-[82%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed ${
                              mine
                                ? 'bg-blue-600 text-white rounded-br-sm'
                                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-sm'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.text}</p>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400 tabular-nums">
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
                  <div ref={listEndRef} />
                </div>

                {/* Attached Product Preview */}
                {attachedProduct && (
                  <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <ShoppingBag className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="font-semibold truncate">{attachedProduct.name}</span>
                      <span className="text-slate-500 tabular-nums">
                        ₹{Number(attachedProduct.discountPrice ?? attachedProduct.price).toLocaleString()}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachedProduct(null)}
                      aria-label="Remove product attachment"
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Composer */}
                <form
                  onSubmit={(e) => void handleSend(e)}
                  className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2"
                >
                  <input
                    type="text"
                    maxLength={1500}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      emitTyping(Boolean(e.target.value.trim()));
                    }}
                    placeholder={`Message ${business.name}...`}
                    className="flex-1 h-10 px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    aria-label="Send message"
                    className="min-w-[40px] h-10 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center disabled:opacity-45 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
