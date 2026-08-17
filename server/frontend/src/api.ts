export function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const adminKey = sessionStorage.getItem('rajapi_admin_key') || '';
  return fetch(url, {
    ...options,
    headers: { ...options.headers, 'X-Admin-Key': adminKey } as Record<string, string>,
  });
}

export async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await adminFetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function postJson<T>(url: string, body?: unknown, method = 'POST'): Promise<T | null> {
  try {
    const res = await adminFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function isArray<T>(data: unknown): data is T[] {
  return Array.isArray(data);
}

import { FleetHierarchyResponse } from './types';

export async function fetchFleetHierarchy(): Promise<FleetHierarchyResponse | null> {
  const adminKey = sessionStorage.getItem('rajapi_admin_key');
  if (!adminKey) return null; // Standard auth check
  return getJson<FleetHierarchyResponse>('/api/v1/fleet/hierarchy');
}