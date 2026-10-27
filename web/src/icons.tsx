// Category and UI icons, carried over from the Quest Board mockup.

const CAT_PATHS: Record<string, string> = {
  pop: '<path d="M4 11h24v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 11l-.8-4.2a2 2 0 0 1 1.6-2.3l19-3.4a2 2 0 0 1 2.3 1.6l.6 3.3L4 11zm6.5-7.6L14 9.6m4-7.8l3.5 6.3M4 17h24"/>',
  hist: '<path d="M4 28h24M6 24h20M8 24V12m5.3 12V12m5.4 12V12M24 24V12M4 12h24L16 4z"/>',
  arch: '<path d="M6 28V9l10-5 10 5v19M3 28h26M11 13h2m6 0h2m-10 5h2m6 0h2m-8 10v-5h4v5"/>',
  food: '<path d="M4.5 9.5C11 5.5 21 5.5 27.5 9.5L16 29zM6.6 13c5.5-2.5 13.3-2.5 18.8 0"/><circle cx="13" cy="17" r="1.6"/><circle cx="18.5" cy="21" r="1.6"/><circle cx="18" cy="15" r="1.3"/>',
  art: '<path d="M16 3a13 13 0 0 0 0 26c2 0 2.6-1.5 2-3-.8-2 .4-4 2.6-4H24a5 5 0 0 0 5-5c0-7.7-5.8-14-13-14z"/><circle cx="9.5" cy="15" r="1.8"/><circle cx="12" cy="9" r="1.8"/><circle cx="19" cy="8.5" r="1.8"/><circle cx="23.5" cy="13" r="1.8"/>',
  transit: '<rect x="7" y="3" width="18" height="21" rx="4"/><path d="M7 14h18M11 29l2.5-5m8 5L19 24M12 19h.01M20 19h.01M12 8h8"/>',
  nature: '<path d="M16 29V17m0 0l-4-4m4 4l5-5M16 3c-6 0-10 5-10 10.5C6 18.4 10.5 21 16 21s10-2.6 10-7.5C26 8 22 3 16 3z"/>',
  people: '<circle cx="11" cy="10" r="4.5"/><path d="M3 27c0-5 3.6-8.5 8-8.5s8 3.5 8 8.5"/><circle cx="22.5" cy="11.5" r="3.5"/><path d="M21 19c4.6 0 8 3 8 8"/>',
  quirky: '<path d="M16 3l2.6 8.4L27 14l-8.4 2.6L16 25l-2.6-8.4L5 14l8.4-2.6zM26 22l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>',
  season: '<path d="M27 5C14 5 6 11 6 20c0 2.5.7 4.5 1.6 6C18 26 27 19 27 5zM5 29c3-6 8-11 14-15"/>',
  boro: '<path d="M3 7l8-3 10 3 8-3v21l-8 3-10-3-8 3zM11 4v21m10-18v21"/>',
  all: '<rect x="4" y="4" width="10" height="10" rx="2"/><rect x="18" y="4" width="10" height="10" rx="2"/><rect x="4" y="18" width="10" height="10" rx="2"/><rect x="18" y="18" width="10" height="10" rx="2"/>',
};

export function CatIcon({ cat, size = 22, color }: { cat: string; size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={color ?? `var(--i-${cat}, currentColor)`}
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: CAT_PATHS[cat] ?? CAT_PATHS.all }} />
  );
}

const UI: Record<string, string> = {
  photo: '<path d="M4 10h5l2-3h10l2 3h5v16H4z"/><circle cx="16" cy="17" r="5"/>',
  video: '<rect x="3" y="8" width="19" height="16" rx="2"/><path d="M22 14l7-4v12l-7-4"/>',
  text: '<path d="M5 6h22v16H13l-6 5v-5H5z"/><path d="M10 12h12m-12 5h8"/>',
  clock: '<circle cx="16" cy="16" r="12"/><path d="M16 9v7l5 3"/>',
  pin: '<path d="M16 29s-9-8.2-9-15a9 9 0 0 1 18 0c0 6.8-9 15-9 15z"/><circle cx="16" cy="14" r="3.2"/>',
  group: '<circle cx="10" cy="11" r="4"/><circle cx="22" cy="11" r="4"/><path d="M2 26c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5m-4-7c1.3-.3 2.6-.5 4-.5 4.4 0 8 3.1 8 7.5"/>',
  check: '<path d="M6 16.5l6.5 6.5L26 9.5"/>',
  x: '<path d="M8 8l16 16M24 8L8 24"/>',
  list: '<path d="M11 8h17M11 16h17M11 24h17M4 8h.01M4 16h.01M4 24h.01"/>',
  map: '<path d="M3 7l8-3 10 3 8-3v21l-8 3-10-3-8 3zM11 4v21m10-18v21"/>',
  train: '<rect x="7" y="3" width="18" height="21" rx="4"/><path d="M7 14h18M11 29l2.5-5m8 5L19 24M12 19h.01M20 19h.01"/>',
  upload: '<path d="M16 21V5m0 0l-6 6m6-6l6 6M5 21v5h22v-5"/>',
  home: '<path d="M4 15L16 5l12 10M7 13v14h18V13"/>',
  trophy: '<path d="M10 4h12v8a6 6 0 0 1-12 0zM10 7H4c0 4 2 6 6 6m12-6h6c0 4-2 6-6 6M16 18v5m-5 5h10l-1-5h-8z"/>',
  feed: '<rect x="4" y="4" width="10" height="10" rx="2"/><rect x="18" y="4" width="10" height="10" rx="2"/><rect x="4" y="18" width="10" height="10" rx="2"/><rect x="18" y="18" width="10" height="10" rx="2"/>',
  shield: '<path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z"/><path d="M11 16l4 4 7-8"/>',
  logout: '<path d="M13 5H6v22h7M20 10l6 6-6 6M26 16H12"/>',
  back: '<path d="M20 6L10 16l10 10"/>',
  play: '<path d="M10 6v20l17-10z"/>',
  download: '<path d="M16 5v16m0 0l-6-6m6 6l6-6M5 21v5h22v-5"/>',
  trash: '<path d="M5 8h22M12 8V5h8v3M8 8l1.5 19h13L24 8"/>',
  warn: '<path d="M16 4L2 28h28zM16 13v7m0 4h.01"/>',
  basecamp: '<path d="M16 4L4 26h24zM16 4v22M11 26l5-9 5 9"/>',
};

export function Icon({ name, size = 16, stroke = 2.2 }: { name: string; size?: number; stroke?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: UI[name] ?? '' }} />
  );
}

export const SUB_LABEL: Record<string, string> = { photo: 'Photo', video: 'Video', text: 'Text' };
