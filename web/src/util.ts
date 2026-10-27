export const fmtDur = (m: number) =>
  m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m / 60} ${m === 60 ? 'hr' : 'hrs'}`;

export function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const STATUS_LABEL = { none: 'To do', pending: 'In review', approved: 'Done', rejected: 'Needs redo' } as const;

// NYC subway line colors for the map and route bullets.
export const LINE_COLORS: Record<string, string> = {
  '1': '#EE352E', '2': '#EE352E', '3': '#EE352E', '4': '#00933C', '5': '#00933C', '6': '#00933C', '7': '#B933AD',
  A: '#0039A6', C: '#0039A6', E: '#0039A6', B: '#FF6319', D: '#FF6319', F: '#FF6319', M: '#FF6319', G: '#6CBE45',
  J: '#996633', Z: '#996633', L: '#A7A9AC', N: '#FCCC0A', Q: '#FCCC0A', R: '#FCCC0A', W: '#FCCC0A', S: '#808183',
};
export const DARK_BULLET = new Set(['N', 'Q', 'R', 'W']);

export const BASECAMP = { lat: 40.8251, lng: -73.9527, label: 'Basecamp', addr: '631 West 142nd Street' };

/** Readable text color on top of a team color. */
export function onColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.62 ? '#111' : '#fff';
}
