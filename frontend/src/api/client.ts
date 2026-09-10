import type { Project, Part, QuoteResult, Constant, Me, AppUser, Snapshot, PriceHistoryRow, ProjectEdit } from '../types';

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
  getPriceHistory: (projectId: number) => req<PriceHistoryRow[]>(`/projects/${projectId}/price-history`),
  listEdits: (projectId: number) => req<ProjectEdit[]>(`/projects/${projectId}/edits`),

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

  // Salesforce lists (temporary — Project Code tab)
  getSalesforceOptions: (refresh = false) =>
    req<SalesforceOptions>(`/salesforce/options${refresh ? '?refresh=true' : ''}`),

  // Project codes
  listProjectCodes: (params: { status?: string; q?: string; show_all?: boolean; open?: boolean } = {}) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    if (params.q) qs.set('q', params.q)
    if (params.show_all) qs.set('show_all', 'true')
    if (params.open) qs.set('open', 'true')
    const s = qs.toString()
    return req<ProjectCodeList>(`/project-codes${s ? `?${s}` : ''}`)
  },
  previewProjectCode: (body: { work_type: string; team?: string; customer?: string }) =>
    req<{ code: string; prefix: string }>('/project-codes/preview', { method: 'POST', body: JSON.stringify(body) }),
  createProjectCode: (body: {
    work_type: string; team?: string; customer?: string; project_name?: string
    sf_account_id?: string; sf_opp_id?: string
  }) => req<ProjectCode & { existing?: boolean }>('/project-codes', { method: 'POST', body: JSON.stringify(body) }),
  updateProjectCode: (id: number, patch: { status?: string; customer?: string; project_name?: string }) =>
    req<ProjectCode>(`/project-codes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  getProjectCodeHistory: (id: number) => req<ProjectCodeEvent[]>(`/project-codes/${id}/history`),
  seedProjectCodes: () => req<{ inserted: number; total: number }>('/project-codes/seed', { method: 'POST' }),
};

export interface SalesforceAccount { id: string; name: string }
export interface SalesforceOpportunity {
  id: string; name: string; account_id: string | null; stage: string | null
  is_closed: boolean; is_won: boolean; amount: number | null; close_date: string | null
}
export interface SalesforceOptions {
  accounts: SalesforceAccount[]
  opportunities: SalesforceOpportunity[]
  fetched_at: number
  stale: boolean
  error?: string
  sf_instance_url?: string | null
  code_by_opp?: Record<string, string>
}

export interface ProjectCode {
  id: number; code: string; work_type: string; team: string | null
  customer: string | null; project_name: string | null; status: string
  sf_account_id: string | null; sf_opp_id: string | null; source: string
  created_by: string | null; created_by_name: string | null
  created_at: string | null; status_updated_at: string | null
  sf_account_index: number | null; sf_opp_index: number | null
}
export interface ProjectCodeList { codes: ProjectCode[]; seeded: boolean; statuses: string[] }
export interface ProjectCodeEvent {
  id: number; code_id: number; field: string; old_value: string | null; new_value: string | null
  changed_by: string | null; changed_by_name: string | null; changed_at: string
}

export interface SalesforceAccount { id: string; name: string }
export interface SalesforceOpportunity {
  id: string; name: string; account_id: string | null; stage: string | null
  is_closed: boolean; is_won: boolean
}
export interface SalesforceOptions {
  accounts: SalesforceAccount[]
  opportunities: SalesforceOpportunity[]
  fetched_at: number
  stale: boolean
  error?: string
}
