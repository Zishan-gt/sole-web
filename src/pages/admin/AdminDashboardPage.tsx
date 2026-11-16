import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Check,
  Copy,
  Eye,
  EyeOff,
  Film,
  Flag,
  FolderTree,
  LayoutDashboard,
  RefreshCw,
  Search,
  Shield,
  Store,
  Trash2,
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

const ROOT_ADMIN_UID = 'Oe9ZDxYz0qN0dUBhXKNxH4PB6Y73';

interface VerificationQueueItem {
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
}

interface ReportQueueItem {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
}

interface AdminUserRow {
  id: string;
  uid: string;
  email: string;
  fullName: string;
  handle: string | null;
  role: 'customer' | 'owner' | 'admin';
  createdAt: string;
}

interface AdminPostRow {
  id: string;
  businessId: string;
  type: 'photo' | 'video';
  mediaUrl: string;
  posterUrl: string | null;
  caption: string | null;
  isHidden: boolean;
  isPinned: boolean;
  createdAt: string;
  businessName: string;
  businessSlug: string;
  businessCity: string | null;
}

interface AuditLogRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
  actorUid: string | null;
}

const SECTION_TITLES: Record<string, string> = {
  overview: 'Platform Overview',
  verifications: 'Verification Queue',
  reports: 'Moderation Reports',
  posts: 'Posts & Reels',
  categories: 'Categories',
  businesses: 'Businesses',
  users: 'Users & Roles',
  import: 'CSV Seed Import',
};

