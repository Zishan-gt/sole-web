import React, { useEffect, useState } from 'react';
import { BadgeCheck, ChevronLeft, ChevronRight, MapPin, Plus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useRealtime } from '../context/RealtimeContext';
import { apiFetch } from '../lib/api';
import type { FirestoreStory } from '../lib/socialFirestore';
import type { BusinessSummary } from '../types/app';
import { SafeImage } from './BusinessCard';
import { navigate } from './RouterLink';

export const StoriesBar: React.FC = () => {
  const { profile } = useAuth();
  const { stories, publishStory } = useSocial();
  const { pushToast } = useRealtime();

  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [myBusinesses, setMyBusinesses] = useState<BusinessSummary[]>([]);
  const [selectedBizId, setSelectedBizId] = useState('');
  const [storyMediaUrl, setStoryMediaUrl] = useState('/src/assets/images/biz_artisan_cafe_1794724070534.jpg');
  const [storyCaption, setStoryCaption] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Auto-advance active story every 6s
  useEffect(() => {
    if (activeIdx === null) return;
    const timer = setTimeout(() => {
      if (activeIdx < stories.length - 1) {
        setActiveIdx(activeIdx + 1);
      } else {
        setActiveIdx(null);
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, [activeIdx, stories.length]);

  const openComposer = async () => {
    if (!profile) {
      navigate('/login');
      return;
    }
    try {
      const res = await apiFetch<{ businesses: BusinessSummary[] }>('/api/owner/businesses');
      const list = res.businesses || [];
      if (list.length === 0) {
        pushToast({ title: 'Create a business storefront first to post a Story' });
        navigate('/dashboard/onboarding');
        return;
      }
      setMyBusinesses(list);
      setSelectedBizId(list[0].id);
      setStoryMediaUrl(list[0].coverUrl || list[0].logoUrl || '/src/assets/images/biz_artisan_cafe_1794724070534.jpg');
      setComposerOpen(true);
    } catch {
      navigate('/dashboard');
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    const biz = myBusinesses.find((b) => b.id === selectedBizId);
    if (!biz) return;
    setPublishing(true);
    try {
      await publishStory(
        { id: biz.id, slug: biz.slug, name: biz.name, logoUrl: biz.logoUrl, isVerified: biz.isVerified },
        storyMediaUrl,
        storyCaption
      );
      setComposerOpen(false);
      setStoryCaption('');
    } catch (err) {
      pushToast({ title: (err as Error).message || 'Could not publish story', variant: 'error' });
    } finally {
      setPublishing(false);
    }
  };

  const activeStory: FirestoreStory | null = activeIdx !== null ? stories[activeIdx] || null : null;

  return (
    <>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-3 py-3.5 overflow-x-auto">
        <div className="flex items-center gap-3.5 min-w-max">
          {/* Add Story Circle */}
          <button
            type="button"
            onClick={openComposer}
            className="flex flex-col items-center gap-1.5 w-[68px] shrink-0 group"
          >
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-700 group-hover:border-blue-500 flex items-center justify-center bg-slate-50 dark:bg-slate-950 relative transition-colors">
              <Plus className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate w-full text-center">
              Your Story
            </span>
          </button>

          {stories.map((story, idx) => (
            <button
              key={story.id}
              type="button"
              onClick={() => setActiveIdx(idx)}
              className="flex flex-col items-center gap-1.5 w-[68px] shrink-0 group"
            >
              <div className="w-16 h-16 rounded-full p-[2.5px] bg-gradient-to-tr from-amber-400 via-rose-500 to-violet-600 group-hover:scale-105 transition-transform">
                <div className="w-full h-full rounded-full p-[2px] bg-white dark:bg-slate-900 overflow-hidden">
                  <SafeImage
                    src={story.businessLogo || story.mediaUrl}
                    alt={story.businessName}
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
              </div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate w-full text-center">
                {story.businessName}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Full-Screen Story Viewer */}
      {activeStory && activeIdx !== null && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-0 sm:p-4">
          <div className="relative w-full h-full sm:h-[85vh] sm:max-w-md bg-slate-950 sm:rounded-2xl overflow-hidden flex flex-col">
            {/* Progress Bars */}
            <div className="absolute top-3 left-3 right-3 z-20 flex gap-1">
              {stories.map((s, idx) => (
                <div key={s.id} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-white transition-all ${
                      idx < activeIdx ? 'w-full' : idx === activeIdx ? 'w-full duration-[6000ms] ease-linear' : 'w-0'
                    }`}
                  />
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="absolute top-6 left-3 right-3 z-20 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveIdx(null);
                  navigate(`/b/${activeStory.businessSlug}`);
                }}
                className="flex items-center gap-2.5 text-white text-left"
              >
                <div className="w-9 h-9 rounded-full overflow-hidden border border-white/50 bg-white">
                  <SafeImage
                    src={activeStory.businessLogo || activeStory.mediaUrl}
                    alt={activeStory.businessName}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-semibold drop-shadow">{activeStory.businessName}</span>
                  {activeStory.businessVerified && <BadgeCheck className="w-4 h-4 text-blue-400" />}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveIdx(null)}
                aria-label="Close story"
                className="w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Media */}
            <SafeImage
              src={activeStory.mediaUrl}
              alt={activeStory.businessName}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

            {/* Tap navigation */}
            {activeIdx > 0 && (
              <button
                type="button"
                onClick={() => setActiveIdx(activeIdx - 1)}
                aria-label="Previous story"
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {activeIdx < stories.length - 1 && (
              <button
                type="button"
                onClick={() => setActiveIdx(activeIdx + 1)}
                aria-label="Next story"
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}

            {/* Caption + CTA */}
            <div className="absolute bottom-5 left-4 right-4 z-20 space-y-3">
              {activeStory.caption && (
                <p className="text-sm text-white/95 leading-snug drop-shadow">{activeStory.caption}</p>
              )}
              <button
                type="button"
                onClick={() => {
                  const slug = activeStory.businessSlug;
                  setActiveIdx(null);
                  navigate(`/b/${slug}`);
                }}
                className="w-full min-h-[44px] rounded-xl bg-white text-slate-900 font-semibold text-sm flex items-center justify-center gap-2 shadow-lg"
              >
                <MapPin className="w-4 h-4 text-blue-600" />
                <span>Visit Storefront</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Story Composer Modal */}
      {composerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handlePublish}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Share Storefront Story</h3>
              <button type="button" onClick={() => setComposerOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">Storefront</label>
              <select
                value={selectedBizId}
                onChange={(e) => setSelectedBizId(e.target.value)}
                className="mt-1 w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              >
                {myBusinesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">Photo URL</label>
              <input
                type="text"
                required
                value={storyMediaUrl}
                onChange={(e) => setStoryMediaUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">Caption</label>
              <textarea
                rows={2}
                maxLength={280}
                value={storyCaption}
                onChange={(e) => setStoryCaption(e.target.value)}
                placeholder="Fresh batch out now, walk in today..."
                className="mt-1 w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={publishing}
              className="w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {publishing ? 'Publishing...' : 'Publish 24h Story'}
            </button>
          </form>
        </div>
      )}
    </>
  );
};
