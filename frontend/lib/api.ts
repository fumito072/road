const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

type TokenGetter = () => Promise<string | null>;

let tokenGetter: TokenGetter | null = null;

export function setTokenGetter(getter: TokenGetter | null) {
  tokenGetter = getter;
}

async function buildAuthHeaders(): Promise<Record<string, string>> {
  if (!tokenGetter) return {};
  try {
    const token = await tokenGetter();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const authHeaders = await buildAuthHeaders();

  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders,
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `API error ${res.status}`);
  }

  return res.json();
}

export async function apiFetchBlob(path: string): Promise<Blob> {
  const authHeaders = await buildAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `API error ${res.status}`);
  }
  return res.blob();
}