export const AdminDashboardPage: React.FC<{ section: string }> = ({ section }) => {
  const { firebaseUser, profile, loading: authLoading, refreshProfile } = useAuth();
  const { pushToast } = useRealtime();

  const isAuthorizedAdmin =
    profile?.role === 'admin' || firebaseUser?.uid === ROOT_ADMIN_UID;

  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [stats, setStats] = useState<Record<string, number | string> | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [verifications, setVerifications] = useState<VerificationQueueItem[]>([]);
  const [verifFilter, setVerifFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [reports, setReports] = useState<ReportQueueItem[]>([]);
  const [reportFilter, setReportFilter] = useState<'all' | 'open' | 'actioned' | 'dismissed'>('open');
  const [postsList, setPostsList] = useState<AdminPostRow[]>([]);
  const [postFilter, setPostFilter] = useState('');
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [bizFilter, setBizFilter] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [userFilter, setUserFilter] = useState('');

  const [copiedUid, setCopiedUid] = useState(false);

  // Modals & forms
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'business' | 'category' | 'post';
    id: string;
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [newCat, setNewCat] = useState({ name: '', icon: 'store', sortOrder: '13' });
  const [csvText, setCsvText] = useState(
    'name,category,phone,address,city,latitude,longitude\nFraser Road Books,Other,+91 612 222 1100,14 Fraser Road,Patna,25.6095,85.1391'
  );
  const [importingCsv, setImportingCsv] = useState(false);

  const triggerReload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (authLoading || !isAuthorizedAdmin) return;
    let cancelled = false;
    setSectionError(null);
    setSectionLoading(true);

    const run = async () => {
      try {
        if (section === 'overview') {
          const [s, l] = await Promise.all([
            apiFetch<Record<string, number | string>>('/api/admin/stats'),
            apiFetch<{ logs: AuditLogRow[] }>('/api/admin/audit-log'),
          ]);
          if (cancelled) return;
          setStats(s);
          setAuditLogs(l.logs || []);
        } else if (section === 'verifications') {
          const r = await apiFetch<{ verifications: VerificationQueueItem[] }>('/api/admin/verifications');
          if (!cancelled) setVerifications(r.verifications || []);
        } else if (section === 'reports') {
          const r = await apiFetch<{ reports: ReportQueueItem[] }>('/api/admin/reports');
          if (!cancelled) setReports(r.reports || []);
        } else if (section === 'posts') {
          const r = await apiFetch<{ posts: AdminPostRow[] }>(
            `/api/admin/posts?q=${encodeURIComponent(postFilter)}`
          );
          if (!cancelled) setPostsList(r.posts || []);
        } else if (section === 'categories') {
          const r = await apiFetch<{ categories: CategoryItem[] }>('/api/admin/categories');
          if (!cancelled) setCategories(r.categories || []);
        } else if (section === 'businesses') {
          const r = await apiFetch<{ businesses: BusinessSummary[] }>(
            `/api/admin/businesses?q=${encodeURIComponent(bizFilter)}`
          );
          if (!cancelled) setBusinesses(r.businesses || []);
        } else if (section === 'users') {
          const r = await apiFetch<{ users: AdminUserRow[] }>(
            `/api/admin/users?q=${encodeURIComponent(userFilter)}`
          );
          if (!cancelled) setUsers(r.users || []);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = (err as Error).message || 'Failed to load admin section';
          setSectionError(msg);
        }
      } finally {
        if (!cancelled) setSectionLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [isAuthorizedAdmin, authLoading, section, bizFilter, postFilter, userFilter, reloadKey]);

  const filteredVerifications = useMemo(
    () => verifications.filter((v) => (verifFilter === 'all' ? true : v.status === verifFilter)),
    [verifications, verifFilter]
  );

  const filteredReports = useMemo(
    () => reports.filter((r) => (reportFilter === 'all' ? true : r.status === reportFilter)),
    [reports, reportFilter]
  );

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <div className="h-12 w-72 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="grid sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!isAuthorizedAdmin) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-12 h-12 mx-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center">
          <Shield className="w-6 h-6 text-slate-500" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
          Admin Console Restricted
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          This workspace is restricted to the authorized administrator account.
        </p>

        <div className="mt-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-left text-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Authorized Admin ID</span>
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
              {ROOT_ADMIN_UID}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-slate-500">Current Session</span>
            <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[240px]">
              {firebaseUser ? `${firebaseUser.uid}` : 'Not signed in'}
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold whitespace-nowrap shrink-0"
          >
            {firebaseUser ? 'Switch to Admin Account' : 'Sign In as Admin'}
          </button>
          {firebaseUser && (
            <button
              type="button"
              onClick={() => refreshProfile()}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold whitespace-nowrap shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Re-check Permissions
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold whitespace-nowrap shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Back to Discover
          </button>
        </div>
      </div>
    );
  }

  const nav = [
    { key: 'overview', path: '/admin', label: 'Overview', icon: LayoutDashboard },
    { key: 'verifications', path: '/admin/verifications', label: 'Verifications', icon: BadgeCheck },
    { key: 'reports', path: '/admin/reports', label: 'Reports', icon: Flag },
    { key: 'posts', path: '/admin/posts', label: 'Posts & Reels', icon: Film },
    { key: 'categories', path: '/admin/categories', label: 'Categories', icon: FolderTree },
    { key: 'businesses', path: '/admin/businesses', label: 'Businesses', icon: Store },
    { key: 'users', path: '/admin/users', label: 'Users & Roles', icon: Users },
    { key: 'import', path: '/admin/import', label: 'CSV Seed', icon: Upload },
  ];

  const sectionLabel = SECTION_TITLES[section] || 'Platform Overview';

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.type === 'business') {
        await apiFetch(`/api/admin/businesses/${confirmDelete.id}`, { method: 'DELETE' });
        setBusinesses((prev) => prev.filter((b) => b.id !== confirmDelete.id));
        pushToast({ title: `Deleted business ${confirmDelete.label}` });
      } else if (confirmDelete.type === 'category') {
        await apiFetch(`/api/admin/categories/${confirmDelete.id}`, { method: 'DELETE' });
        setCategories((prev) => prev.filter((c) => c.id !== confirmDelete.id));
        pushToast({ title: `Deleted category ${confirmDelete.label}` });
      } else if (confirmDelete.type === 'post') {
        await apiFetch(`/api/admin/posts/${confirmDelete.id}`, { method: 'DELETE' });
        setPostsList((prev) => prev.filter((p) => p.id !== confirmDelete.id));
        pushToast({ title: 'Post permanently deleted' });
      }
      setConfirmDelete(null);
    } catch (err) {
      pushToast({ title: (err as Error).message || 'Delete failed', variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Bar Contract: Breadcrumb + Admin UID + Refresh Action */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 min-w-0">
          <span className="font-display text-sm font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
            Admin Console
          </span>
          <span aria-hidden="true">/</span>
          <span className="font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
            {sectionLabel}
          </span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(ROOT_ADMIN_UID);
              setCopiedUid(true);
              setTimeout(() => setCopiedUid(false), 1500);
            }}
            title="Copy Admin ID"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <span>ID: {ROOT_ADMIN_UID}</span>
            {copiedUid ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="hidden sm:inline text-xs text-slate-500 truncate max-w-[200px]">
            {profile?.email || firebaseUser?.email || 'Authenticated'}
          </span>
          <button
            type="button"
            onClick={triggerReload}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${sectionLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Sidebar Navigation (~240-260px on 12-col desktop) */}
        <aside className="lg:col-span-3">
          <nav
            aria-label="Admin sections"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 flex lg:flex-col gap-1 overflow-x-auto"
          >
            {nav.map((item) => {
              const Icon = item.icon;
              const active = section === item.key;
              return (
                <Link
                  key={item.key}
                  to={item.path}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    active
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

        {/* Main Viewport */}
        <div className="lg:col-span-9 space-y-6 min-w-0">
          {sectionError && (
            <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl p-4 flex items-center justify-between gap-4 text-xs">
              <p className="text-red-600 dark:text-red-400 font-medium">{sectionError}</p>
              <button
                type="button"
                onClick={triggerReload}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold whitespace-nowrap shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* OVERVIEW */}
          {section === 'overview' && (
            <div className="space-y-6">
              {sectionLoading && !stats ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Businesses', val: stats?.businesses ?? 0, to: '/admin/businesses' },
                    { label: 'Owners', val: stats?.owners ?? 0, to: '/admin/users' },
                    { label: 'Customers', val: stats?.customers ?? 0, to: '/admin/users' },
                    { label: 'Posts & Reels', val: stats?.posts ?? 0, to: '/admin/posts' },
                    { label: 'Products', val: stats?.products ?? 0, to: '/admin/businesses' },
                    { label: 'Reviews', val: stats?.reviews ?? 0, to: '/admin/reports' },
                    {
                      label: 'Pending Verifications',
                      val: stats?.pendingVerifications ?? 0,
                      to: '/admin/verifications',
                      alert: Number(stats?.pendingVerifications ?? 0) > 0,
                    },
                    {
                      label: 'Open Reports',
                      val: stats?.openReports ?? 0,
                      to: '/admin/reports',
                      alert: Number(stats?.openReports ?? 0) > 0,
                    },
                  ].map((kpi) => (
                    <Link
                      key={kpi.label}
                      to={kpi.to}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                    >
                      <p className="text-xs text-slate-500 truncate">{kpi.label}</p>
                      <p
                        className={`mt-1.5 font-display text-2xl font-bold tabular-nums ${
                          kpi.alert
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {kpi.val}
                      </p>
                    </Link>
                  ))}
                </div>
              )}

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <h2 className="font-display text-base font-bold">Recent Audit Log</h2>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {stats?.eventsToday ?? 0} discovery events today
                  </span>
                </div>

                {auditLogs.length === 0 ? (
                  <p className="p-8 text-center text-xs text-slate-500">
                    No administrative actions recorded yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-100 dark:border-slate-800 text-slate-500">
                        <tr>
                          <th className="py-2.5 px-5 font-semibold">Action</th>
                          <th className="py-2.5 px-4 font-semibold">Entity</th>
                          <th className="py-2.5 px-4 font-semibold">Actor</th>
                          <th className="py-2.5 px-5 font-semibold text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {auditLogs.map((l) => (
                          <tr
                            key={l.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="py-2.5 px-5 font-mono text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {l.action}
                            </td>
                            <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {l.entity}
                            </td>
                            <td className="py-2.5 px-4 text-slate-500 truncate max-w-[220px]">
                              {l.actorName || l.actorEmail || l.actorUid || 'System'}
                            </td>
                            <td className="py-2.5 px-5 text-right text-slate-400 font-mono tabular-nums whitespace-nowrap">
                              {new Date(l.createdAt).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VERIFICATIONS */}
          {section === 'verifications' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-display text-2xl font-bold">Verification Queue</h1>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
                  {(['pending', 'approved', 'rejected', 'all'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setVerifFilter(st)}
                      className={`px-3 py-1.5 rounded-lg font-semibold capitalize whitespace-nowrap ${
                        verifFilter === st
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {sectionLoading ? (
                <div className="h-44 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
              ) : filteredVerifications.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center text-xs text-slate-500">
                  No {verifFilter === 'all' ? '' : `${verifFilter} `}verification requests found.
                </div>
              ) : (
                filteredVerifications.map((v) => (
                  <div
                    key={v.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link
                          to={`/b/${v.businessSlug}`}
                          className="font-display text-base font-bold hover:underline"
                        >
                          {v.businessName}
                        </Link>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {v.businessCity} · {v.documentType} · Phone{' '}
                          {v.phoneVerified ? 'Verified' : 'Unverified'} · Status:{' '}
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {v.status}
                          </span>
                        </p>
                        {v.rejectReason && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                            Reason: {v.rejectReason}
                          </p>
                        )}
                      </div>

                      {v.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiFetch(`/api/admin/verifications/${v.id}/review`, {
                                  method: 'POST',
                                  body: JSON.stringify({ action: 'approve' }),
                                });
                                setVerifications((prev) =>
                                  prev.map((x) => (x.id === v.id ? { ...x, status: 'approved' } : x))
                                );
                                pushToast({ title: `${v.businessName} verified` });
                              } catch (err) {
                                pushToast({ title: (err as Error).message, variant: 'error' });
                              }
                            }}
                            className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve Blue Tick</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectId(v.id)}
                            className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                        <SafeImage
                          src={v.documentUrls?.[0]}
                          alt="Verification document"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                        <SafeImage
                          src={v.storefrontPhotoUrl}
                          alt="Storefront photo"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* REPORTS */}
          {section === 'reports' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-display text-2xl font-bold">Moderation Reports</h1>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
                  {(['open', 'actioned', 'dismissed', 'all'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setReportFilter(st)}
                      className={`px-3 py-1.5 rounded-lg font-semibold capitalize whitespace-nowrap ${
                        reportFilter === st
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {sectionLoading ? (
                <div className="h-36 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
              ) : filteredReports.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center text-xs text-slate-500">
                  No {reportFilter === 'all' ? '' : `${reportFilter} `}reports in the moderation queue.
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredReports.map((r) => (
                    <div
                      key={r.id}
                      className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">
                          <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">
                            {r.targetType}
                          </span>
                          {' · '}
                          <span className="capitalize">{r.status}</span>
                          {' · '}
                          <span className="font-mono tabular-nums">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </span>
                        </p>
                        <p className="text-sm font-bold mt-0.5 text-slate-900 dark:text-slate-100">
                          {r.reason}
                        </p>
                        {r.details && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                            {r.details}
                          </p>
                        )}
                      </div>
                      {r.status === 'open' && (
                        <div className="flex flex-wrap gap-2 text-xs shrink-0">
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/reports/${r.id}/action`, {
                                method: 'POST',
                                body: JSON.stringify({ action: 'dismiss' }),
                              });
                              setReports((prev) =>
                                prev.map((x) => (x.id === r.id ? { ...x, status: 'dismissed' } : x))
                              );
                              pushToast({ title: 'Report dismissed' });
                            }}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold whitespace-nowrap"
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
                                setReports((prev) =>
                                  prev.map((x) => (x.id === r.id ? { ...x, status: 'actioned' } : x))
                                );
                                pushToast({ title: 'Content hidden' });
                              }}
                              className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold whitespace-nowrap"
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
                                setReports((prev) =>
                                  prev.map((x) => (x.id === r.id ? { ...x, status: 'actioned' } : x))
                                );
                                pushToast({ title: 'Business suspended' });
                              }}
                              className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold whitespace-nowrap"
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
            </div>
          )}

          {/* POSTS & REELS MODERATION */}
          {section === 'posts' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="font-display text-2xl font-bold">Posts &amp; Reels Moderation</h1>
                <div className="relative w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search store or caption..."
                    value={postFilter}
                    onChange={(e) => setPostFilter(e.target.value)}
                    className="h-10 pl-9 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs w-full"
                  />
                </div>
              </div>

              {sectionLoading ? (
                <div className="h-44 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
              ) : postsList.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center text-xs text-slate-500">
                  No storefront posts or reels match your search.
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
                  {postsList.map((p) => (
                    <div
                      key={p.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                          <SafeImage
                            src={p.type === 'video' ? p.posterUrl || p.mediaUrl : p.mediaUrl}
                            alt={p.caption || p.businessName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 text-slate-500">
                            <Link
                              to={`/b/${p.businessSlug}`}
                              className="text-sm font-bold text-slate-900 dark:text-slate-100 hover:underline truncate"
                            >
                              {p.businessName}
                            </Link>
                            <span aria-hidden="true">·</span>
                            <span className="capitalize">{p.type}</span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={
                                p.isHidden
                                  ? 'text-red-600 dark:text-red-400 font-semibold'
                                  : 'text-emerald-600 dark:text-emerald-400 font-semibold'
                              }
                            >
                              {p.isHidden ? 'Hidden' : 'Visible'}
                            </span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-300 line-clamp-2">
                            {p.caption || 'No caption'}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                            {new Date(p.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const r = await apiFetch<{ post: { isHidden: boolean } }>(
                                `/api/admin/posts/${p.id}`,
                                {
                                  method: 'PATCH',
                                  body: JSON.stringify({ isHidden: !p.isHidden }),
                                }
                              );
                              setPostsList((prev) =>
                                prev.map((x) =>
                                  x.id === p.id ? { ...x, isHidden: r.post.isHidden } : x
                                )
                              );
                              pushToast({
                                title: r.post.isHidden ? 'Post hidden from feed' : 'Post restored',
                              });
                            } catch (err) {
                              pushToast({ title: (err as Error).message, variant: 'error' });
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold whitespace-nowrap"
                        >
                          {p.isHidden ? (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              <span>Restore</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              <span>Hide</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDelete({
                              type: 'post',
                              id: p.id,
                              label: `post from ${p.businessName}`,
                            })
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 font-semibold whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CATEGORIES */}
          {section === 'categories' && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-bold">Category Manager</h1>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const r = await apiFetch<{ category: CategoryItem }>('/api/admin/categories', {
                      method: 'POST',
                      body: JSON.stringify({
                        name: newCat.name,
                        icon: newCat.icon,
                        sortOrder: Number(newCat.sortOrder) || 0,
                      }),
                    });
                    setCategories((prev) => [...prev, r.category]);
                    setNewCat({ name: '', icon: 'store', sortOrder: String(categories.length + 1) });
                    pushToast({ title: 'Category created' });
                  } catch (err) {
                    pushToast({ title: (err as Error).message, variant: 'error' });
                  }
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
                  type="text"
                  placeholder="Icon key (e.g. store)"
                  value={newCat.icon}
                  onChange={(e) => setNewCat({ ...newCat, icon: e.target.value })}
                  className="w-36 h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />
                <input
                  type="number"
                  placeholder="Order"
                  value={newCat.sortOrder}
                  onChange={(e) => setNewCat({ ...newCat, sortOrder: e.target.value })}
                  className="w-24 h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs tabular-nums"
                />
                <button
                  type="submit"
                  className="px-4 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  Add Category
                </button>
              </form>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
                {categories.length === 0 ? (
                  <p className="p-8 text-center text-xs text-slate-500">No categories found.</p>
                ) : (
                  categories.map((c) => (
                    <div key={c.id} className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 text-slate-500">
                        <strong className="text-sm text-slate-900 dark:text-slate-100">{c.name}</strong>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">/{c.slug}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">Order {c.sortOrder}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            c.isActive
                              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                              : 'text-slate-400'
                          }
                        >
                          {c.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await apiFetch<{ category: CategoryItem }>(
                              `/api/admin/categories/${c.id}`,
                              {
                                method: 'PATCH',
                                body: JSON.stringify({ isActive: !c.isActive }),
                              }
                            );
                            setCategories((prev) =>
                              prev.map((x) => (x.id === c.id ? r.category : x))
                            );
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold whitespace-nowrap"
                        >
                          {c.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDelete({
                              type: 'category',
                              id: c.id,
                              label: c.name,
                            })
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 font-semibold whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* BUSINESSES */}
          {section === 'businesses' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="font-display text-2xl font-bold">All Businesses</h1>
                <div className="relative w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filter by name or city..."
                    value={bizFilter}
                    onChange={(e) => setBizFilter(e.target.value)}
                    className="h-10 pl-9 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs w-full"
                  />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
                {businesses.length === 0 ? (
                  <p className="p-8 text-center text-xs text-slate-500">
                    No businesses match this filter.
                  </p>
                ) : (
                  businesses.map((b) => (
                    <div
                      key={b.id}
                      className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/b/${b.slug}`}
                            className="text-sm font-bold hover:underline truncate"
                          >
                            {b.name}
                          </Link>
                        </div>
                        <p className="text-slate-500 mt-0.5">
                          {b.city || 'No city'} · Status: {b.status} ·{' '}
                          {b.isVerified ? 'Verified Blue Tick' : 'Unverified'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await apiFetch<{ business: BusinessSummary }>(
                              `/api/admin/businesses/${b.id}`,
                              {
                                method: 'PATCH',
                                body: JSON.stringify({ isVerified: !b.isVerified }),
                              }
                            );
                            setBusinesses((prev) =>
                              prev.map((x) => (x.id === b.id ? r.business : x))
                            );
                          }}
                          className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap ${
                            b.isVerified
                              ? 'bg-blue-600 text-white'
                              : 'border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {b.isVerified ? 'Unverify' : 'Verify Blue Tick'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const next = b.status === 'suspended' ? 'published' : 'suspended';
                            const r = await apiFetch<{ business: BusinessSummary }>(
                              `/api/admin/businesses/${b.id}`,
                              {
                                method: 'PATCH',
                                body: JSON.stringify({ status: next }),
                              }
                            );
                            setBusinesses((prev) =>
                              prev.map((x) => (x.id === b.id ? r.business : x))
                            );
                          }}
                          className="px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-400 font-semibold whitespace-nowrap"
                        >
                          {b.status === 'suspended' ? 'Unsuspend' : 'Suspend'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDelete({
                              type: 'business',
                              id: b.id,
                              label: b.name,
                            })
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 font-semibold whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* USERS & ROLES */}
          {section === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold">Users &amp; Role Management</h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Root Admin UID{' '}
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {ROOT_ADMIN_UID}
                    </span>{' '}
                    is permanently protected from role downgrade.
                  </p>
                </div>
                <div className="relative w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search name, email, or UID..."
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="h-10 pl-9 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs w-full"
                  />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
                {users.length === 0 ? (
                  <p className="p-8 text-center text-xs text-slate-500">
                    No matching user profiles found.
                  </p>
                ) : (
                  users.map((u) => {
                    const isRoot = u.uid === ROOT_ADMIN_UID;
                    return (
                      <div
                        key={u.id}
                        className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {u.fullName || 'SoleWeb User'}
                            </p>
                            {u.handle && (
                              <>
                                <span aria-hidden="true" className="text-slate-400">
                                  ·
                                </span>
                                <Link
                                  to={`/u/${u.handle}`}
                                  className="text-blue-600 dark:text-blue-400 hover:underline font-mono"
                                >
                                  @{u.handle}
                                </Link>
                              </>
                            )}
                            {isRoot && (
                              <>
                                <span aria-hidden="true" className="text-slate-400">
                                  ·
                                </span>
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                  Root Admin
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-slate-500">
                            <span>{u.email}</span>
                            {' · '}
                            <span className="font-mono text-[11px]">UID: {u.uid}</span>
                          </p>
                        </div>

                        <select
                          aria-label={`Role for ${u.email}`}
                          disabled={isRoot}
                          value={u.role}
                          onChange={async (e) => {
                            const role = e.target.value as 'customer' | 'owner' | 'admin';
                            try {
                              await apiFetch(`/api/admin/users/${u.id}/role`, {
                                method: 'PATCH',
                                body: JSON.stringify({ role }),
                              });
                              setUsers((prev) =>
                                prev.map((x) => (x.id === u.id ? { ...x, role } : x))
                              );
                              pushToast({ title: `Updated ${u.fullName || u.email} to ${role}` });
                            } catch (err) {
                              pushToast({ title: (err as Error).message, variant: 'error' });
                            }
                          }}
                          className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 disabled:opacity-60 font-medium"
                        >
                          <option value="customer">customer</option>
                          <option value="owner">owner</option>
                          <option value="admin">admin</option>
                        </select>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* CSV IMPORT */}
          {section === 'import' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
              <h1 className="font-display text-xl font-bold">Bulk Seed &amp; CSV Business Import</h1>
              <p className="text-xs text-slate-500 font-mono">
                name,category,phone,address,city,latitude,longitude
              </p>
              <textarea
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
              />
              <button
                type="button"
                disabled={importingCsv}
                onClick={async () => {
                  setImportingCsv(true);
                  try {
                    const r = await apiFetch<{ imported: number }>('/api/admin/import-csv', {
                      method: 'POST',
                      body: JSON.stringify({ csv: csvText }),
                    });
                    pushToast({ title: `Imported ${r.imported} businesses` });
                  } catch (err) {
                    pushToast({ title: (err as Error).message, variant: 'error' });
                  } finally {
                    setImportingCsv(false);
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap"
              >
                {importingCsv ? 'Importing...' : 'Import Businesses from CSV'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Verification Reject Reason Modal */}
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
                    prev.map((x) =>
                      x.id === rejectId ? { ...x, status: 'rejected', rejectReason } : x
                    )
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

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Confirm Delete
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Are you sure you want to permanently delete{' '}
              <strong className="text-slate-900 dark:text-slate-100">{confirmDelete.label}</strong>?
              This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
                className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="flex-1 h-10 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold"
              >
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
