import React, { useEffect, useState } from 'react';
import { ArrowLeft, Mail, MessageCircle, Share2, X } from 'lucide-react';
import { SafeImage } from '../components/BusinessCard';
import { Link } from '../components/RouterLink';
import { StorefrontChatDrawer } from '../components/StorefrontChatDrawer';
import { useRealtime } from '../context/RealtimeContext';
import { apiFetch, trackAnalyticsEvent } from '../lib/api';
import type { BusinessSummary, ProductItem } from '../types/app';

export const ProductDetailPage: React.FC<{ slug: string; productId: string }> = ({
  slug,
  productId,
}) => {
  const { pushToast } = useRealtime();
  const [data, setData] = useState<{ product: ProductItem; business: BusinessSummary } | null>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', message: '' });

  useEffect(() => {
    setLoading(true);
    apiFetch<{ product: ProductItem; business: BusinessSummary }>(
      `/api/businesses/${encodeURIComponent(slug)}/products/${encodeURIComponent(productId)}`
    )
      .then((res) => {
        setData(res);
        trackAnalyticsEvent(res.business.id, 'product_view', res.product.id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug, productId]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="h-96 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="font-display text-xl font-bold">Item not found</p>
        <Link to={`/b/${slug}`} className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Back to storefront
        </Link>
      </div>
    );
  }

  const { product, business } = data;
  const images =
    product.images && product.images.length > 0
      ? product.images
      : [business.coverUrl || business.logoUrl || ''];
  const isOut = product.availability === 'out_of_stock';

  const handleEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/enquiries', {
        method: 'POST',
        body: JSON.stringify({
          businessId: business.id,
          productId: product.id,
          ...form,
        }),
      });
      setEnquiryOpen(false);
      setForm({ name: '', phone: '', message: '' });
      pushToast({ title: 'Enquiry sent', body: `${business.name} received your message.` });
    } catch (err) {
      pushToast({ title: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <Link
        to={`/b/${business.slug}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to {business.name}</span>
      </Link>

      <div className="grid md:grid-cols-12 gap-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-8">
        {/* Image Gallery */}
        <div className="md:col-span-6 space-y-3">
          <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800">
            <SafeImage
              src={images[activeImg]}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImg(i)}
                  className={`w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 ${
                    activeImg === i ? 'border-blue-600' : 'border-transparent opacity-70'
                  }`}
                >
                  <SafeImage src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Contiguous Details & Enquiry Module */}
        <div className="md:col-span-6 flex flex-col justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <span>{product.type === 'service' ? 'Service' : 'Product'}</span>
              {product.categoryLabel && (
                <>
                  <span> · </span>
                  <span>{product.categoryLabel}</span>
                </>
              )}
              {product.sku && (
                <>
                  <span> · </span>
                  <span className="font-mono">SKU {product.sku}</span>
                </>
              )}
            </p>
            <h1 className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white">
              {product.name}
            </h1>

            <div className="mt-4 flex items-baseline gap-3 tabular-nums">
              <span className="font-display text-3xl font-bold text-slate-900 dark:text-white">
                ₹{Number(product.discountPrice ?? product.price).toLocaleString()}
              </span>
              {product.discountPrice && (
                <span className="text-base text-slate-400 line-through">
                  ₹{Number(product.price).toLocaleString()}
                </span>
              )}
              <span className="text-sm text-slate-500">
                {product.durationMinutes
                  ? `/ ${product.durationMinutes} mins`
                  : `/ ${product.unit || 'unit'}`}
              </span>
            </div>

            {product.type === 'product' && (
              <p
                className={`mt-2 text-xs font-semibold ${
                  isOut ? 'text-red-600' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {isOut ? 'Out of stock' : 'In stock'}
              </p>
            )}

            <p className="mt-5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {product.description || 'Contact the storefront directly for current availability and custom orders.'}
            </p>
          </div>

          <div className="mt-8 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="flex-1 min-w-[140px] min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Ask in Live Chat</span>
            </button>
            <button
              type="button"
              onClick={() => setEnquiryOpen(true)}
              className="min-h-[46px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Mail className="w-4 h-4" />
              <span>Enquire</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                trackAnalyticsEvent(business.id, 'share', product.id);
                await navigator.clipboard?.writeText(window.location.href);
                pushToast({ title: 'Product link copied' });
              }}
              aria-label="Share product"
              className="min-h-[46px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {enquiryOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleEnquiry}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Enquire about {product.name}</h3>
              <button type="button" onClick={() => setEnquiryOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <input
              type="text"
              required
              placeholder="Your name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
            <input
              type="tel"
              required
              placeholder="Phone number"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
            <textarea
              rows={3}
              required
              placeholder="Quantity, timing, or question..."
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
            >
              Send Enquiry
            </button>
          </form>
        </div>
      )}

      <StorefrontChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        business={business}
        initialProduct={{
          id: product.id,
          name: product.name,
          price: product.price,
          discountPrice: product.discountPrice,
          image: images[0],
        }}
      />
    </div>
  );
};
