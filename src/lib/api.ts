import { auth } from './firebase';

export function getSessionId(): string {
  const key = 'soleweb_session_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `sess_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    } catch {
      // Ignore if token refresh fails
    }
  }

  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    const errMsg =
      (data as { error?: string; message?: string })?.error ||
      (data as { message?: string })?.message ||
      `Request failed (${response.status})`;
    throw new Error(errMsg);
  }

  return data as T;
}

export function trackAnalyticsEvent(
  businessId: string,
  eventType:
    | 'profile_view'
    | 'call_click'
    | 'whatsapp_click'
    | 'directions_click'
    | 'product_view'
    | 'share',
  productId?: string | null
) {
  const sessionId = getSessionId();
  apiFetch('/api/events', {
    method: 'POST',
    body: JSON.stringify({ businessId, productId: productId || null, eventType, sessionId }),
  }).catch(() => {});
}
