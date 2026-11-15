import React, { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Check,
  Flag,
  FolderTree,
  LayoutDashboard,
  Shield,
  Store,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { SafeImage } from '../../components/BusinessCard';
import { Link, navigate } from '../../components/RouterLink';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { apiFetch } from '../../lib/api';
import type { BusinessSummary, CategoryItem } from '../../types/app';

export const AdminDashboardPage: React.FC<{ section: string }> = ({ section }) => {
  const { profile, loading: authLoading } = useAuth();
  const { pushToast } = useRealtime();

  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [verifications, setVerifications] = useState<Array<{
    id: string;
    businessId: string;
    businessName: string;
    businessSlug: string;
    businessCity: string;
    documentType: string;
    documentUrls: string[];
    storefrontPhotoUrl: string;
    phoneVerified: boolean;
    status: string;
    rejectReason: string | null;
    createdAt: string;
  }>>([]);
  const [reports, setReports] = useState<Array<{
    id: string;
    targetType: string;
    targetId: string;
    reason: string;
    details: string;
    status: string;
    createdAt: string;
  }>>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [users, setUsers] = useState<Array<{
    id: string;
    email: string;
    fullName: string;
    role: 'customer' | 'owner' | 'admin';
    createdAt: string;
  }>>([]);
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; action: string; entity: string; createdAt: string }>>([]);

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [newCat, setNewCat] = useState({ name: '', icon: 'store', sortOrder: '13' });
  const [bizFilter, setBizFilter] = useState('');
  const [csvText, setCsvText] = useState(
    'name,category,phone,address,city,latitude,longitude\nFraser Road Books,Other,+91 612 222 1100,14 Fraser Road,Patna,25.6095,85.1391'
  );

  useEffect(() => {
    if (authLoading || profile?.role !== 'admin') return;
    if (section === 'overview') {
      apiFetch<Record<string, number>>('/api/admin/stats').then(setStats).catch(() => {});
      apiFetch<{ logs: typeof auditLogs }>('/api/admin/audit-log').then((r) => setAuditLogs(r.logs || [])).catch(() => {});
    }
    if (section === 'verifications') {
      apiFetch<{ verifications: typeof verifications }>('/api/admin/verifications')
        .then((r) => setVerifications(r.verifications || []))
        .catch(() => {});
    }
    if (section === 'reports') {
      apiFetch<{ reports: typeof reports }>('/api/admin/reports')
        .then((r) => setReports(r.reports || []))
        .catch(() => {});
    }
    if (section === 'categories') {
      apiFetch<{ categories: CategoryItem[] }>('/api/admin/categories')
        .then((r) => setCategories(r.categories || []))
        .catch(() => {});
    }
    if (section === 'businesses') {
      apiFetch<{ businesses: BusinessSummary[] }>(`/api/admin/businesses?q=${encodeURIComponent(bizFilter)}`)
        .then((r) => setBusinesses(r.businesses || []))
        .catch(() => {});
    }
    if (section === 'users') {
      apiFetch<{ users: typeof users }>('/api/admin/users')
        .then((r) => setUsers(r.users || []))
        .catch(() => {});
    }
  }, [profile?.role, authLoading, section, bizFilter]);

  if (!authLoading && profile?.role !== 'admin') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <Shield className="w-10 h-10 mx-auto text-slate-400" />
        <h1 className="mt-4 font-display text-2xl font-bold">Admin Console Restricted</h1>
        <p className="mt-2 text-sm text-slate-500">
          Administrator privileges are required to review verifications and moderate listings.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold"
        >
          Back to Discover
        </button>
      </div>
    );
  }

  const nav = [
    { key: 'overview', path: '/admin', label: 'Overview', icon: LayoutDashboard },
    { key: 'verifications', path: '/admin/verifications', label: 'Verifications', icon: BadgeCheck },
    { key: 'reports', path: '/admin/reports', label: 'Reports', icon: Flag },
    { key: 'categories', path: '/admin/categories', label: 'Categories', icon: FolderTree },
    { key: 'businesses', path: '/admin/businesses', label: 'Businesses', icon: Store },
    { key: 'users', path: '/admin/users', label: 'Users', icon: Users },
    { key: 'import', path: '/admin/import', label: 'CSV Seed', icon: Upload },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-12 gap-6">
      <aside className="lg:col-span-3">
        <nav className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 flex lg:flex-col gap-1 overflow-x-auto">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                to={item.path}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap ${
                  section === item.key
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:col-span-9 space-y-6">
        {section === 'overview' && stats && (
          <div className="space-y-6">
            <h1 className="font-display text-2xl font-bold">Platform Moderation Overview</h1>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Businesses', stats.businesses],
                ['Owners', stats.owners],
                ['Customers', stats.customers],
                ['Products', stats.products],
                ['Reviews', stats.reviews],
                ['Events Today', stats.eventsToday],
                ['Pending Verifications', stats.pendingVerifications],
                ['Open Reports', stats.openReports],
              ].map(([label, val]) => (
                <div key={String(label)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 font-display text-2xl font-bold tabular-nums">{val ?? 0}</p>
                </div>
              ))}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <h2 className="font-display text-base font-bold mb-3">Recent Audit Log</h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {auditLogs.map((l) => (
                  <div key={l.id} className="py-2 flex items-center justify-between">
                    <span className="font-mono">{l.action} · {l.entity}</span>
                    <span className="text-slate-400">{new Date(l.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === 'verifications' && (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold">Verification Queue</h1>
            {verifications.map((v) => (
              <div key={v.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold">{v.businessName}</h2>
                    <p className="text-xs text-slate-500">
                      {v.businessCity} · {v.documentType} · Phone {v.phoneVerified ? 'Verified' : 'Unverified'} · Status: <strong>{v.status}</strong>
                    </p>
                    {v.rejectReason && (
                      <p className="mt-1 text-xs text-red-600">Reason: {v.rejectReason}</p>
                    )}
                  </div>

                  {v.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/verifications/${v.id}/review`, {
                            method: 'POST',
                            body: JSON.stringify({ action: 'approve' }),
                          });
                          setVerifications((prev) => prev.map((x) => (x.id === v.id ? { ...x, status: 'approved' } : x)));
                          pushToast({ title: `${v.businessName} verified` });
                        }}
                        className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve Blue Tick</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectId(v.id)}
                        className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <SafeImage src={v.documentUrls?.[0]} alt="Document" className="w-full h-full object-cover" />
                  </div>
                  <div className="aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <SafeImage src={v.storefrontPhotoUrl} alt="Storefront" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {section === 'reports' && (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold">Moderation Reports Queue</h1>
            {reports.map((r) => (
              <div key={r.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">{r.targetType} · {r.status}</p>
                  <p className="text-sm font-bold mt-0.5">{r.reason}</p>
                  {r.details && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{r.details}</p>}
                </div>
                {r.status === 'open' && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/reports/${r.id}/action`, {
                          method: 'POST',
                          body: JSON.stringify({ action: 'dismiss' }),
                        });
                        setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: 'dismissed' } : x)));
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold"
                    >
                      Dismiss
                    </button>
                    {r.targetType !== 'business' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/reports/${r.id}/action`, {
                            method: 'POST',
                            body: JSON.stringify({ action: 'hide_content' }),
                          });
                          setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: 'actioned' } : x)));
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold"
                      >
                        Hide Content
                      </button>
                    )}
                    {r.targetType === 'business' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/reports/${r.id}/action`, {
                            method: 'POST',
                            body: JSON.stringify({ action: 'suspend_business' }),
                          });
                          setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: 'actioned' } : x)));
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold"
                      >
                        Suspend Business
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {section === 'categories' && (
          <div className="space-y-6">
            <h1 className="font-display text-2xl font-bold">Category Manager</h1>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await apiFetch<{ category: CategoryItem }>('/api/admin/categories', {
                  method: 'POST',
                  body: JSON.stringify({
                    name: newCat.name,
                    icon: newCat.icon,
                    sortOrder: Number(newCat.sortOrder) || 0,
                  }),
                });
                setCategories((prev) => [...prev, r.category]);
                setNewCat({ name: '', icon: 'store', sortOrder: '13' });
                pushToast({ title: 'Category created' });
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-wrap gap-3"
            >
              <input
                type="text"
                required
                placeholder="Category name"
                value={newCat.name}
                onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                className="flex-1 min-w-[180px] h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
              <input
                type="number"
                placeholder="Order"
                value={newCat.sortOrder}
                onChange={(e) => setNewCat({ ...newCat, sortOrder: e.target.value })}
                className="w-24 h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
              <button type="submit" className="px-4 h-10 rounded-xl bg-blue-600 text-white text-xs font-semibold">
                Add Category
              </button>
            </form>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
              {categories.map((c) => (
                <div key={c.id} className="p-4 flex items-center justify-between text-xs">
                  <span>
                    <strong className="text-sm">{c.name}</strong> · /{c.slug} · Order {c.sortOrder}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await apiFetch<{ category: CategoryItem }>(`/api/admin/categories/${c.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ isActive: !c.isActive }),
                        });
                        setCategories((prev) => prev.map((x) => (x.id === c.id ? r.category : x)));
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
                    >
                      {c.isActive ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {section === 'businesses' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h1 className="font-display text-2xl font-bold">All Businesses</h1>
              <input
                type="text"
                placeholder="Filter by name or city..."
                value={bizFilter}
                onChange={(e) => setBizFilter(e.target.value)}
                className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs w-64"
              />
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
              {businesses.map((b) => (
                <div key={b.id} className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <Link to={`/b/${b.slug}`} className="text-sm font-bold hover:underline">
                      {b.name}
                    </Link>
                    <p className="text-slate-500">
                      {b.city} · Status: {b.status} · {b.isVerified ? 'Verified' : 'Unverified'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await apiFetch<{ business: BusinessSummary }>(`/api/admin/businesses/${b.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ isVerified: !b.isVerified }),
                        });
                        setBusinesses((prev) => prev.map((x) => (x.id === b.id ? r.business : x)));
                      }}
                      className={`px-3 py-1.5 rounded-lg font-semibold ${
                        b.isVerified ? 'bg-blue-600 text-white' : 'border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {b.isVerified ? 'Unverify' : 'Verify Blue Tick'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const next = b.status === 'suspended' ? 'published' : 'suspended';
                        const r = await apiFetch<{ business: BusinessSummary }>(`/api/admin/businesses/${b.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ status: next }),
                        });
                        setBusinesses((prev) => prev.map((x) => (x.id === b.id ? r.business : x)));
                      }}
                      className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 font-semibold"
                    >
                      {b.status === 'suspended' ? 'Unsuspend' : 'Suspend'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {section === 'users' && (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold">Users & Role Management</h1>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => (
                <div key={u.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="text-sm font-semibold">{u.fullName}</p>
                    <p className="text-slate-500">{u.email}</p>
                  </div>
                  <select
                    value={u.role}
                    onChange={async (e) => {
                      const role = e.target.value as 'customer' | 'owner' | 'admin';
                      await apiFetch(`/api/admin/users/${u.id}/role`, {
                        method: 'PATCH',
                        body: JSON.stringify({ role }),
                      });
                      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
                      pushToast({ title: `Updated role to ${role}` });
                    }}
                    className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    <option value="customer">customer</option>
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {section === 'import' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h1 className="font-display text-xl font-bold">Bulk Seed & CSV Business Import</h1>
            <p className="text-xs text-slate-500">
              Format: name,category,phone,address,city,latitude,longitude
            </p>
            <textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  const r = await apiFetch<{ imported: number }>('/api/admin/import-csv', {
                    method: 'POST',
                    body: JSON.stringify({ csv: csvText }),
                  });
                  pushToast({ title: `Imported ${r.imported} businesses` });
                } catch (err) {
                  pushToast({ title: (err as Error).message, variant: 'error' });
                }
              }}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold"
            >
              Import Businesses from CSV
            </button>
          </div>
        )}
      </div>

      {/* Reject Reason Modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-display text-lg font-bold">Rejection Reason</h3>
            <textarea
              rows={3}
              required
              placeholder="Explain why verification was rejected..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRejectId(null)}
                className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!rejectReason.trim()) return;
                  await apiFetch(`/api/admin/verifications/${rejectId}/review`, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'reject', rejectReason }),
                  });
                  setVerifications((prev) =>
                    prev.map((x) => (x.id === rejectId ? { ...x, status: 'rejected', rejectReason } : x))
                  );
                  setRejectId(null);
                  setRejectReason('');
                  pushToast({ title: 'Verification rejected' });
                }}
                className="flex-1 h-10 rounded-xl bg-red-600 text-white text-xs font-semibold"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
