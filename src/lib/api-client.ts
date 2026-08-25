/**
 * Centralized API Client for PROYECTY
 * Complies with strict session handling:
 * - Intercepts HTTP 401 & HTTP 403 (USER_SUSPENDED only).
 * - Leaves ordinary RBAC 403 untouched (maintains user session).
 * - Enforces 5-second timeout with clean AbortController cancellation.
 * - Does NOT overwrite window.fetch globally.
 */

type AuthFailureReason = 'SESSION_EXPIRED' | 'USER_SUSPENDED' | 'UPGRADE_REQUIRED';

type AuthFailureListener = (reason: AuthFailureReason, message?: string) => void;

const authFailureListeners: Set<AuthFailureListener> = new Set();

export function onAuthFailure(listener: AuthFailureListener): () => void {
  authFailureListeners.add(listener);
  return () => {
    authFailureListeners.delete(listener);
  };
}

function notifyAuthFailure(reason: AuthFailureReason, message?: string) {
  authFailureListeners.forEach(listener => {
    try {
      listener(reason, message);
    } catch (e) {
      console.error('[API Client] Error in auth failure listener:', e);
    }
  });
}

export function clearClientSession() {
  localStorage.removeItem('proyecty_token');
  localStorage.removeItem('proyecty_user');
  localStorage.removeItem('auth_user');
  localStorage.removeItem('user_role');
  
  // Clear any Supabase local storage tokens safely
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase.auth.token'))) {
        localStorage.removeItem(key);
      }
    }
  } catch (e) {}
}

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
  skipAuth?: boolean;
}

export async function apiFetch(url: string | URL, options: ApiFetchOptions = {}): Promise<Response> {
  const { timeoutMs = 5000, skipAuth = false, headers: customHeaders, signal: userSignal, ...restOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  // Link caller's abort signal if provided
  if (userSignal) {
    userSignal.addEventListener('abort', () => controller.abort());
  }

  const headers = new Headers(customHeaders || {});

  if (!skipAuth && !headers.has('Authorization')) {
    const token = localStorage.getItem('proyecty_token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  try {
    const response = await fetch(url, {
      ...restOptions,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // --- HANDLE HTTP 401 (SESSION EXPIRED / INVALID) ---
    if (response.status === 401) {
      clearClientSession();
      notifyAuthFailure('SESSION_EXPIRED', 'Tu sesión expiró o no es válida. Inicia sesión nuevamente.');
      return response;
    }

    // --- HANDLE HTTP 403 (SPECIFIC SEMANTIC CODES ONLY) ---
    if (response.status === 403) {
      try {
        const cloned = response.clone();
        const data = await cloned.json();

        if (data?.code === 'USER_SUSPENDED') {
          clearClientSession();
          notifyAuthFailure('USER_SUSPENDED', 'Tu cuenta ha sido suspendida. Contacta con el administrador.');
        } else if (data?.code === 'UPGRADE_REQUIRED') {
          notifyAuthFailure('UPGRADE_REQUIRED', data.message || 'Esta funcionalidad requiere un plan superior.');
        }
        // Ordinary RBAC 403 (e.g. lack of permission for an action) is NOT session-terminating.
      } catch (e) {
        // Non-JSON 403: treat as standard RBAC, do not log out
      }
    }

    return response;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn(`[API Client] Timeout de ${timeoutMs}ms agotado para la solicitud a ${url.toString()}`);
    }
    throw err;
  }
}

export async function apiGet<T = any>(url: string, options: ApiFetchOptions = {}): Promise<T> {
  const res = await apiFetch(url, { ...options, method: 'GET' });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const err = new Error(errorData.error || errorData.message || `Error HTTP ${res.status}`);
    (err as any).status = res.status;
    (err as any).data = errorData;
    throw err;
  }
  return res.json();
}

export async function apiPost<T = any>(url: string, body?: any, options: ApiFetchOptions = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  let serializedBody = body;

  if (body !== undefined && !(body instanceof FormData) && !(body instanceof Blob)) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    serializedBody = JSON.stringify(body);
  }

  const res = await apiFetch(url, {
    ...options,
    method: 'POST',
    headers,
    body: serializedBody,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const err = new Error(errorData.error || errorData.message || `Error HTTP ${res.status}`);
    (err as any).status = res.status;
    (err as any).data = errorData;
    throw err;
  }
  return res.json();
}
