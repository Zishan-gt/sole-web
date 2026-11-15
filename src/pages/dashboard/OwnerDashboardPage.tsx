import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Package,
  Pin,
  Plus,
  Printer,
  QrCode,
  Settings,
  ShieldCheck,
  Store,
  Trash2,
  Upload,
  Video,
  Warehouse,
} from 'lucide-react';
import { SafeImage } from '../../components/BusinessCard';
import { Link, navigate } from '../../components/RouterLink';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { useTheme } from '../../context/ThemeContext';
import { apiFetch } from '../../lib/api';
import type { BusinessSummary, CategoryItem, PostItem, ProductItem } from '../../types/app';
import { BusinessWizardAndEditor } from './BusinessWizardAndEditor';
import { ReelStudioUploader } from '../../components/dashboard/ReelStudioUploader';

interface OwnerDashboardProps {
  section: string;
}

export const OwnerDashboardPage: React.FC<OwnerDashboardProps> = ({ section }) => {
  const { profile, loading: authLoading, refreshProfile } = useAuth();
  const { pushToast, requestBrowserPush, unreadChatCount } = useRealtime();
  const { locale, setLocale } = useTheme();

  const [myBusinesses, setMyBusinesses] = useState<BusinessSummary[]>([]);
  const [selectedBizId, setSelectedBizId] = useState<string>('');
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Section data
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [inventoryData, setInventoryData] = useState<{
    items: Array<{
      productId: string;
      name: string;
      sku: string;
      sellingPrice: number;
      costPrice: number;
      marginPerUnit: number;
      quantity: number;
      lowStockThreshold: number;
      trackStock: boolean;
      availability: string;
      stockValue: number;
    }>;
    movements: Array<{ id: string; productId: string; change: number; type: string; note: string; createdAt: string }>;
    summary: {
      totalProducts: number;
      totalStockCostValue: number;
      totalRetailValue: number;
      estimatedProfitValue: number;
      lowStockCount: number;
      outOfStockCount: number;
    };
  } | null>(null);
  const [enquiries, setEnquiries] = useState<Array<{
    id: string;
    name: string;
    phone: string;
    message: string;
    status: string;
    createdAt: string;
  }>>([]);
  const [reviews, setReviews] = useState<Array<{
    id: string;
    rating: number;
    comment: string;
    ownerReply: string | null;
    authorName: string;
    createdAt: string;
  }>>([]);
  const [analyticsDays, setAnalyticsDays] = useState<7 | 30 | 90>(30);
  const [analytics, setAnalytics] = useState<{
    totals: Record<string, number>;
    series: Array<{ day: string; views: number; actions: number }>;
    topProducts: Array<{ id: string; name: string; viewCount: number; availability: string; price: string }>;
  } | null>(null);
  const [verificationData, setVerificationData] = useState<{
    requests: Array<{ id: string; documentType: string; status: string; rejectReason?: string; createdAt: string }>;
    businessStatus: string;
    isVerified: boolean;
  } | null>(null);
  const [qrData, setQrData] = useState<{ qrDataUrl: string; targetUrl: string; businessName: string } | null>(null);

  // Forms
  const [prodForm, setProdForm] = useState({
    id: '',
    type: 'product' as 'product' | 'service',
    name: '',
    description: '',
    categoryLabel: '',
    price: '0',
    discountPrice: '',
    unit: 'unit',
    durationMinutes: '30',
    sku: '',
    imageUrl: '/src/assets/images/biz_artisan_cafe_1794724070534.jpg',
    quantity: '10',
    costPrice: '0',
    lowStockThreshold: '5',
  });
  const [csvImportText, setCsvImportText] = useState('name,type,price,quantity,unit,category,sku\nArtisan Sourdough Loaf,product,280,15,loaf,Bakery,SD-01');
  const [stockAdjust, setStockAdjust] = useState<{ productId: string; type: 'in' | 'out' | 'adjust'; change: string; note: string } | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [verifForm, setVerifForm] = useState({
    documentType: 'GST Certificate',
    documentUrl: '/src/assets/images/hero_local_discovery_1794724069452.jpg',
    storefrontPhotoUrl: '/src/assets/images/biz_artisan_cafe_1794724070534.jpg',
    otpCode: '1234',
    otpVerified: false,
  });

  const loadBase = async () => {
    setLoading(true);
    try {
      const [bizRes, catRes] = await Promise.all([
        apiFetch<{ businesses: BusinessSummary[] }>('/api/owner/businesses'),
        apiFetch<{ categories: CategoryItem[] }>('/api/categories'),
      ]);
      setMyBusinesses(bizRes.businesses || []);
      setCategories(catRes.categories || []);
      if (bizRes.businesses?.length && !selectedBizId) {
        setSelectedBizId(bizRes.businesses[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      setLoading(false);
      return;
    }
    loadBase();
  }, [profile?.id, authLoading]);

  const currentBiz = myBusinesses.find((b) => b.id === selectedBizId) || myBusinesses[0] || null;

  useEffect(() => {
    if (!currentBiz) return;
    const bid = currentBiz.id;

    if (section === 'overview' || section === 'analytics') {
      apiFetch<typeof analytics>(`/api/owner/analytics?businessId=${bid}&days=${analyticsDays}`)
        .then(setAnalytics)
        .catch(() => {});
    }
    if (section === 'posts') {
      apiFetch<{ posts: PostItem[] }>(`/api/owner/posts?businessId=${bid}`)
        .then((r) => setPosts(r.posts || []))
        .catch(() => {});
    }
    if (section === 'products') {
      apiFetch<{ products: ProductItem[] }>(`/api/owner/products?businessId=${bid}`)
        .then((r) => setProducts(r.products || []))
        .catch(() => {});
    }
    if (section === 'inventory' || section === 'overview') {
      apiFetch<typeof inventoryData>(`/api/owner/inventory?businessId=${bid}`)
        .then(setInventoryData)
        .catch(() => {});
    }
    if (section === 'enquiries' || section === 'overview') {
      apiFetch<{ enquiries: typeof enquiries }>(`/api/owner/enquiries?businessId=${bid}`)
        .then((r) => setEnquiries(r.enquiries || []))
        .catch(() => {});
    }
    if (section === 'reviews') {
      apiFetch<{ reviews: typeof reviews }>(`/api/owner/reviews?businessId=${bid}`)
        .then((r) => setReviews(r.reviews || []))
        .catch(() => {});
    }
    if (section === 'verification') {
      apiFetch<typeof verificationData>(`/api/owner/verification?businessId=${bid}`)
        .then(setVerificationData)
        .catch(() => {});
    }
    if (section === 'qr') {
      apiFetch<typeof qrData>(`/api/owner/qr/${bid}`)
        .then(setQrData)
        .catch(() => {});
    }
  }, [currentBiz?.id, section, analyticsDays]);

  if (!authLoading && !profile) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <Store className="w-10 h-10 mx-auto text-slate-400" />
        <h1 className="mt-4 font-display text-2xl font-bold">Business Owner Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign in with Google to add your business storefront, manage inventory, and track customer enquiries.
        </p>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="mt-6 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold"
        >
          Sign in to continue
        </button>
      </div>
    );
  }

  const navItems = [
    { key: 'overview', path: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { key: 'profile', path: '/dashboard/profile', label: 'Profile Editor', icon: Store },
    { key: 'posts', path: '/dashboard/posts', label: 'Posts', icon: ImageIcon },
    { key: 'products', path: '/dashboard/products', label: 'Catalogue', icon: Package },
    { key: 'inventory', path: '/dashboard/inventory', label: 'Inventory', icon: Warehouse },
    { key: 'enquiries', path: '/dashboard/enquiries', label: 'Enquiries', icon: Inbox },
    { key: 'reviews', path: '/dashboard/reviews', label: 'Reviews', icon: MessageSquare },
    { key: 'analytics', path: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
    { key: 'verification', path: '/dashboard/verification', label: 'Verification', icon: ShieldCheck },
    { key: 'qr', path: '/dashboard/qr', label: 'QR Poster', icon: QrCode },
    { key: 'settings', path: '/dashboard/settings', label: 'Settings', icon: Settings },
  ];

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBiz) return;
    try {
      await apiFetch('/api/owner/products', {
        method: 'POST',
        body: JSON.stringify({
          id: prodForm.id || undefined,
          businessId: currentBiz.id,
          type: prodForm.type,
          name: prodForm.name,
          description: prodForm.description,
          categoryLabel: prodForm.categoryLabel,
          price: Number(prodForm.price) || 0,
          discountPrice: prodForm.discountPrice ? Number(prodForm.discountPrice) : null,
          unit: prodForm.unit,
          durationMinutes: prodForm.type === 'service' ? Number(prodForm.durationMinutes) || 30 : null,
          sku: prodForm.sku,
          images: prodForm.imageUrl ? [prodForm.imageUrl] : [],
          quantity: Number(prodForm.quantity) || 0,
          costPrice: Number(prodForm.costPrice) || 0,
          lowStockThreshold: Number(prodForm.lowStockThreshold) || 5,
        }),
      });
      const r = await apiFetch<{ products: ProductItem[] }>(`/api/owner/products?businessId=${currentBiz.id}`);
      setProducts(r.products || []);
      setProdForm({
        id: '',
        type: 'product',
        name: '',
        description: '',
        categoryLabel: '',
        price: '0',
        discountPrice: '',
        unit: 'unit',
        durationMinutes: '30',
        sku: '',
        imageUrl: '/src/assets/images/biz_artisan_cafe_1794724070534.jpg',
        quantity: '10',
        costPrice: '0',
        lowStockThreshold: '5',
      });
      pushToast({ title: 'Catalogue item saved' });
    } catch (err) {
      pushToast({ title: (err as Error).message, variant: 'error' });
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockAdjust || !currentBiz) return;
    try {
      await apiFetch('/api/owner/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          productId: stockAdjust.productId,
          type: stockAdjust.type,
          change: Number(stockAdjust.change) || 0,
          note: stockAdjust.note,
        }),
      });
      const inv = await apiFetch<typeof inventoryData>(`/api/owner/inventory?businessId=${currentBiz.id}`);
      setInventoryData(inv);
      setStockAdjust(null);
      pushToast({ title: 'Inventory updated' });
    } catch (err) {
      pushToast({ title: (err as Error).message, variant: 'error' });
    }
  };

  const lowOrOutCount =
    (inventoryData?.summary.lowStockCount ?? 0) + (inventoryData?.summary.outOfStockCount ?? 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Sidebar */}
        <aside className="lg:col-span-3 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Your Storefronts</span>
              <button
                type="button"
                onClick={() => navigate('/dashboard/onboarding')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add new</span>
              </button>
            </div>

            {myBusinesses.length > 0 ? (
              <select
                value={currentBiz?.id || ''}
                onChange={(e) => setSelectedBizId(e.target.value)}
                aria-label="Select business"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold"
              >
                {myBusinesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-slate-500">No storefront created yet.</p>
            )}

            {currentBiz && (
              <Link
                to={`/b/${currentBiz.slug}`}
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>View public profile</span>
              </Link>
            )}
          </div>

          <nav className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 flex lg:flex-col gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.key;
              return (
                <Link
                  key={item.key}
                  to={item.path}
                  className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.key === 'inventory' && lowOrOutCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white tabular-nums">
                      {lowOrOutCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Workspace */}
        <div className="lg:col-span-9 space-y-6">
          {loading ? (
            <div className="h-64 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          ) : section === 'onboarding' || !currentBiz ? (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                <h1 className="font-display text-xl font-bold">Create Your Business Profile</h1>
                <p className="text-xs text-slate-500 mt-1">
                  Go step by step — fill in what is required now and skip optional details like profile picture, cover, or socials for later.
                </p>
              </div>
              <BusinessWizardAndEditor
                categories={categories}
                isWizard
                onSaved={async (biz) => {
                  await refreshProfile();
                  setMyBusinesses((prev) => [biz, ...prev]);
                  setSelectedBizId(biz.id);
                  navigate('/dashboard');
                }}
              />
            </div>
          ) : (
            <>
              {section === 'overview' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="font-display text-2xl font-bold">{currentBiz.name}</h1>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {currentBiz.city || 'Global'} · {currentBiz.status} · Verification: {currentBiz.verificationStatus}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        to="/messages"
                        className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                        <span>Live Chats{unreadChatCount > 0 ? ` (${unreadChatCount})` : ''}</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => navigate('/dashboard/onboarding')}
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
                      >
                        + Add Business
                      </button>
                    </div>
                  </div>

                  {lowOrOutCount > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        <div className="text-xs">
                          <p className="font-semibold text-amber-900 dark:text-amber-200">
                            Inventory alert: {inventoryData?.summary.lowStockCount} low stock, {inventoryData?.summary.outOfStockCount} out of stock
                          </p>
                          <p className="text-amber-700 dark:text-amber-300">
                            Low-stock warnings are visible to you only; out-of-stock products display as Out of stock publicly.
                          </p>
                        </div>
                      </div>
                      <Link
                        to="/dashboard/inventory"
                        className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold whitespace-nowrap"
                      >
                        Manage stock
                      </Link>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {[
                      ['Profile Views', analytics?.totals.views ?? 0],
                      ['Call Clicks', analytics?.totals.calls ?? 0],
                      ['Directions', analytics?.totals.directions ?? 0],
                      ['WhatsApp', analytics?.totals.whatsapp ?? 0],
                      ['Enquiries', analytics?.totals.enquiries ?? enquiries.length],
                    ].map(([label, val]) => (
                      <div
                        key={String(label)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4"
                      >
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className="mt-1 font-display text-2xl font-bold tabular-nums">{val}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="font-display text-base font-bold">Recent Enquiries</h2>
                      <Link to="/dashboard/enquiries" className="text-xs text-blue-600 hover:underline">
                        Open inbox
                      </Link>
                    </div>
                    {enquiries.length === 0 ? (
                      <p className="text-xs text-slate-500">No enquiries received yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {enquiries.slice(0, 4).map((e) => (
                          <div key={e.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                            <div>
                              <p className="font-semibold">{e.name} · {e.phone}</p>
                              <p className="text-slate-600 dark:text-slate-400 mt-0.5">{e.message}</p>
                            </div>
                            <span className="capitalize text-slate-500">{e.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {section === 'profile' && (
                <BusinessWizardAndEditor
                  existing={currentBiz}
                  categories={categories}
                  onSaved={(updated) => {
                    setMyBusinesses((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
                  }}
                />
              )}

              {section === 'posts' && (
                <div className="space-y-6">
                  <ReelStudioUploader
                    businessId={currentBiz.id}
                    onCreated={(post: PostItem) => setPosts((prev) => [post, ...prev])}
                  />

                  <div className="grid sm:grid-cols-3 gap-4">
                    {posts.map((p) => (
                      <div
                        key={p.id}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col"
                      >
                        <div className="relative aspect-square bg-slate-100 dark:bg-slate-800">
                          <SafeImage src={p.posterUrl || p.mediaUrl} alt="" className="w-full h-full object-cover" />
                          {p.type === 'video' && (
                            <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-semibold inline-flex items-center gap-1 tabular-nums">
                              <Video className="w-3 h-3" />
                              {p.trimStartSec !== null &&
                              p.trimStartSec !== undefined &&
                              p.trimEndSec !== null &&
                              p.trimEndSec !== undefined
                                ? `${Math.max(0.5, Number(p.trimEndSec) - Number(p.trimStartSec)).toFixed(1)}s`
                                : 'Reel'}
                            </span>
                          )}
                        </div>
                        <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                          <p className="text-xs line-clamp-2">{p.caption || 'No caption'}</p>
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const res = await apiFetch<{ post: PostItem }>(`/api/owner/posts/${p.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ isPinned: !p.isPinned }),
                                  });
                                  setPosts((prev) => prev.map((x) => (x.id === p.id ? res.post : x)));
                                } catch (err) {
                                  pushToast({ title: (err as Error).message, variant: 'error' });
                                }
                              }}
                              className={`inline-flex items-center gap-1 text-xs font-medium ${
                                p.isPinned ? 'text-blue-600' : 'text-slate-500'
                              }`}
                            >
                              <Pin className="w-3.5 h-3.5" />
                              <span>{p.isPinned ? 'Pinned' : 'Pin'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/owner/posts/${p.id}`, { method: 'DELETE' });
                                setPosts((prev) => prev.filter((x) => x.id !== p.id));
                              }}
                              className="text-xs text-red-500 inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {section === 'products' && (
                <div className="space-y-6">
                  <form
                    onSubmit={handleSaveProduct}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-lg font-bold">
                        {prodForm.id ? 'Edit Product / Service' : 'Add Product or Service'}
                      </h2>
                      <a
                        href={`/api/owner/products/export-csv?businessId=${currentBiz.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export CSV</span>
                      </a>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <select
                        value={prodForm.type}
                        onChange={(e) => setProdForm({ ...prodForm, type: e.target.value as 'product' | 'service' })}
                        className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                      >
                        <option value="product">Product (Inventory tracked)</option>
                        <option value="service">Service (Skips inventory)</option>
                      </select>
                      <input
                        type="text"
                        required
                        placeholder="Item name *"
                        value={prodForm.name}
                        onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                        className="sm:col-span-2 h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                      />
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="Selling Price"
                        value={prodForm.price}
                        onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })}
                        className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Discount Price (optional)"
                        value={prodForm.discountPrice}
                        onChange={(e) => setProdForm({ ...prodForm, discountPrice: e.target.value })}
                        className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                      />
                      <input
                        type="text"
                        placeholder={prodForm.type === 'service' ? 'Duration (mins)' : 'Unit (e.g. kg, cup)'}
                        value={prodForm.type === 'service' ? prodForm.durationMinutes : prodForm.unit}
                        onChange={(e) =>
                          prodForm.type === 'service'
                            ? setProdForm({ ...prodForm, durationMinutes: e.target.value })
                            : setProdForm({ ...prodForm, unit: e.target.value })
                        }
                        className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                      />
                      {prodForm.type === 'product' && (
                        <>
                          <input
                            type="number"
                            placeholder="Initial Qty"
                            value={prodForm.quantity}
                            onChange={(e) => setProdForm({ ...prodForm, quantity: e.target.value })}
                            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Cost Price"
                            value={prodForm.costPrice}
                            onChange={(e) => setProdForm({ ...prodForm, costPrice: e.target.value })}
                            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                          />
                          <input
                            type="text"
                            placeholder="SKU"
                            value={prodForm.sku}
                            onChange={(e) => setProdForm({ ...prodForm, sku: e.target.value })}
                            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                          />
                        </>
                      )}
                      <input
                        type="text"
                        placeholder="Image URL"
                        value={prodForm.imageUrl}
                        onChange={(e) => setProdForm({ ...prodForm, imageUrl: e.target.value })}
                        className="sm:col-span-3 h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                      />
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Description..."
                      value={prodForm.description}
                      onChange={(e) => setProdForm({ ...prodForm, description: e.target.value })}
                      className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                    />
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold"
                    >
                      {prodForm.id ? 'Update Item' : 'Add to Catalogue'}
                    </button>
                  </form>

                  {/* Bulk CSV Import */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                    <h3 className="font-display text-sm font-bold">Bulk CSV Catalogue Import</h3>
                    <textarea
                      rows={3}
                      value={csvImportText}
                      onChange={(e) => setCsvImportText(e.target.value)}
                      className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const r = await apiFetch<{ imported: number }>('/api/owner/products/import-csv', {
                            method: 'POST',
                            body: JSON.stringify({ businessId: currentBiz.id, csv: csvImportText }),
                          });
                          pushToast({ title: `Imported ${r.imported} items` });
                          const list = await apiFetch<{ products: ProductItem[] }>(`/api/owner/products?businessId=${currentBiz.id}`);
                          setProducts(list.products || []);
                        } catch (err) {
                          pushToast({ title: (err as Error).message, variant: 'error' });
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
                    >
                      Import CSV Rows
                    </button>
                  </div>

                  {/* Catalogue List */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {products.map((p) => (
                        <div key={p.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                              <SafeImage src={p.images?.[0]} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{p.name}</p>
                              <p className="text-xs text-slate-500 tabular-nums">
                                {p.type} · ₹{Number(p.price).toLocaleString()} · {p.availability.replace('_', ' ')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={async () => {
                                const r = await apiFetch<{ product: ProductItem }>(`/api/owner/products/${p.id}/duplicate`, { method: 'POST' });
                                setProducts((prev) => [r.product, ...prev]);
                                pushToast({ title: 'Duplicated item' });
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" />
                              <span>Duplicate</span>
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/owner/products/${p.id}`, { method: 'DELETE' });
                                setProducts((prev) => prev.filter((x) => x.id !== p.id));
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-red-600 border border-red-200 dark:border-red-900"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {section === 'inventory' && inventoryData && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      ['Stock Cost Value', `₹${inventoryData.summary.totalStockCostValue.toLocaleString()}`],
                      ['Retail Value', `₹${inventoryData.summary.totalRetailValue.toLocaleString()}`],
                      ['Estimated Margin', `₹${inventoryData.summary.estimatedProfitValue.toLocaleString()}`],
                      ['Low / Out Stock', `${inventoryData.summary.lowStockCount} / ${inventoryData.summary.outOfStockCount}`],
                    ].map(([k, v]) => (
                      <div key={String(k)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                        <p className="text-xs text-slate-500">{k}</p>
                        <p className="mt-1 font-display text-xl font-bold tabular-nums">{v}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <tr>
                          <th className="p-3.5">Product</th>
                          <th className="p-3.5 text-right">Cost</th>
                          <th className="p-3.5 text-right">Sell</th>
                          <th className="p-3.5 text-right">Profit/Unit</th>
                          <th className="p-3.5 text-right">Qty</th>
                          <th className="p-3.5">Status (Owner)</th>
                          <th className="p-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {inventoryData.items.map((item) => (
                          <tr key={item.productId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="p-3.5 font-medium">{item.name}</td>
                            <td className="p-3.5 text-right tabular-nums">₹{item.costPrice}</td>
                            <td className="p-3.5 text-right tabular-nums">₹{item.sellingPrice}</td>
                            <td className="p-3.5 text-right tabular-nums text-emerald-600">₹{item.marginPerUnit}</td>
                            <td className="p-3.5 text-right font-bold tabular-nums">{item.quantity}</td>
                            <td className="p-3.5">
                              <span
                                className={`font-semibold ${
                                  item.availability === 'out_of_stock'
                                    ? 'text-red-600'
                                    : item.availability === 'low_stock'
                                      ? 'text-amber-600'
                                      : 'text-emerald-600'
                                }`}
                              >
                                {item.availability.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="p-3.5 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setStockAdjust({ productId: item.productId, type: 'in', change: '5', note: '' })
                                }
                                className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold"
                              >
                                Adjust
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Immutable Stock Movements Log */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                    <h3 className="font-display text-sm font-bold mb-3">Stock Movement Ledger</h3>
                    <div className="space-y-2 text-xs">
                      {inventoryData.movements.slice(0, 12).map((m) => (
                        <div key={m.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-none">
                          <span>
                            <strong className="uppercase">{m.type}</strong> · {m.note || 'Stock adjustment'}
                          </span>
                          <span className="font-mono tabular-nums font-semibold">
                            {m.change > 0 ? `+${m.change}` : m.change}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {section === 'enquiries' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
                  <div className="p-5 font-display text-lg font-bold">Customer Enquiries Inbox</div>
                  {enquiries.length === 0 ? (
                    <p className="p-8 text-center text-sm text-slate-500">Inbox is empty.</p>
                  ) : (
                    enquiries.map((e) => (
                      <div key={e.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold">{e.name} · {e.phone}</p>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{e.message}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {new Date(e.createdAt).toLocaleString()} · Status: {e.status}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs shrink-0">
                          {e.status !== 'replied' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/owner/enquiries/${e.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: 'replied' }),
                                });
                                setEnquiries((prev) =>
                                  prev.map((x) => (x.id === e.id ? { ...x, status: 'replied' } : x))
                                );
                              }}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold"
                            >
                              Mark replied
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/owner/enquiries/${e.id}`, { method: 'DELETE' });
                              setEnquiries((prev) => prev.filter((x) => x.id !== e.id));
                            }}
                            className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {section === 'reviews' && (
                <div className="space-y-4">
                  <h2 className="font-display text-xl font-bold">Customer Reviews</h2>
                  {reviews.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500">
                      No reviews yet.
                    </div>
                  ) : (
                    reviews.map((r) => (
                      <div key={r.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">{r.authorName} · {r.rating} ★</span>
                          <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-300">{r.comment}</p>
                        {r.ownerReply ? (
                          <p className="text-xs bg-slate-50 dark:bg-slate-950 p-3 rounded-xl">
                            <strong>Your reply:</strong> {r.ownerReply}
                          </p>
                        ) : (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Write your one-time reply..."
                              value={replyDrafts[r.id] || ''}
                              onChange={(e) => setReplyDrafts({ ...replyDrafts, [r.id]: e.target.value })}
                              className="flex-1 h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                const text = replyDrafts[r.id] || '';
                                if (!text.trim()) return;
                                await apiFetch(`/api/owner/reviews/${r.id}/reply`, {
                                  method: 'POST',
                                  body: JSON.stringify({ reply: text }),
                                });
                                setReviews((prev) =>
                                  prev.map((x) => (x.id === r.id ? { ...x, ownerReply: text } : x))
                                );
                                pushToast({ title: 'Reply posted' });
                              }}
                              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
                            >
                              Reply
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {section === 'analytics' && analytics && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-xl font-bold">Storefront Analytics</h2>
                    <div className="flex gap-1 bg-slate-200 dark:bg-slate-800 p-1 rounded-xl">
                      {([7, 30, 90] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setAnalyticsDays(d)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                            analyticsDays === d ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-500'
                          }`}
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                    <h3 className="text-sm font-semibold mb-4">Daily Engagement Trend</h3>
                    {analytics.series.length === 0 ? (
                      <p className="text-xs text-slate-500 py-8 text-center">No events recorded in this period yet.</p>
                    ) : (
                      <div className="flex items-end gap-2 h-40 pt-4">
                        {analytics.series.map((pt) => {
                          const maxVal = Math.max(1, ...analytics.series.map((s) => s.views + s.actions));
                          const hPct = Math.max(10, Math.round(((pt.views + pt.actions) / maxVal) * 100));
                          return (
                            <div key={pt.day} className="flex-1 flex flex-col items-center gap-1 group">
                              <div
                                title={`${pt.day}: ${pt.views} views, ${pt.actions} actions`}
                                style={{ height: `${hPct}%` }}
                                className="w-full max-w-[28px] bg-blue-600/85 hover:bg-blue-600 rounded-t-md transition-all"
                              />
                              <span className="text-[9px] text-slate-400 truncate max-w-full">
                                {pt.day.slice(5)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                    <h3 className="text-sm font-semibold mb-3">Top Products by Views</h3>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {analytics.topProducts.map((tp) => (
                        <div key={tp.id} className="py-2.5 flex items-center justify-between">
                          <span className="font-medium">{tp.name}</span>
                          <span className="tabular-nums font-semibold">{tp.viewCount} views</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {section === 'verification' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-lg font-bold">Business Verification (Blue Tick)</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Current status: <strong className="capitalize">{verificationData?.businessStatus || currentBiz.verificationStatus}</strong>
                      </p>
                    </div>
                    {currentBiz.isVerified && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                        <CheckCircle2 className="w-4 h-4" /> Verified
                      </span>
                    )}
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await apiFetch('/api/owner/verification', {
                          method: 'POST',
                          body: JSON.stringify({
                            businessId: currentBiz.id,
                            documentType: verifForm.documentType,
                            documentUrls: [verifForm.documentUrl],
                            storefrontPhotoUrl: verifForm.storefrontPhotoUrl,
                            phoneVerified: verifForm.otpVerified,
                          }),
                        });
                        pushToast({ title: 'Verification submitted to admin queue' });
                        const v = await apiFetch<typeof verificationData>(`/api/owner/verification?businessId=${currentBiz.id}`);
                        setVerificationData(v);
                      } catch (err) {
                        pushToast({ title: (err as Error).message, variant: 'error' });
                      }
                    }}
                    className="space-y-4"
                  >
                    <select
                      value={verifForm.documentType}
                      onChange={(e) => setVerifForm({ ...verifForm, documentType: e.target.value })}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    >
                      <option value="GST Certificate">GST Certificate</option>
                      <option value="Udyam Registration">Udyam Registration</option>
                      <option value="Shop & Establishment Licence">Shop & Establishment Licence</option>
                      <option value="Utility Bill">Utility Bill</option>
                    </select>
                    <input
                      type="text"
                      required
                      placeholder="Document Image URL"
                      value={verifForm.documentUrl}
                      onChange={(e) => setVerifForm({ ...verifForm, documentUrl: e.target.value })}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Storefront Photo URL"
                      value={verifForm.storefrontPhotoUrl}
                      onChange={(e) => setVerifForm({ ...verifForm, storefrontPhotoUrl: e.target.value })}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    />
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <input
                        type="text"
                        value={verifForm.otpCode}
                        onChange={(e) => setVerifForm({ ...verifForm, otpCode: e.target.value })}
                        className="w-28 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setVerifForm({ ...verifForm, otpVerified: true })}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
                      >
                        {verifForm.otpVerified ? 'Phone Confirmed' : 'Confirm Phone OTP'}
                      </button>
                    </div>
                    <button
                      type="submit"
                      className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold"
                    >
                      Submit Verification Request
                    </button>
                  </form>
                </div>
              )}

              {section === 'qr' && qrData && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-5 print:border-none">
                  <h2 className="font-display text-2xl font-bold">{qrData.businessName}</h2>
                  <p className="text-sm text-slate-500">Scan to view our products, reviews, and Google Maps directions</p>
                  <div className="inline-block p-4 bg-white rounded-2xl border border-slate-200">
                    <img src={qrData.qrDataUrl} alt="Storefront QR Code" className="w-56 h-56 mx-auto" />
                  </div>
                  <p className="text-xs font-mono text-slate-400 break-all">{qrData.targetUrl}</p>
                  <div className="flex justify-center gap-3 print:hidden">
                    <a
                      href={qrData.qrDataUrl}
                      download={`${currentBiz.slug}-qr.png`}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download PNG</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print / Save PDF</span>
                    </button>
                  </div>
                </div>
              )}

              {section === 'settings' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
                  <h2 className="font-display text-lg font-bold">Dashboard Settings</h2>
                  <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <p className="text-sm font-semibold">Language Preference</p>
                      <p className="text-xs text-slate-500">Switch between English and Hindi</p>
                    </div>
                    <select
                      value={locale}
                      onChange={(e) => setLocale(e.target.value as 'en' | 'hi')}
                      className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      <option value="en">English</option>
                      <option value="hi">हिन्दी (Hindi)</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-semibold">Real-Time Push Notifications</p>
                      <p className="text-xs text-slate-500">Receive browser alerts for new enquiries & reviews</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const perm = await requestBrowserPush();
                        pushToast({ title: `Notification permission: ${perm}` });
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
                    >
                      Enable Browser Push
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stock Adjustment Modal */}
      {stockAdjust && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleAdjustStock}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-bold">Record Stock Movement</h3>
            <select
              value={stockAdjust.type}
              onChange={(e) => setStockAdjust({ ...stockAdjust, type: e.target.value as 'in' | 'out' | 'adjust' })}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            >
              <option value="in">Stock In (+)</option>
              <option value="out">Stock Out (-)</option>
              <option value="adjust">Manual Adjust (+/-)</option>
            </select>
            <input
              type="number"
              required
              placeholder="Quantity"
              value={stockAdjust.change}
              onChange={(e) => setStockAdjust({ ...stockAdjust, change: e.target.value })}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
            <input
              type="text"
              placeholder="Note (e.g. Restock invoice #42)"
              value={stockAdjust.note}
              onChange={(e) => setStockAdjust({ ...stockAdjust, note: e.target.value })}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStockAdjust(null)}
                className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-semibold"
              >
                Save Movement
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
