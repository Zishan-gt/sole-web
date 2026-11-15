import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  Globe,
  Image as ImageIcon,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  SkipForward,
  Sparkles,
  Store,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { SafeImage } from '../../components/BusinessCard';
import { LeafletMap } from '../../components/LeafletMap';
import { useRealtime } from '../../context/RealtimeContext';
import { apiFetch } from '../../lib/api';
import type { BusinessHoursSlot, BusinessSummary, CategoryItem } from '../../types/app';

const DEFAULT_HOURS: Record<string, BusinessHoursSlot> = {
  mon: { open: '09:00', close: '21:00', closed: false },
  tue: { open: '09:00', close: '21:00', closed: false },
  wed: { open: '09:00', close: '21:00', closed: false },
  thu: { open: '09:00', close: '21:00', closed: false },
  fri: { open: '09:00', close: '21:00', closed: false },
  sat: { open: '10:00', close: '21:00', closed: false },
  sun: { open: '10:00', close: '19:00', closed: false },
};

interface StepMeta {
  num: number;
  key: string;
  label: string;
  title: string;
  subtitle: string;
  required: boolean;
}

const WIZARD_STEPS: StepMeta[] = [
  {
    num: 1,
    key: 'basic',
    label: 'Basic Info',
    title: 'Name & category',
    subtitle: 'Tell customers who you are and how your business should be listed on SoleWeb.',
    required: true,
  },
  {
    num: 2,
    key: 'avatar',
    label: 'Profile Photo',
    title: 'Pick a profile picture',
    subtitle: 'Add a logo or storefront photo so people recognize you instantly across feeds and search.',
    required: false,
  },
  {
    num: 3,
    key: 'cover',
    label: 'Cover Media',
    title: 'Add a cover banner',
    subtitle: 'Frame the top of your storefront profile with a wide atmosphere or product photo.',
    required: false,
  },
  {
    num: 4,
    key: 'story',
    label: 'Bio & Tags',
    title: 'Write your bio & tags',
    subtitle: 'Describe what makes your business special and add keywords customers search for.',
    required: false,
  },
  {
    num: 5,
    key: 'location',
    label: 'Location',
    title: 'Pin your location',
    subtitle: 'Paste a Google Maps link or drag the pin so customers get accurate distance & directions.',
    required: false,
  },
  {
    num: 6,
    key: 'contact',
    label: 'Contact',
    title: 'Add contact channels',
    subtitle: 'Share your phone, WhatsApp, email, and website so customers can reach you in one tap.',
    required: false,
  },
  {
    num: 7,
    key: 'hours',
    label: 'Hours & Socials',
    title: 'Opening hours & socials',
    subtitle: 'Show live Open/Closed status and connect your Instagram, X, Facebook, YouTube, or LinkedIn.',
    required: false,
  },
  {
    num: 8,
    key: 'review',
    label: 'Launch',
    title: 'Review & publish',
    subtitle: 'Inspect your completed and skipped sections, then go live on SoleWeb.',
    required: false,
  },
];

const BIO_TEMPLATES = [
  'Neighborhood favorite serving crafted quality, warm hospitality, and same-day local service.',
  'Verified local specialist offering transparent pricing, fast turnaround, and doorstep support.',
  'Curated products and tailored services built for everyday convenience. Open 7 days a week.',
];

interface WizardProps {
  existing?: BusinessSummary | null;
  categories: CategoryItem[];
  isWizard?: boolean;
  onSaved: (biz: BusinessSummary) => void;
}

