import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type Category, type Quest, type QuestStatus } from '../api';
import { CatIcon, Icon } from '../icons';
import { STATUS_LABEL, fmtDur } from '../util';
import QuestMap from '../components/QuestMap';
import QuestPanel from '../components/QuestPanel';

type StatusFilter = 'all' | 'todo' | 'pending' | 'approved';
const STATUS_FILTERS: { id: StatusFilter; label: string; test: (s: QuestStatus) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'todo', label: 'To do', test: (s) => s === 'none' || s === 'rejected' },
  { id: 'pending', label: 'In review', test: (s) => s === 'pending' },
  { id: 'approved', label: 'Done', test: (s) => s === 'approved' },
];
const PTS = [5, 10, 15];

export default function QuestsPage() {
  const { questId } = useParams();
  const nav = useNavigate();
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [err, setErr] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [type, setType] = useState<'all' | 'team' | 'group'>('all');
  const [pts, setPts] = useState<number | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('list');

  const load = useCallback(() => api.quests().then(setQuests).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); api.categories().then(setCats).catch(() => {}); }, [load]);

  const catName = useCallback((id: string) => cats.find((c) => c.id === id)?.name ?? id, [cats]);
  const shown = useMemo(() => (quests ?? []).filter((q) =>
    (!cat || q.category === cat) &&
    STATUS_FILTERS.find((f) => f.id === status)!.test(q.myStatus ?? 'none') &&
    (type === 'all' || q.type === type) &&
    (!pts || q.basePoints === pts)), [quests, cat, status, type, pts]);

  const done = quests?.filter((q) => q.myStatus === 'approved').length ?? 0;
  const select = (id: string) => nav(`/quests/${id}`);

  if (err) return <div className="empty"><b>Couldn't load quests</b>{err}</div>;
  if (!quests) return <div className="center"><div className="spinner" /></div>;

  return (
    <div className="quests">
      <div className="catbar">
        <div className="cats" role="toolbar" aria-label="Categories">
          <button className="cat" aria-pressed={!cat} onClick={() => setCat(null)}><CatIcon cat="all" color="currentColor" />All</button>
          {cats.map((c) => (
            <button key={c.id} className="cat" aria-pressed={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}>
              <CatIcon cat={c.id} color="currentColor" />{c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="filters" role="toolbar" aria-label="Filters">
        {STATUS_FILTERS.map((f) => (
          <button key={f.id} className="chip" aria-pressed={status === f.id} onClick={() => setStatus(f.id)}>{f.label}</button>
        ))}
        <span className="sep" />
        <button className="chip" aria-pressed={type === 'team'} onClick={() => setType(type === 'team' ? 'all' : 'team')}>Team</button>
        <button className="chip" aria-pressed={type === 'group'} onClick={() => setType(type === 'group' ? 'all' : 'group')}><Icon name="group" size={14} />Group</button>
        <span className="sep" />
        {PTS.map((p) => (
          <button key={p} className="chip" aria-pressed={pts === p} onClick={() => setPts(pts === p ? null : p)}>{p} pts</button>
        ))}
      </div>

      <div className={`qbody show-${view}`}>
        <div className="qlist">
          <div className="qlist-h">
            <span>{shown.length} quest{shown.length === 1 ? '' : 's'}</span>
            <span>{done}/{quests.length} done by your team</span>
          </div>
          {shown.map((q) => (
            <button key={q.id} className={`qrow${hover === q.id ? ' hl' : ''}${questId === q.id ? ' sel' : ''}`}
              onClick={() => select(q.id)} onMouseEnter={() => setHover(q.id)} onMouseLeave={() => setHover(null)}>
              <span className="thumb" style={{ background: `var(--c-${q.category})` }}>
                <CatIcon cat={q.category} size={28} />
                {q.type === 'group' && <span className="g">GROUP</span>}
                {q.myStatus === 'approved' && <span className="done"><Icon name="check" size={12} stroke={3.5} /></span>}
              </span>
              <span className="qmain">
                <span className="qtitle">{q.title}</span>
                <span className="qplace">{q.anyLocation ? 'Anywhere · ' : ''}{q.neighborhood ?? q.borough}</span>
                <span className="qmeta">
                  <span>{fmtDur(q.minutes)}</span>
                  {q.myStatus && q.myStatus !== 'none' && <span className={`status ${q.myStatus}`}>{STATUS_LABEL[q.myStatus]}</span>}
                  {!q.isActive && <span className="status rejected">Hidden</span>}
                </span>
              </span>
              <span className="qpts"><b>{q.totalPoints}</b><span className="muted" style={{ fontSize: 11 }}>pts</span></span>
            </button>
          ))}
          {!shown.length && (
            <div className="empty"><b>No quests match</b>Try another category or filter.
              <div style={{ marginTop: 12 }}><button className="btn sm" onClick={() => { setCat(null); setStatus('all'); setType('all'); setPts(null); }}>Clear filters</button></div>
            </div>
          )}
        </div>

        <div className="mapwrap">
          <QuestMap quests={shown} selectedId={questId ?? null} hoverId={hover} onSelect={select} onHover={setHover} />
        </div>

        <button className="view-toggle" onClick={() => setView(view === 'map' ? 'list' : 'map')}>
          <Icon name={view === 'map' ? 'list' : 'map'} size={16} />{view === 'map' ? 'Show list' : 'Show map'}
        </button>

        {questId && (
          <QuestPanel id={questId} categoryName={catName} onClose={() => nav('/')} onChanged={load} />
        )}
      </div>
    </div>
  );
}
