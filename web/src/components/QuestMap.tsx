import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Quest } from '../api';
import boroughs from '../data/boroughs.json';
import subway from '../data/subway.json';
import { BASECAMP, LINE_COLORS } from '../util';

const BORO_STYLE: Record<string, [string, string]> = {
  Manhattan: ['--b-man', '--b-man-e'], Brooklyn: ['--b-bk', '--b-bk-e'], Queens: ['--b-qn', '--b-qn-e'], Bronx: ['--b-bx', '--b-bx-e'],
};
const tok = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ccc';

interface Props {
  quests: Quest[];
  selectedId: string | null;
  hoverId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

/** The NYC board: borough shapes (Staten Island greyed out), subway lines, basecamp and one pin per quest. */
export default function QuestMap({ quests, selectedId, hoverId, onSelect, onHover }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pins = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const handlers = useRef({ onSelect, onHover });
  handlers.current = { onSelect, onHover };

  // Build the base map once.
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: false, minZoom: 10, maxZoom: 17, zoomSnap: 0.25 })
      .setView([40.75, -73.94], 11.25);
    m.zoomControl.setPosition('topleft');
    const draw = () => {
      m.eachLayer((l) => { if ((l as any).options?.base) m.removeLayer(l); });
      L.geoJSON(boroughs as any, {
        base: true, interactive: false,
        style: (f: any) => {
          const s = BORO_STYLE[f?.properties.name];
          return s ? { color: tok(s[1]), weight: 1.2, fillColor: tok(s[0]), fillOpacity: 1 }
            : { color: tok('--grey-edge'), weight: 1, fillColor: tok('--grey-land'), fillOpacity: 1 };
        },
      } as any).addTo(m);
      L.geoJSON(subway as any, {
        base: true, interactive: false,
        style: (f: any) => ({ color: LINE_COLORS[f?.properties.r] ?? '#808183', weight: 2, opacity: 0.55 }),
      } as any).addTo(m);
    };
    draw();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', draw);

    L.marker([BASECAMP.lat, BASECAMP.lng], {
      icon: L.divIcon({ className: 'pin-wrap', html: `<div class="camp" title="${BASECAMP.label}"><svg viewBox="0 0 32 32" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M4 15L16 5l12 10M7 13v14h18V13"/></svg></div>`, iconSize: [0, 0] }),
      zIndexOffset: 2000, keyboard: false,
    }).bindTooltip(`${BASECAMP.label} · ${BASECAMP.addr}`, { className: 'qtip', direction: 'top', offset: [0, -18] }).addTo(m);

    pins.current = L.layerGroup().addTo(m);
    // Zoomed out, pins shrink to dots so Manhattan doesn't become a pile of labels (like the Quest Board).
    const far = () => el.current?.classList.toggle('far', m.getZoom() < 12.5);
    m.on('zoomend', far);
    far();
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); mq.removeEventListener('change', draw); m.remove(); map.current = null; };
  }, []);

  // Quest pins.
  useEffect(() => {
    const layer = pins.current;
    if (!layer) return;
    layer.clearLayers();
    markers.current.clear();
    for (const q of quests) {
      const cls = ['pin', q.type === 'group' ? 'group' : '', q.anyLocation ? 'any' : '', q.myStatus === 'approved' ? 'approved' : '',
        q.myStatus === 'pending' ? 'pending' : ''].join(' ');
      const label = q.myStatus === 'approved' ? '✓' : String(q.totalPoints);
      const mk = L.marker([q.lat, q.lng], {
        icon: L.divIcon({ className: 'pin-wrap', html: `<div class="${cls}" data-id="${q.id}">${label}</div>`, iconSize: [0, 0] }),
        riseOnHover: true, title: q.title,
      })
        .bindTooltip(q.title, { className: 'qtip', direction: 'top', offset: [0, -14] })
        .on('click', () => handlers.current.onSelect(q.id))
        .on('mouseover', () => handlers.current.onHover(q.id))
        .on('mouseout', () => handlers.current.onHover(null));
      mk.addTo(layer);
      markers.current.set(q.id, mk);
    }
  }, [quests]);

  // Highlight hovered / selected pins.
  useEffect(() => {
    for (const [id, mk] of markers.current) {
      const node = mk.getElement()?.querySelector('.pin');
      node?.classList.toggle('hl', id === hoverId);
      node?.classList.toggle('sel', id === selectedId);
      mk.setZIndexOffset(id === selectedId || id === hoverId ? 1000 : 0);
    }
  }, [hoverId, selectedId, quests]);

  // Pan to the selected quest if it's off screen.
  useEffect(() => {
    const m = map.current;
    const mk = selectedId ? markers.current.get(selectedId) : null;
    if (m && mk && !m.getBounds().pad(-0.15).contains(mk.getLatLng())) m.panTo(mk.getLatLng());
  }, [selectedId]);

  return (
    <>
      <div id="map" ref={el} />
      <div className="map-legend" aria-hidden="true">
        <span><span className="lg" style={{ background: 'var(--surface)', border: '1px solid var(--hair-strong)' }} />Team quest</span>
        <span><span className="lg" style={{ background: 'var(--ink)' }} />Group quest</span>
        <span><span className="lg" style={{ background: 'var(--ok)' }} />Done</span>
        <span><span className="lg" style={{ boxShadow: '0 0 0 2px var(--orange) inset' }} />In review</span>
        <span><span className="lg" style={{ background: 'var(--orange)' }} />Basecamp</span>
      </div>
    </>
  );
}
