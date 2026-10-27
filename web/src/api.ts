// Typed client for the scav-host API.

export type SubmissionType = 'photo' | 'video' | 'text';
export type QuestStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface Route { steps: string[]; mins: number; st: string }

export interface Quest {
  id: string; category: string; type: 'team' | 'group'; basePoints: number; bonusPoints: number;
  groupPoints: number; totalPoints: number; groupSize: number | null; minutes: number;
  submissionTypes: SubmissionType[]; borough: string; neighborhood: string | null; place: string;
  lat: number; lng: number; anyLocation: boolean; title: string; description: string; steps: string[];
  proof: string; note: string | null; distanceMiles: number | null; route: Route | null; isActive: boolean;
  myStatus?: QuestStatus; myPoints?: number | null; teamsDone?: number;
}

export interface Media {
  id: string; kind: 'image' | 'video'; status: string; mimeType: string;
  url: string; thumbUrl: string | null; originalUrl: string;
}

export interface Submission {
  id: string; questId: string; questTitle: string; questCategory: string; text: string | null;
  status: 'pending' | 'approved' | 'rejected'; pointsAwarded: number | null; reviewerNote: string | null;
  createdAt: string; reviewedAt: string | null;
  team: { id: number; name: string; color: string }; player: { id: number; name: string }; media: Media[];
}

export interface Team { id: number; name: string; color: string }
export interface Player { id: number; name: string; teamId: number | null; isAdmin: boolean }
export interface Me extends Player { team: (Team & { members: { id: number; name: string }[] }) | null }
export interface Category { id: string; name: string }
export interface LeaderTeam extends Team {
  points: number; questsCompleted: number; pending: number; members: { id: number; name: string }[] | null;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  return data as T;
}

export const api = {
  players: () => request<{ teams: Team[]; players: Player[] }>('GET', '/api/players'),
  login: (playerId: number, code: string) => request<{ ok: true }>('POST', '/api/auth/login', { playerId, code }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  me: () => request<Me>('GET', '/api/me'),
  categories: () => request<Category[]>('GET', '/api/categories'),
  quests: () => request<Quest[]>('GET', '/api/quests'),
  quest: (id: string) => request<Quest & { submissions: Submission[] }>('GET', `/api/quests/${encodeURIComponent(id)}`),
  leaderboard: () => request<{ teams: LeaderTeam[]; totalQuests: number }>('GET', '/api/leaderboard'),
  submissions: (params: Record<string, string> = {}) =>
    request<Submission[]>('GET', `/api/submissions?${new URLSearchParams(params)}`),
  submit: (questId: string, text: string, mediaIds: string[]) =>
    request<Submission>('POST', '/api/submissions', { questId, text, mediaIds }),
  withdraw: (id: string) => request<{ ok: true }>('DELETE', `/api/submissions/${id}`),

  admin: {
    queue: (status = 'pending') => request<Submission[]>('GET', `/api/admin/submissions?status=${status}`),
    review: (id: string, status: 'approved' | 'rejected' | 'pending', points?: number, note?: string) =>
      request<Submission>('POST', `/api/admin/submissions/${id}/review`, { status, points, note }),
    setQuestActive: (id: string, isActive: boolean) => request('PATCH', `/api/admin/quests/${id}`, { isActive }),
    roster: () => request<{ teams: Team[]; players: Player[] }>('GET', '/api/admin/roster'),
    addPlayer: (name: string, teamId: number | null) => request('POST', '/api/admin/players', { name, teamId }),
    movePlayer: (id: number, teamId: number | null) => request('PATCH', `/api/admin/players/${id}`, { teamId }),
    addTeam: (name: string, color: string) => request('POST', '/api/admin/teams', { name, color }),
    jobs: () => request<{ status: string; n: number }[]>('GET', '/api/admin/jobs'),
  },
};

/**
 * Uploads one file: reserve a slot, PUT it straight to storage (with progress), then confirm.
 * Returns the media id to attach to a submission.
 */
export async function uploadFile(file: File, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<string> {
  const mimeType = file.type || guessType(file.name);
  const slot = await request<{ mediaId: string; uploadUrl: string; headers: Record<string, string> }>(
    'POST', '/api/uploads', { filename: file.name, mimeType, size: file.size });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', slot.uploadUrl);
    for (const [k, v] of Object.entries(slot.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(`Upload failed (${xhr.status}).`, xhr.status)));
    xhr.onerror = () => reject(new ApiError('Upload failed. Check your connection and try again.', 0));
    xhr.onabort = () => reject(new ApiError('Upload cancelled.', 0));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(new Blob([file], { type: mimeType }));
  });
  onProgress(1);
  await request('POST', `/api/uploads/${slot.mediaId}/complete`);
  return slot.mediaId;
}

function guessType(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mov', 'mp4', 'm4v', 'webm', '3gp'].includes(ext)) return ext === 'mov' ? 'video/quicktime' : `video/${ext}`;
  if (['heic', 'heif'].includes(ext)) return `image/${ext}`;
  return 'image/jpeg';
}
