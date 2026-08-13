import type { Project, Part, QuoteResult, Constant, Me, AppUser, Snapshot } from '../types';

const BASE = '/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Projects
export const api = {
  listProjects: () => req<Project[]>('/projects'),
  createProject: (data: Partial<Project>) =>
    req<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  getProject: (id: number) => req<Project>(`/projects/${id}`),
  updateProject: (id: number, data: Partial<Project>) =>
    req<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id: number) =>
    req<void>(`/projects/${id}`, { method: 'DELETE' }),
  duplicateProject: (id: number) =>
    req<Project>(`/projects/${id}/duplicate`, { method: 'POST' }),

  // Parts
  createPart: (projectId: number, data: Partial<Part>) =>
    req<Part>(`/projects/${projectId}/parts`, { method: 'POST', body: JSON.stringify(data) }),
  updatePart: (partId: number, data: Partial<Part>) =>
    req<Part>(`/parts/${partId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePart: (partId: number) =>
    req<void>(`/parts/${partId}`, { method: 'DELETE' }),

  // Quote
  getQuote: (projectId: number) => req<QuoteResult>(`/projects/${projectId}/quote`),
  refreshQuote: (projectId: number) =>
    req<{ ok: boolean; snapshot_id: number; quoted_price: number }>(`/projects/${projectId}/quote/refresh`, { method: 'POST' }),
  listSnapshots: (projectId: number) => req<Snapshot[]>(`/projects/${projectId}/snapshots`),
  getSnapshot: (snapshotId: number) => req<QuoteResult>(`/snapshots/${snapshotId}`),

  // Constants
  listConstants: () => req<Constant[]>('/constants'),
  getLaborSets: () => req<{
    labor_sets: Record<string, Record<string, Record<number, Record<string, number>>>>;
    part_sets: Record<string, Record<string, unknown>>;
    project_hours: Record<string, Record<number, number>>;
    robot_improvement: Record<string, Record<number, number>>;
    trial_reduction: Record<number, number>;
  }>('/constants/labor-sets'),
  updateConstant: (key: string, value: number) =>
    req<Constant>(`/constants/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),

  // Identity & users
  getMe: () => req<Me>('/me'),
  acknowledgeVersion: (version: string) =>
    req<{ ok: boolean; acknowledged_version: string }>('/me/acknowledge-version', {
      method: 'POST', body: JSON.stringify({ version }),
    }),
  listUsers: () => req<AppUser[]>('/admin/users'),
  setUserAccess: (email: string, access_scope: string) =>
    req<AppUser>(`/admin/users/${encodeURIComponent(email)}`, {
      method: 'PUT', body: JSON.stringify({ access_scope }),
    }),
  listAccessTags: () => req<string[]>('/admin/access-tags'),
};
