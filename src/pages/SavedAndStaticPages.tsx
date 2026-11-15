import React, { useEffect, useState } from 'react';
import { Bookmark, ShieldCheck, Store } from 'lucide-react';
import { BusinessCard, SafeImage } from '../components/BusinessCard';
import { Link, navigate } from '../components/RouterLink';
import { BRAND_CONFIG } from '../config/brand';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { useSocial } from '../context/SocialContext';
import { apiFetch } from '../lib/api';
import type { BusinessSummary } from '../types/app';

export const SavedPage: React.FC = () => {
  const { profile, loading: authLoading } = useAuth();
  const { savedPosts, follows, toggleFollow } = useSocial();
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'posts' | 'businesses' | 'following'>('posts');

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      setLoading(false);
      return;
    }
    apiFetch<{ businesses: BusinessSummary[] }>('/api/favorites')
      .then((res) => setBusinesses(res.businesses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profile, authLoading]);

  if (!authLoading && !profile) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <Bookmark className="w-10 h-10 mx-auto text-slate-400" />
        <h1 className="mt-4 font-display text-2xl font-bold">Saved & Following</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign in with Google to bookmark posts, save favourite storefronts, and manage who you follow.
        </p>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="mt-6 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold">Saved & Following</h1>
        <div className="inline-flex items-center p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl self-start">
          {(
            [
              ['posts', `Saved Posts (${savedPosts.length})`],
              ['businesses', `Storefronts (${businesses.length})`],
              ['following', `Following (${follows.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === key
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'posts' ? (
        savedPosts.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
            <p className="text-sm text-slate-500">No saved posts yet. Tap the bookmark icon on any feed post.</p>
            <Link
              to="/"
              className="mt-4 inline-block px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
            >
              Browse Feed
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {savedPosts.map((sp) => (
              <Link
                key={sp.postId}
                to={`/b/${sp.businessSlug}`}
                className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-200 dark:bg-slate-800 block"
              >
                <SafeImage
                  src={sp.mediaUrl}
                  alt={sp.businessName}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent flex items-end p-3">
                  <p className="text-xs font-semibold text-white truncate">{sp.businessName}</p>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : tab === 'following' ? (
        follows.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
            <p className="text-sm text-slate-500">You are not following any storefronts yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {follows.map((f) => (
              <div
                key={f.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3"
              >
                <Link to={`/b/${f.businessSlug}`} className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800">
                    {f.businessLogo ? (
                      <SafeImage
                        src={f.businessLogo}
                        alt={f.businessName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Store className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <span className="text-sm font-semibold truncate">{f.businessName}</span>
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    toggleFollow({
                      id: f.businessId,
                      slug: f.businessSlug,
                      name: f.businessName,
                      logoUrl: f.businessLogo,
                    })
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0"
                >
                  Following
                </button>
              </div>
            ))}
          </div>
        )
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-72 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : businesses.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
          <p className="text-sm text-slate-500">You have not saved any businesses yet.</p>
          <Link
            to="/search"
            className="mt-4 inline-block px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
          >
            Explore businesses
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {businesses.map((b) => (
            <BusinessCard key={b.id} business={b} />
          ))}
        </div>
      )}
    </div>
  );
};

export const AuthPage: React.FC<{ mode: 'login' | 'signup' | 'forgot' }> = ({ mode }) => {
  const { signInWithGoogle, profile } = useAuth();
  const { pushToast } = useRealtime();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) navigate('/dashboard');
  }, [profile]);

  const handleGoogleSignIn = async () => {
    setBusy(true);
    try {
      const prof = await signInWithGoogle();
      pushToast({ title: `Welcome back, ${prof?.fullName || 'User'}` });
      navigate(prof?.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      pushToast({ title: (err as Error).message || 'Sign in failed', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-6">
        <div>
          <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
            {BRAND_CONFIG.name} Account
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold">
            {mode === 'signup'
              ? 'Create your account'
              : mode === 'forgot'
                ? 'Account recovery'
                : 'Sign in to SoleWeb'}
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Use your Google account to save favourites, write reviews, manage your business storefront, or access moderation tools.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={busy}
          className="w-full min-h-[48px] rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>{busy ? 'Connecting...' : 'Continue with Google'}</span>
        </button>

        <p className="text-xs text-slate-400 text-center">
          Protected by Firebase Authentication.
        </p>
      </div>
    </div>
  );
};

export const InfoPage: React.FC<{ page: 'about' | 'contact' | 'terms' | 'privacy' }> = ({ page }) => {
  const titles = {
    about: `About ${BRAND_CONFIG.name}`,
    contact: `Contact ${BRAND_CONFIG.name}`,
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4">
        <h1 className="font-display text-2xl font-bold">{titles[page]}</h1>
        {page === 'about' && (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {BRAND_CONFIG.name} connects customers anywhere in the world with independent shops, service studios, restaurants, clinics, and local makers. Storefronts publish rich visual posts, real-time inventory availability, verified contact details, and direct Google Maps links.
          </p>
        )}
        {page === 'contact' && (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            For merchant onboarding assistance, verification appeals, or partnership enquiries, email{' '}
            <a href={`mailto:${BRAND_CONFIG.supportEmail}`} className="text-blue-600 underline">
              {BRAND_CONFIG.supportEmail}
            </a>.
          </p>
        )}
        {page === 'terms' && (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Merchants are responsible for maintaining accurate hours, pricing, and lawful products. Reviews must reflect genuine customer visits. Verified badges are granted following document and storefront review.
          </p>
        )}
        {page === 'privacy' && (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Location coordinates used for Near Me search are stored only in your browser localStorage. Authentication is handled via Firebase Auth, and inventory cost metrics are strictly restricted to business owners and administrators.
          </p>
        )}
      </div>
    </div>
  );
};