export const BusinessWizardAndEditor: React.FC<WizardProps> = ({
  existing,
  categories,
  isWizard = false,
  onSaved,
}) => {
  const { pushToast } = useRealtime();
  const [guidedMode, setGuidedMode] = useState(isWizard);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [skippedSteps, setSkippedSteps] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [resolvingMap, setResolvingMap] = useState(false);
  const [hoursCustomized, setHoursCustomized] = useState(Boolean(existing?.id));
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  const [form, setForm] = useState({
    id: existing?.id || undefined,
    name: existing?.name || '',
    slug: existing?.slug || '',
    categoryId: existing?.categoryId || categories[0]?.id || '',
    subcategory: existing?.subcategory || '',
    bio: existing?.bio || '',
    phone: existing?.phone || '',
    whatsapp: existing?.whatsapp || '',
    email: existing?.email || '',
    website: existing?.website || '',
    googleMapsUrl: existing?.googleMapsUrl || '',
    addressLine: existing?.addressLine || '',
    area: existing?.area || '',
    city: existing?.city || '',
    state: existing?.state || '',
    pincode: existing?.pincode || '',
    country: existing?.country || 'IN',
    lat: existing?.lat ?? 25.6093,
    lng: existing?.lng ?? 85.1376,
    logoUrl: existing?.logoUrl || '',
    coverUrl: existing?.coverUrl || '',
    hours: existing?.hours && Object.keys(existing.hours).length > 0 ? existing.hours : DEFAULT_HOURS,
    socialLinks: existing?.socialLinks || {},
    tagsText: (existing?.tags || []).join(', '),
    status: (existing?.status === 'draft' ? 'draft' : 'published') as 'draft' | 'published',
  });

  useEffect(() => {
    setGuidedMode(isWizard);
    if (isWizard) {
      setStep(1);
      setDirection(1);
      setSkippedSteps([]);
    }
  }, [isWizard]);

  useEffect(() => {
    if (!form.categoryId && categories.length > 0) {
      setForm((f) => ({ ...f, categoryId: categories[0].id }));
    }
  }, [categories]);

  useEffect(() => {
    if (existing) {
      setForm({
        id: existing.id,
        name: existing.name,
        slug: existing.slug,
        categoryId: existing.categoryId || categories[0]?.id || '',
        subcategory: existing.subcategory || '',
        bio: existing.bio || '',
        phone: existing.phone || '',
        whatsapp: existing.whatsapp || '',
        email: existing.email || '',
        website: existing.website || '',
        googleMapsUrl: existing.googleMapsUrl || '',
        addressLine: existing.addressLine || '',
        area: existing.area || '',
        city: existing.city || '',
        state: existing.state || '',
        pincode: existing.pincode || '',
        country: existing.country || 'IN',
        lat: existing.lat,
        lng: existing.lng,
        logoUrl: existing.logoUrl || '',
        coverUrl: existing.coverUrl || '',
        hours: existing.hours && Object.keys(existing.hours).length > 0 ? existing.hours : DEFAULT_HOURS,
        socialLinks: existing.socialLinks || {},
        tagsText: (existing.tags || []).join(', '),
        status: existing.status === 'draft' ? 'draft' : 'published',
      });
      setHoursCustomized(true);
    }
  }, [existing?.id]);

  // Auto-generate handle/slug on new storefront creation
  useEffect(() => {
    if (!form.id && form.name && !existing) {
      const auto = form.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
      setForm((f) => ({ ...f, slug: auto }));
    }
  }, [form.name, form.id, existing]);

  const handleResolveGoogleMaps = async () => {
    if (!form.googleMapsUrl.trim()) {
      pushToast({ title: 'Paste a Google Maps link first', variant: 'error' });
      return;
    }
    setResolvingMap(true);
    try {
      const res = await apiFetch<{
        lat: number;
        lng: number;
        resolvedUrl: string;
        addressLine: string;
        area: string;
        city: string;
        state: string;
        pincode: string;
        country: string;
      }>('/api/maps/resolve', {
        method: 'POST',
        body: JSON.stringify({ url: form.googleMapsUrl }),
      });

      setForm((f) => ({
        ...f,
        lat: res.lat,
        lng: res.lng,
        googleMapsUrl: res.resolvedUrl || f.googleMapsUrl,
        addressLine: res.addressLine || f.addressLine,
        area: res.area || f.area,
        city: res.city || f.city,
        state: res.state || f.state,
        pincode: res.pincode || f.pincode,
        country: res.country || f.country,
      }));
      pushToast({
        title: 'Location & address fetched',
        body: [res.area, res.city, res.country].filter(Boolean).join(', '),
      });
    } catch (err) {
      pushToast({ title: (err as Error).message, variant: 'error' });
    } finally {
      setResolvingMap(false);
    }
  };

  const handlePinMove = async (lat: number, lng: number) => {
    setForm((f) => ({ ...f, lat, lng }));
    try {
      const rev = await apiFetch<{
        addressLine: string;
        area: string;
        city: string;
        state: string;
        pincode: string;
        country: string;
      }>(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
      setForm((f) => ({
        ...f,
        addressLine: rev.addressLine || f.addressLine,
        area: rev.area || f.area,
        city: rev.city || f.city,
        state: rev.state || f.state,
        pincode: rev.pincode || f.pincode,
        country: rev.country || f.country,
      }));
    } catch {
      // Keep coords
    }
  };

  const handleFileUpload = (field: 'logoUrl' | 'coverUrl', file: File | null) => {
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      pushToast({ title: 'Image must be under 1.5 MB', variant: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((f) => ({ ...f, [field]: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCopyWeekdayHours = () => {
    const monSlot = form.hours.mon || { open: '09:00', close: '21:00', closed: false };
    setHoursCustomized(true);
    setForm((f) => ({
      ...f,
      hours: {
        ...f.hours,
        tue: { ...monSlot },
        wed: { ...monSlot },
        thu: { ...monSlot },
        fri: { ...monSlot },
      },
    }));
    pushToast({ title: 'Copied Monday hours to Tue–Fri' });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.name.trim() || form.name.trim().length < 2) {
      pushToast({ title: 'Business name is required (min 2 characters)', variant: 'error' });
      if (guidedMode) {
        setDirection(-1);
        setStep(1);
      }
      return;
    }
    setSaving(true);
    try {
      const tags = form.tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await apiFetch<{ business: BusinessSummary }>('/api/owner/businesses', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          categoryId: form.categoryId || null,
          tags,
        }),
      });
      pushToast({ title: form.id ? 'Profile updated' : 'Business published!' });
      onSaved(res.business);
    } catch (err) {
      pushToast({ title: (err as Error).message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const currentStepMeta = WIZARD_STEPS[step - 1] || WIZARD_STEPS[0];
  const canProceedCurrent = step === 1 ? form.name.trim().length >= 2 : true;

  const goToStep = (next: number) => {
    if (next > 1 && form.name.trim().length < 2) {
      pushToast({ title: 'Enter your business name first', variant: 'error' });
      return;
    }
    setDirection(next >= step ? 1 : -1);
    setStep(Math.max(1, Math.min(WIZARD_STEPS.length, next)));
  };

  const handleNextStep = () => {
    if (!canProceedCurrent) {
      pushToast({
        title: 'Business name must be at least 2 characters',
        variant: 'error',
      });
      return;
    }
    setSkippedSteps((prev) => prev.filter((s) => s !== step));
    goToStep(step + 1);
  };

  const handleSkipStep = () => {
    if (currentStepMeta.required) return;
    setSkippedSteps((prev) => (prev.includes(step) ? prev : [...prev, step]));
    goToStep(step + 1);
  };

  const isStepCompleted = (num: number): boolean => {
    switch (num) {
      case 1:
        return form.name.trim().length >= 2 && Boolean(form.categoryId || categories.length === 0);
      case 2:
        return Boolean(form.logoUrl.trim());
      case 3:
        return Boolean(form.coverUrl.trim());
      case 4:
        return Boolean(form.bio.trim() || form.tagsText.trim());
      case 5:
        return Boolean(form.addressLine.trim() || form.city.trim() || form.area.trim());
      case 6:
        return Boolean(
          form.phone.trim() || form.whatsapp.trim() || form.email.trim() || form.website.trim()
        );
      case 7:
        return (
          hoursCustomized ||
          Object.values(form.socialLinks || {}).some((v) => Boolean(v && v.trim()))
        );
      default:
        return true;
    }
  };

  const completedCount = WIZARD_STEPS.slice(0, 7).filter((s) => isStepCompleted(s.num)).length;
  const completionPct = Math.round((completedCount / 7) * 100);
  const stepProgressPct = Math.round((step / WIZARD_STEPS.length) * 100);

  const selectedCategoryName =
    categories.find((c) => c.id === form.categoryId)?.name || 'Category';
  const fullPreviewAddress = [
    form.addressLine,
    form.area,
    form.city,
    form.state,
    form.pincode,
  ]
    .filter(Boolean)
    .join(', ');

  // Reusable step sections
  const renderBasicInfoFields = () => (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Business Name <span className="text-rose-500">*</span>
              </span>
            </label>
            <span className="text-[11px] font-medium text-slate-400">Required</span>
          </div>
          <input
            type="text"
            required
            autoFocus={guidedMode}
            placeholder="e.g. Copper Kettle Roasters"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-medium focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
            Public Handle & Storefront URL
          </label>
          <div className="flex items-center h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 focus-within:border-blue-500 transition-colors">
            <span className="text-xs font-mono text-slate-400 mr-1">soleweb.app/b/</span>
            <input
              type="text"
              placeholder="your-business-name"
              value={form.slug}
              onChange={(e) =>
                setForm({
                  ...form,
                  slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                })
              }
              className="w-full bg-transparent text-sm font-mono focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Primary Category <span className="text-rose-500">*</span>
          </label>
          <span className="text-[11px] text-slate-400">Select one</span>
        </div>
        {categories.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {categories.map((c) => {
              const active = form.categoryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setForm({ ...form, categoryId: c.id })}
                  className={`min-h-[44px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left text-xs font-medium transition-all active:scale-[0.98] ${
                    active
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Loading categories...</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
          Specialty / Subcategory (Optional)
        </label>
        <input
          type="text"
          placeholder="e.g. Specialty Coffee, Sourdough & Remote Work Lounge"
          value={form.subcategory}
          onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
          className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );

  const renderProfilePictureFields = () => (
    <div className="space-y-5">
      <div className="flex flex-col items-center justify-center py-6 px-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60">
        <div className="relative">
          <div className="w-32 h-32 rounded-full p-[3px] bg-gradient-to-tr from-amber-500 via-rose-500 to-violet-600 shadow-md">
            <div className="w-full h-full rounded-full overflow-hidden border-[3px] border-white dark:border-slate-900 bg-slate-100 dark:bg-slate-800">
              {form.logoUrl ? (
                <SafeImage
                  src={form.logoUrl}
                  alt="Profile picture preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                  <Camera className="w-9 h-9" />
                  <span className="text-[11px] font-medium mt-1">Logo</span>
                </div>
              )}
            </div>
          </div>

          <label
            title="Upload profile picture"
            className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center cursor-pointer shadow-lg hover:scale-105 active:scale-95 transition-transform"
          >
            <Upload className="w-4 h-4" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileUpload('logoUrl', e.target.files?.[0] || null)}
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <label className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all">
            <Camera className="w-4 h-4" />
            <span>{form.logoUrl ? 'Change profile photo' : 'Choose from device'}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileUpload('logoUrl', e.target.files?.[0] || null)}
            />
          </label>
          {form.logoUrl && (
            <button
              type="button"
              onClick={() => setForm({ ...form, logoUrl: '' })}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove</span>
            </button>
          )}
        </div>

        <p className="mt-2.5 text-xs text-slate-500 text-center max-w-sm">
          Square PNG or JPG up to 1.5 MB. Displayed inside the signature ring on feed posts, stories, and search results.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">
          Or paste a direct image URL
        </label>
        <input
          type="text"
          placeholder="https://example.com/logo.jpg"
          value={form.logoUrl}
          onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
          className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
        />
      </div>
    </div>
  );

  const renderCoverFields = () => (
    <div className="space-y-4">
      <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-950">
        <div className="relative h-40 sm:h-48 bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800">
          {form.coverUrl ? (
            <SafeImage
              src={form.coverUrl}
              alt="Cover banner preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
              <ImageIcon className="w-8 h-8 mb-1.5" />
              <span className="text-xs font-medium">Recommended 16:5 wide storefront banner</span>
            </div>
          )}
        </div>
        <div className="px-4 pb-4 -mt-9 flex items-end justify-between gap-3 relative z-10">
          <div className="w-18 h-18 rounded-full border-4 border-white dark:border-slate-900 overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
            {form.logoUrl ? (
              <SafeImage src={form.logoUrl} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">
                <Store className="w-6 h-6" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 pt-10 flex-wrap justify-end">
            <label className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all">
              <Upload className="w-3.5 h-3.5" />
              <span>{form.coverUrl ? 'Change cover' : 'Upload cover photo'}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileUpload('coverUrl', e.target.files?.[0] || null)}
              />
            </label>
            {form.coverUrl && (
              <button
                type="button"
                onClick={() => setForm({ ...form, coverUrl: '' })}
                className="min-h-[40px] px-3.5 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">
          Or paste a cover image URL
        </label>
        <input
          type="text"
          placeholder="https://example.com/cover.jpg"
          value={form.coverUrl}
          onChange={(e) => setForm({ ...form, coverUrl: e.target.value })}
          className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
        />
      </div>
    </div>
  );

  const renderBioFields = () => (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Storefront Bio
          </label>
          <span
            className={`text-xs font-mono tabular-nums ${
              form.bio.length > 260 ? 'text-amber-500 font-semibold' : 'text-slate-400'
            }`}
          >
            {form.bio.length} / 300
          </span>
        </div>
        <textarea
          rows={4}
          maxLength={300}
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          placeholder="Share what you offer, signature specialties, delivery speed, or story..."
          className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm leading-relaxed focus:outline-none focus:border-blue-500"
        />
        {!form.bio && (
          <div className="mt-2.5 space-y-1.5">
            <p className="text-[11px] font-medium text-slate-500">Quick bio starters:</p>
            <div className="flex flex-wrap gap-1.5">
              {BIO_TEMPLATES.map((tpl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setForm({ ...form, bio: tpl })}
                  className="text-left text-[11px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  + {tpl.slice(0, 48)}…
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-slate-400" />
          <span>Discovery Tags (comma separated)</span>
        </label>
        <input
          type="text"
          placeholder="espresso, wifi, same-day delivery, family friendly"
          value={form.tagsText}
          onChange={(e) => setForm({ ...form, tagsText: e.target.value })}
          className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );

  const renderLocationFields = () => (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/25 border border-blue-200 dark:border-blue-900 space-y-2.5">
        <label className="text-xs font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" />
          <span>Paste Google Maps Link (Auto-fills Address & Pin)</span>
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            placeholder="https://maps.app.goo.gl/... or https://www.google.com/maps/place/..."
            value={form.googleMapsUrl}
            onChange={(e) => setForm({ ...form, googleMapsUrl: e.target.value })}
            className="flex-1 h-11 px-3.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-950 text-sm"
          />
          <button
            type="button"
            onClick={handleResolveGoogleMaps}
            disabled={resolvingMap}
            className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap active:scale-[0.98] transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{resolvingMap ? 'Fetching...' : 'Fetch Address'}</span>
          </button>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          <span className="tabular-nums">
            Drag the pin to fine-tune storefront coordinates ({form.lat.toFixed(5)},{' '}
            {form.lng.toFixed(5)})
          </span>
        </p>
        <LeafletMap
          center={[form.lat, form.lng]}
          zoom={15}
          draggablePin
          onPinMove={handlePinMove}
          className="h-56 w-full rounded-xl"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3.5">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">Street Address</label>
          <input
            type="text"
            placeholder="Shop 14, Ground Floor, Main Road"
            value={form.addressLine}
            onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
            className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Area / Neighborhood
          </label>
          <input
            type="text"
            value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value })}
            className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">City</label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">State / Region</label>
          <input
            type="text"
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Postal Code</label>
            <input
              type="text"
              value={form.pincode}
              onChange={(e) => setForm({ ...form, pincode: e.target.value })}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Country</label>
            <input
              type="text"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderContactFields = () => (
    <div className="grid sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5 text-slate-400" />
          <span>Phone Number</span>
        </label>
        <input
          type="tel"
          placeholder="+91 98765 43210"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
          <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
          <span>WhatsApp Number</span>
        </label>
        <input
          type="tel"
          placeholder="+91 98765 43210"
          value={form.whatsapp}
          onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
          className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
          <Mail className="w-3.5 h-3.5 text-slate-400" />
          <span>Business Email</span>
        </label>
        <input
          type="email"
          placeholder="hello@yourbusiness.com"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-blue-500" />
          <span>Website</span>
        </label>
        <input
          type="url"
          placeholder="https://yourbusiness.com"
          value={form.website}
          onChange={(e) => setForm({ ...form, website: e.target.value })}
          className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
        />
      </div>
    </div>
  );

  const renderHoursAndSocialFields = () => (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Opening Hours</span>
          </p>
          <button
            type="button"
            onClick={handleCopyWeekdayHours}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            <Copy className="w-3 h-3" />
            <span>Apply Mon hours to Mon–Fri</span>
          </button>
        </div>
        {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((day) => {
          const slot = form.hours[day] || { open: '09:00', close: '21:00', closed: false };
          return (
            <div key={day} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="w-11 font-medium uppercase text-xs text-slate-500">{day}</span>
              <label className="inline-flex items-center gap-1.5 text-xs min-h-[36px]">
                <input
                  type="checkbox"
                  checked={!slot.closed}
                  onChange={(e) => {
                    setHoursCustomized(true);
                    setForm({
                      ...form,
                      hours: { ...form.hours, [day]: { ...slot, closed: !e.target.checked } },
                    });
                  }}
                />
                <span>Open</span>
              </label>
              {!slot.closed ? (
                <>
                  <input
                    type="time"
                    value={slot.open}
                    onChange={(e) => {
                      setHoursCustomized(true);
                      setForm({
                        ...form,
                        hours: { ...form.hours, [day]: { ...slot, open: e.target.value } },
                      });
                    }}
                    className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs tabular-nums"
                  />
                  <span className="text-xs text-slate-400">to</span>
                  <input
                    type="time"
                    value={slot.close}
                    onChange={(e) => {
                      setHoursCustomized(true);
                      setForm({
                        ...form,
                        hours: { ...form.hours, [day]: { ...slot, close: e.target.value } },
                      });
                    }}
                    className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs tabular-nums"
                  />
                </>
              ) : (
                <span className="text-xs text-slate-400">Closed</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid sm:grid-cols-2 gap-3.5 pt-4 border-t border-slate-100 dark:border-slate-800">
        {(['instagram', 'x', 'facebook', 'youtube', 'linkedin'] as const).map((net) => (
          <div key={net}>
            <label className="block text-xs font-medium text-slate-500 mb-1 capitalize">
              {net === 'x' ? 'X (Twitter)' : net} URL
            </label>
            <input
              type="url"
              placeholder={`https://${net === 'x' ? 'x' : net}.com/...`}
              value={form.socialLinks?.[net] || ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  socialLinks: { ...form.socialLinks, [net]: e.target.value },
                })
              }
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
        <div>
          <p className="text-xs font-medium text-slate-500">Profile Readiness</p>
          <p className="font-display text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
            {completedCount} of 7 sections completed ({completionPct}%)
          </p>
        </div>
        <div className="w-12 h-12 rounded-full border-2 border-slate-900 dark:border-white flex items-center justify-center font-display text-xs font-extrabold tabular-nums">
          {completionPct}%
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {WIZARD_STEPS.slice(0, 7).map((s) => {
          const filled = isStepCompleted(s.num);
          const skipped = !filled && skippedSteps.includes(s.num);
          return (
            <div
              key={s.num}
              className="flex items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-slate-900 text-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <CheckCircle2
                  className={`w-4 h-4 shrink-0 ${
                    filled
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-300 dark:text-slate-700'
                  }`}
                />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {s.label}{' '}
                    <span className="font-normal text-slate-400">
                      · {s.required ? 'Required' : 'Optional'}
                    </span>
                  </p>
                  <p className="mt-0.5 text-slate-500 truncate">
                    {filled
                      ? 'Ready to publish'
                      : skipped
                        ? 'Skipped — you can add this anytime'
                        : 'Not filled yet'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => goToStep(s.num)}
                className="min-h-[36px] px-3.5 rounded-full border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                {filled ? 'Edit' : 'Add'}
              </button>
            </div>
          );
        })}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
          Storefront Visibility
        </label>
        <select
          value={form.status}
          onChange={(e) =>
            setForm({ ...form, status: e.target.value as 'draft' | 'published' })
          }
          className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
        >
          <option value="published">Published (Live in global search & maps)</option>
          <option value="draft">Draft (Save privately for now)</option>
        </select>
      </div>
    </div>
  );

  const renderPreviewCard = () => (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-500">
        <span>Live Storefront Preview</span>
        <span className="font-mono text-[11px] text-slate-400">/b/{form.slug || 'handle'}</span>
      </div>
      <div className="h-32 bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800">
        {form.coverUrl && (
          <SafeImage
            src={form.coverUrl}
            alt="Cover preview"
            className="w-full h-full object-cover"
          />
        )}
      </div>
      <div className="px-4 pb-5 -mt-9 relative z-10">
        <div className="w-18 h-18 rounded-full p-[2.5px] bg-gradient-to-tr from-amber-500 via-rose-500 to-violet-600 inline-block">
          <div className="w-full h-full rounded-full border-2 border-white dark:border-slate-900 overflow-hidden bg-white dark:bg-slate-800">
            {form.logoUrl ? (
              <SafeImage
                src={form.logoUrl}
                alt="Logo preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">
                <Store className="w-6 h-6" />
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <h3 className="font-display text-base font-extrabold truncate text-slate-900 dark:text-white">
            {form.name || 'Your Business Name'}
          </h3>
          {existing?.isVerified && <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />}
        </div>
        <p className="text-xs text-slate-500">
          @{form.slug || 'your-business'} · {selectedCategoryName}
          {form.subcategory ? ` · ${form.subcategory}` : ''}
        </p>

        <p className="mt-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          {form.bio || 'Your business story will appear right here below your handle.'}
        </p>

        <div className="mt-3 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
          {fullPreviewAddress && (
            <p className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
              <span>{fullPreviewAddress}</span>
            </p>
          )}
          {form.phone && (
            <p className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <span>{form.phone}</span>
            </p>
          )}
          {form.website && (
            <p className="flex items-center gap-1.5 truncate">
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{form.website.replace(/^https?:\/\//, '')}</span>
            </p>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <span className="flex-1 h-8 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center justify-center">
            Follow
          </span>
          <span className="flex-1 h-8 rounded-full border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center justify-center">
            Directions
          </span>
          <span className="flex-1 h-8 rounded-full border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center justify-center">
            Enquire
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid xl:grid-cols-12 gap-6">
      <div className="xl:col-span-8 space-y-4">
        {/* Top Mode & Mobile Preview Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 tabular-nums">
            {guidedMode
              ? `Step ${step} of ${WIZARD_STEPS.length} · ${
                  currentStepMeta.required ? 'Required' : 'Optional'
                }`
              : 'Full storefront editor'}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobilePreviewOpen(true)}
              className="xl:hidden inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
            <button
              type="button"
              onClick={() => setGuidedMode((g) => !g)}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
            >
              {guidedMode ? 'Switch to full form' : 'Step-by-step setup'}
            </button>
          </div>
        </div>

        {guidedMode ? (
          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden"
          >
            {/* Instagram / X Onboarding Top Header */}
            <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => (step > 1 ? goToStep(step - 1) : null)}
                  disabled={step === 1}
                  className="min-h-[40px] px-2 -ml-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 whitespace-nowrap"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <span className="text-xs font-semibold text-slate-500 tabular-nums">
                  {step} / {WIZARD_STEPS.length}
                </span>

                {!currentStepMeta.required && step < WIZARD_STEPS.length ? (
                  <button
                    type="button"
                    onClick={handleSkipStep}
                    className="min-h-[40px] px-2 -mr-2 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
                  >
                    <span>Skip</span>
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
                    {currentStepMeta.required ? 'Required' : 'Ready'}
                  </span>
                )}
              </div>

              {/* Animated Segmented Progress Bar */}
              <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-slate-900 via-blue-600 to-rose-500 dark:from-white dark:via-blue-400 dark:to-rose-400"
                  initial={false}
                  animate={{ width: `${stepProgressPct}%` }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>

              {/* Quick Step Scroller */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                {WIZARD_STEPS.map((s) => {
                  const active = step === s.num;
                  const done = isStepCompleted(s.num);
                  return (
                    <button
                      key={s.num}
                      type="button"
                      onClick={() => goToStep(s.num)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                        active
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                          : done
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      {s.num}. {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Animated Step Body */}
            <div className="p-5 sm:p-7">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: direction * 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: direction * -20 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      {currentStepMeta.title}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {currentStepMeta.subtitle}
                    </p>
                  </div>

                  {step === 1 && renderBasicInfoFields()}
                  {step === 2 && renderProfilePictureFields()}
                  {step === 3 && renderCoverFields()}
                  {step === 4 && renderBioFields()}
                  {step === 5 && renderLocationFields()}
                  {step === 6 && renderContactFields()}
                  {step === 7 && renderHoursAndSocialFields()}
                  {step === 8 && renderReviewStep()}
                </motion.div>
              </AnimatePresence>

              {/* Bottom Thumb-Friendly Action Strip */}
              <div className="mt-7 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                {!currentStepMeta.required && step < WIZARD_STEPS.length ? (
                  <button
                    type="button"
                    onClick={handleSkipStep}
                    className="min-h-[44px] px-5 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    Skip for now
                  </button>
                ) : (
                  <div />
                )}

                {step < WIZARD_STEPS.length ? (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    onClick={handleNextStep}
                    className="min-h-[44px] px-7 py-2 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity whitespace-nowrap"
                  >
                    {step === 7 ? 'Review Profile' : 'Continue'}
                  </motion.button>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    type="submit"
                    disabled={saving}
                    className="min-h-[44px] px-7 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-60 whitespace-nowrap shadow-sm"
                  >
                    {saving ? 'Publishing...' : form.id ? 'Save Changes' : 'Publish Storefront'}
                  </motion.button>
                )}
              </div>
            </div>
          </form>
        ) : (
          /* Full Form Mode */
          <form onSubmit={handleSubmit} className="space-y-6">
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
              <h2 className="font-display text-lg font-bold">1. Basic Information</h2>
              {renderBasicInfoFields()}
              {renderBioFields()}
            </section>

            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
              <h2 className="font-display text-lg font-bold">2. Location, Maps & Contact</h2>
              {renderLocationFields()}
              {renderContactFields()}
            </section>

            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
              <h2 className="font-display text-lg font-bold">3. Business Hours & Social Links</h2>
              {renderHoursAndSocialFields()}
            </section>

            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
              <h2 className="font-display text-lg font-bold">4. Profile Picture & Cover Banner</h2>
              {renderProfilePictureFields()}
              {renderCoverFields()}
            </section>

            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
              <h2 className="font-display text-lg font-bold">5. Visibility</h2>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as 'draft' | 'published' })
                }
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              >
                <option value="published">Published (Live in search)</option>
                <option value="draft">Draft (Hidden from public)</option>
              </select>
            </section>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] px-7 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60"
              >
                {saving ? 'Saving...' : form.id ? 'Save Changes' : 'Publish Storefront'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Desktop Live Profile Preview */}
      <aside className="hidden xl:block xl:col-span-4">
        <div className="sticky top-20">{renderPreviewCard()}</div>
      </aside>

      {/* Mobile Bottom Sheet Preview Modal */}
      <AnimatePresence>
        {mobilePreviewOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="xl:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setMobilePreviewOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl p-4 pb-6 space-y-3"
            >
              <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
              <div className="flex items-center justify-between px-1">
                <span className="font-display text-sm font-bold">Mobile Profile Preview</span>
                <button
                  type="button"
                  onClick={() => setMobilePreviewOpen(false)}
                  aria-label="Close preview"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {renderPreviewCard()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
