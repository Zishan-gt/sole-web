import React, { useEffect, useState } from 'react';
import {
  Bell,
  Bookmark,
  Compass,
  Download,
  Film,
  Home,
  LogOut,
  MessageCircle,
  Moon,
  PlusSquare,
  Shield,
  Store,
  Sun,
  User,
  X,
} from 'lucide-react';
import { BRAND_CONFIG } from '../config/brand';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useRealtime } from '../context/RealtimeContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { getT } from '../i18n/translations';
import { Link, navigate, usePathname } from './RouterLink';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = usePathname();
  const { profile, signOut } = useAuth();
  const { dark, toggleTheme, locale, setLocale } = useTheme();
  const {
    notifications,
    unreadCount,
    unreadChatCount,
    toasts,
    dismissToast,
    markAllRead,
    markOneRead,
    requestBrowserPush,
  } = useRealtime();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [accountOpen, setAccountOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const t = getT(locale);

  const isReelsRoute = pathname === '/reels';

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const navItems = [
    { to: '/', label: 'Home', icon: Home, active: pathname === '/' },
    {
      to: '/search',
      label: 'Explore',
      icon: Compass,
      active: pathname.startsWith('/search') || pathname.startsWith('/category') || pathname.startsWith('/city'),
    },
    { to: '/reels', label: 'Reels', icon: Film, active: pathname === '/reels' },
    { to: '/messages', label: 'Messages', icon: MessageCircle, active: pathname.startsWith('/messages'), badge: unreadChatCount },
    { to: '/saved', label: t.nav.saved, icon: Bookmark, active: pathname === '/saved' },
    {
      to: profile ? '/dashboard/posts' : '/login',
      label: 'Create',
      icon: PlusSquare,
      active: pathname === '/dashboard/posts',
    },
    {
      to: '/dashboard',
      label: t.nav.dashboard,
      icon: Store,
      active: pathname.startsWith('/dashboard') && pathname !== '/dashboard/posts',
    },
    ...(profile?.role === 'admin'
      ? [{ to: '/admin', label: t.nav.admin, icon: Shield, active: pathname.startsWith('/admin') }]
      : []),
  ];

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Instagram-Style Left Sidebar Rail */}
      <aside className="hidden md:flex flex-col justify-between sticky top-0 h-screen w-20 lg:w-64 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 px-3 lg:px-4 py-5 z-30">
        <div className="space-y-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 px-2.5 py-1.5 font-display text-xl font-extrabold tracking-tight text-slate-900 dark:text-white"
          >
            <span className="w-8 h-8 rounded-[9px] bg-neutral-950 dark:bg-neutral-900 ring-1 ring-black/15 dark:ring-white/20 shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
              <svg
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-7 h-7"
                aria-hidden="true"
              >
                {/* Isometric faceted cube backdrop (Cursor-style depth) */}
                <path d="M16 3.5L26.8 9.75L16 16L5.2 9.75Z" fill="#FFFFFF" fillOpacity="0.09" />
                <path d="M5.2 9.75L16 16V28.5L5.2 22.25Z" fill="#FFFFFF" fillOpacity="0.03" />
                <path d="M26.8 9.75V22.25L16 28.5V16Z" fill="#FFFFFF" fillOpacity="0.14" />

                {/* 3D Isometric Geometric "S" — Top Crown (lit plane) */}
                <path
                  d="M16 6L23.2 10.2L20.6 11.7L16 9L11.8 11.4L8.8 10.2Z"
                  fill="#FFFFFF"
                />
                {/* Upper-Left Vertical Wall (mid-tone plane) */}
                <path
                  d="M8.8 10.2L11.8 11.4V14.3L8.8 16Z"
                  fill="#CBD5E1"
                />
                {/* Center Isometric Diagonal Bridge (lit top + bevel) */}
                <path
                  d="M8.8 16L11.8 14.3L23.2 20.9L20.2 22.6Z"
                  fill="#F8FAFC"
                />
                {/* Lower-Right Wall & Bottom Return (shaded facets) */}
                <path
                  d="M23.2 20.9V22.8L16 27L16 23.9L20.2 21.5Z"
                  fill="#94A3B8"
                />
                {/* Bottom-Left Hook (crisp highlight) */}
                <path
                  d="M16 27L8.8 22.8L11.4 21.3L16 23.9Z"
                  fill="#E2E8F0"
                />
              </svg>
            </span>
            <span className="hidden lg:inline">{BRAND_CONFIG.name}</span>
          </Link>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const badge = 'badge' in item ? Number(item.badge || 0) : 0;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center justify-center lg:justify-start gap-3.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    item.active
                      ? 'bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 font-medium'
                  }`}
                >
                  <div className="relative shrink-0">
                    <Icon className={`w-5 h-5 ${item.active ? 'stroke-[2.5]' : ''}`} />
                    {badge > 0 && (
                      <span className="lg:hidden absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                        {badge}
                      </span>
                    )}
                  </div>
                  <span className="hidden lg:inline truncate flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className="hidden lg:inline-flex min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold items-center justify-center tabular-nums">
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}

            {profile && (
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setAccountOpen(false);
                }}
                className="w-full flex items-center justify-center lg:justify-start gap-3.5 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors relative"
              >
                <div className="relative shrink-0">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <span className="hidden lg:inline">Notifications</span>
              </button>
            )}
          </nav>
        </div>

        {/* Bottom Rail Controls */}
        <div className="space-y-2 relative">
          <div className="hidden lg:flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{dark ? 'Light' : 'Dark'}</span>
            </button>
            <button
              type="button"
              onClick={() => setLocale(locale === 'en' ? 'hi' : 'en')}
              className="font-semibold text-blue-600 dark:text-blue-400"
            >
              {locale === 'en' ? 'हिन्दी' : 'EN'}
            </button>
          </div>

          {!isInstalled && isInstallable && (
            <button
              type="button"
              onClick={() => install()}
              className="w-full flex items-center justify-center lg:justify-start gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span className="hidden lg:inline">Install App</span>
            </button>
          )}

          {profile ? (
            <button
              type="button"
              onClick={() => {
                setAccountOpen((v) => !v);
                setNotifOpen(false);
              }}
              className="w-full flex items-center justify-center lg:justify-start gap-3 px-2.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.fullName}
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center text-xs font-bold shrink-0">
                  {(profile.fullName || 'U')[0]}
                </div>
              )}
              <div className="hidden lg:block min-w-0 text-left">
                <p className="text-xs font-semibold truncate">{profile.fullName}</p>
                <p className="text-[11px] text-slate-500 capitalize truncate">{profile.role}</p>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full min-h-[42px] px-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-90"
            >
              <User className="w-4 h-4 shrink-0" />
              <span className="hidden lg:inline">{t.nav.signIn}</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Top Bar (Hidden on full-screen /reels route) */}
        {!isReelsRoute && (
          <header className="md:hidden sticky top-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-white"
          >
            <span className="w-7 h-7 rounded-[8px] bg-neutral-950 dark:bg-neutral-900 ring-1 ring-black/15 dark:ring-white/20 flex items-center justify-center shrink-0 overflow-hidden">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" aria-hidden="true">
                <path d="M16 3.5L26.8 9.75L16 16L5.2 9.75Z" fill="#FFFFFF" fillOpacity="0.09" />
                <path d="M5.2 9.75L16 16V28.5L5.2 22.25Z" fill="#FFFFFF" fillOpacity="0.03" />
                <path d="M26.8 9.75V22.25L16 28.5V16Z" fill="#FFFFFF" fillOpacity="0.14" />
                <path d="M16 6L23.2 10.2L20.6 11.7L16 9L11.8 11.4L8.8 10.2Z" fill="#FFFFFF" />
                <path d="M8.8 10.2L11.8 11.4V14.3L8.8 16Z" fill="#CBD5E1" />
                <path d="M8.8 16L11.8 14.3L23.2 20.9L20.2 22.6Z" fill="#F8FAFC" />
                <path d="M23.2 20.9V22.8L16 27L16 23.9L20.2 21.5Z" fill="#94A3B8" />
                <path d="M16 27L8.8 22.8L11.4 21.3L16 23.9Z" fill="#E2E8F0" />
              </svg>
            </span>
            <span>{BRAND_CONFIG.name}</span>
          </Link>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {profile ? (
              <>
                <Link
                  to="/messages"
                  aria-label="Messages"
                  className="relative min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300"
                >
                  <MessageCircle className="w-5 h-5" />
                  {unreadChatCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {unreadChatCount}
                    </span>
                  )}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen((v) => !v);
                    setAccountOpen(false);
                  }}
                  aria-label="Notifications"
                  className="relative min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {unreadCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen((v) => !v);
                    setNotifOpen(false);
                  }}
                  className="min-h-[40px] px-2.5 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold"
                >
                  <User className="w-4 h-4" />
                  <span className="max-w-[80px] truncate">{profile.fullName}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
              >
                {t.nav.signIn}
              </button>
            )}
          </div>
          </header>
        )}

        <main
          className={
            isReelsRoute
              ? 'flex-1 h-[calc(100dvh-3.5rem)] md:h-screen overflow-hidden bg-neutral-950'
              : 'flex-1 pb-20 md:pb-8'
          }
        >
          {children}
        </main>

        {/* Quiet Footer */}
        {!isReelsRoute && (
          <footer className="hidden md:block border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-3">
                <span className="font-display font-bold text-slate-900 dark:text-slate-100">
                  {BRAND_CONFIG.name}
                </span>
                <span>·</span>
                <span>Social Local Business Discovery</span>
              </div>
              <div className="flex items-center gap-5 flex-wrap">
                <Link to="/about" className="hover:text-slate-900 dark:hover:text-white">About</Link>
                <Link to="/contact" className="hover:text-slate-900 dark:hover:text-white">Contact</Link>
                <Link to="/terms" className="hover:text-slate-900 dark:hover:text-white">Terms</Link>
                <Link to="/privacy" className="hover:text-slate-900 dark:hover:text-white">Privacy</Link>
              </div>
            </div>
          </footer>
        )}
      </div>

      {/* Mobile Instagram-Style Sticky Bottom Navigation (56px) */}
      <nav
        aria-label="Mobile navigation"
        className={`md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 backdrop-blur-md border-t grid grid-cols-5 items-center ${
          isReelsRoute
            ? 'bg-neutral-950/95 border-neutral-800'
            : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-800'
        }`}
      >
        <Link
          to="/"
          className={`flex flex-col items-center justify-center min-h-[44px] ${
            pathname === '/'
              ? 'text-slate-900 dark:text-white'
              : isReelsRoute
                ? 'text-neutral-400'
                : 'text-slate-400'
          }`}
        >
          <Home className={`w-5 h-5 ${pathname === '/' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] font-medium mt-0.5">Home</span>
        </Link>
        <Link
          to="/search"
          className={`flex flex-col items-center justify-center min-h-[44px] ${
            pathname.startsWith('/search') ? 'text-slate-900 dark:text-white' : 'text-slate-400'
          }`}
        >
          <Compass className={`w-5 h-5 ${pathname.startsWith('/search') ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] font-medium mt-0.5">Explore</span>
        </Link>
        <Link
          to="/reels"
          className={`flex flex-col items-center justify-center min-h-[44px] ${
            pathname === '/reels'
              ? isReelsRoute
                ? 'text-white'
                : 'text-slate-900 dark:text-white'
              : 'text-slate-400'
          }`}
        >
          <Film className={`w-5 h-5 ${pathname === '/reels' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] font-medium mt-0.5">Reels</span>
        </Link>
        <Link
          to="/saved"
          className={`flex flex-col items-center justify-center min-h-[44px] ${
            pathname === '/saved' ? 'text-slate-900 dark:text-white' : 'text-slate-400'
          }`}
        >
          <Bookmark className={`w-5 h-5 ${pathname === '/saved' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] font-medium mt-0.5">{t.nav.saved}</span>
        </Link>
        <Link
          to={profile ? '/dashboard' : '/login'}
          className={`flex flex-col items-center justify-center min-h-[44px] ${
            pathname.startsWith('/dashboard') || pathname === '/login'
              ? 'text-slate-900 dark:text-white'
              : 'text-slate-400'
          }`}
        >
          <Store className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5">
            {profile ? 'Studio' : t.nav.signIn}
          </span>
        </Link>
      </nav>

      {/* Notifications Drawer */}
      {notifOpen && (
        <div className="fixed top-16 right-4 md:left-24 lg:left-68 md:top-16 md:right-auto w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="font-display text-sm font-semibold">Activity & Push Alerts</span>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={requestBrowserPush}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Enable push
              </button>
              <button
                type="button"
                onClick={markAllRead}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Mark read
              </button>
              <button type="button" onClick={() => setNotifOpen(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    markOneRead(n.id);
                    setNotifOpen(false);
                    if (n.link) navigate(n.link);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors ${
                    !n.isRead ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {n.title}
                    </span>
                    {!n.isRead && <span className="text-[10px] font-semibold text-blue-600">New</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                    {n.body}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Account Menu Drawer */}
      {accountOpen && (
        <div className="fixed top-16 right-4 md:top-auto md:bottom-16 md:left-4 md:right-auto w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 p-2">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
            {profile && (
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{profile.fullName}</p>
                <p className="text-[11px] text-slate-500 truncate">{profile.email}</p>
              </div>
            )}
            <button type="button" onClick={() => setAccountOpen(false)}>
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {profile && (
            <button
              type="button"
              onClick={() => {
                setAccountOpen(false);
                navigate(`/u/${profile.handle || profile.uid}`);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <User className="w-4 h-4" />
              <span>My Public Profile</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setAccountOpen(false);
              navigate('/messages');
            }}
            className="w-full flex items-center justify-between gap-2.5 px-3 py-2 text-xs font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <span className="flex items-center gap-2.5">
              <MessageCircle className="w-4 h-4" />
              <span>Messages</span>
            </span>
            {unreadChatCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold tabular-nums">
                {unreadChatCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setAccountOpen(false);
              navigate('/dashboard');
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Store className="w-4 h-4" />
            <span>{t.nav.dashboard}</span>
          </button>

          {profile?.role === 'admin' && (
            <button
              type="button"
              onClick={() => {
                setAccountOpen(false);
                navigate('/admin');
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Shield className="w-4 h-4" />
              <span>Admin Console</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{dark ? 'Light mode' : 'Dark mode'}</span>
          </button>

          <button
            type="button"
            onClick={() => setLocale(locale === 'en' ? 'hi' : 'en')}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <span>Language</span>
            <span className="font-semibold text-blue-600">{locale === 'en' ? 'EN → हिं' : 'हिं → EN'}</span>
          </button>

          {!isInstalled && isIOS && (
            <button
              type="button"
              onClick={() => {
                setAccountOpen(false);
                setShowIOSGuide(true);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40"
            >
              <Download className="w-4 h-4" />
              <span>Install on iPhone</span>
            </button>
          )}

          <button
            type="button"
            onClick={async () => {
              setAccountOpen(false);
              await signOut();
              navigate('/');
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 mt-1 border-t border-slate-100 dark:border-slate-800"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>
      )}

      {/* Offline Indicator */}
      {!isOnline && (
        <div className="fixed bottom-16 md:bottom-4 left-4 z-50 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white shadow-lg">
          Offline mode — showing cached content
        </div>
      )}

      {/* Real-time Toast Notifications */}
      <div className="fixed bottom-16 md:bottom-6 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3.5 flex items-start justify-between gap-3"
          >
            <button
              type="button"
              onClick={() => {
                dismissToast(toast.id);
                if (toast.link) navigate(toast.link);
              }}
              className="text-left flex-1"
            >
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {toast.title}
              </p>
              {toast.body && (
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                  {toast.body}
                </p>
              )}
            </button>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* iOS Safari Install Guide */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
            <h3 className="font-display text-lg font-semibold">Install {BRAND_CONFIG.name}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              1. Tap the <strong>Share</strong> icon in Safari.
              <br />
              2. Scroll down and tap <strong>Add to Home Screen</strong>.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-4 w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
