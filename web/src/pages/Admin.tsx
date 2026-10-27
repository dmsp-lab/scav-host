import { useCallback, useEffect, useState } from 'react';
import { api, type Player, type Quest, type Submission, type Team } from '../api';
import { SubmissionCard } from '../components/Media';
import { CatIcon, Icon } from '../icons';
import { useSession } from '../session';

type Tab = 'pending' | 'approved' | 'rejected' | 'players' | 'quests';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'pending', label: 'To review' }, { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Rejected' },
    { id: 'players', label: 'Players & teams' }, { id: 'quests', label: 'Quests' },
  ];
  return (
    <div className="page">
      <div className="page-inner">
        <div>
          <h1 className="page-title">Game Master</h1>
          <p className="page-sub">Review proof, award points, and manage players and quests.</p>
        </div>
        <div className="tabs">
          {tabs.map((t) => <button key={t.id} className="chip" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>
        {(tab === 'pending' || tab === 'approved' || tab === 'rejected') && <ReviewQueue key={tab} status={tab} />}
        {tab === 'players' && <Roster />}
        {tab === 'quests' && <QuestAdmin />}
      </div>
    </div>
  );
}

function ReviewQueue({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [jobs, setJobs] = useState<{ status: string; n: number }[]>([]);
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    api.admin.queue(status).then(setSubs).catch((e) => setErr(e.message));
    api.admin.jobs().then(setJobs).catch(() => {});
  }, [status]);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 15000);
    return () => window.clearInterval(t);
  }, [load]);

  const failed = jobs.find((j) => j.status === 'failed')?.n ?? 0;
  const queued = (jobs.find((j) => j.status === 'queued')?.n ?? 0) + (jobs.find((j) => j.status === 'running')?.n ?? 0);

  return (
    <>
      {(queued > 0 || failed > 0) && (
        <p className="muted" style={{ margin: 0 }}>
          Media worker: {queued} file{queued === 1 ? '' : 's'} processing{failed ? ` · ${failed} could not be converted (originals are still viewable)` : ''}
        </p>
      )}
      {err && <p className="err">{err}</p>}
      {!subs && !err && <div className="spinner" />}
      {subs && !subs.length && <div className="empty"><b>{status === 'pending' ? 'All caught up' : 'Nothing here yet'}</b>
        {status === 'pending' ? 'New submissions show up here automatically.' : ''}</div>}
      <div className="board">
        {subs?.map((s) => <ReviewCard key={s.id} s={s} onDone={load} />)}
      </div>
    </>
  );
}

function ReviewCard({ s, onDone }: { s: Submission; onDone: () => void }) {
  const { toast } = useSession();
  const [quest, setQuest] = useState<Quest | null>(null);
  const [points, setPoints] = useState<string>(s.pointsAwarded?.toString() ?? '');
  const [note, setNote] = useState(s.reviewerNote ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.quest(s.questId).then((q) => { setQuest(q); if (s.pointsAwarded == null) setPoints(String(q.totalPoints)); }).catch(() => {});
  }, [s.questId, s.pointsAwarded]);

  async function review(status: 'approved' | 'rejected' | 'pending') {
    setBusy(true);
    try {
      const p = points.trim() === '' ? undefined : Number(points);
      if (status === 'approved' && p !== undefined && (!Number.isInteger(p) || p < 0)) throw new Error('Points must be a whole number.');
      await api.admin.review(s.id, status, p, note);
      toast(status === 'approved' ? `Approved · +${p ?? quest?.totalPoints} for ${s.team.name}` : status === 'rejected' ? 'Rejected' : 'Moved back to review');
      onDone();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card review">
      <SubmissionCard s={s} showQuest />
      <div className="review-actions">
        {quest && (
          <div className="box">
            <b>Proof required</b>{quest.proof}
            <div className="muted" style={{ marginTop: 6 }}>Worth {quest.totalPoints} pts ({quest.basePoints} base + {quest.bonusPoints} distance{quest.groupPoints ? ` + ${quest.groupPoints} group` : ''})</div>
          </div>
        )}
        <div className="field">
          <label htmlFor={`pts-${s.id}`}>Points</label>
          <input id={`pts-${s.id}`} className="input pts-input" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`note-${s.id}`}>Note to the team (optional)</label>
          <input id={`note-${s.id}`} className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Great pivot!" />
        </div>
        <div className="row">
          {s.status !== 'approved' && <button className="btn ok" disabled={busy} onClick={() => review('approved')}><Icon name="check" size={16} stroke={3} />Approve</button>}
          {s.status === 'approved' && <button className="btn ok" disabled={busy} onClick={() => review('approved')}>Update points</button>}
          {s.status !== 'rejected' && <button className="btn danger" disabled={busy} onClick={() => review('rejected')}>Reject</button>}
        </div>
        {s.status !== 'pending' && <button className="btn sm" disabled={busy} onClick={() => review('pending')}>Move back to review</button>}
      </div>
    </div>
  );
}

function Roster() {
  const { toast } = useSession();
  const [data, setData] = useState<{ teams: Team[]; players: Player[] } | null>(null);
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState<string>('');
  const [teamName, setTeamName] = useState('');
  const load = useCallback(() => api.admin.roster().then(setData).catch((e) => toast(e.message)), [toast]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <div className="spinner" />;

  const groups = [...data.teams.map((t) => ({ team: t as Team | null, players: data.players.filter((p) => p.teamId === t.id) })),
    { team: null, players: data.players.filter((p) => !p.teamId) }];

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast(ok); load(); } catch (e) { toast((e as Error).message); }
  };

  return (
    <>
      <div className="card" style={{ padding: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '1 1 180px' }}>
          <label htmlFor="np">Add a player</label>
          <input id="np" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        </div>
        <select className="input" style={{ width: 'auto' }} value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Team">
          <option value="">No team</option>
          {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn primary" disabled={!name.trim()} onClick={() => run(() => api.admin.addPlayer(name.trim(), teamId ? Number(teamId) : null), `Added ${name.trim()}`).then(() => setName(''))}>Add</button>
        <span style={{ flexBasis: '100%' }} />
        <div className="field" style={{ flex: '1 1 180px' }}>
          <label htmlFor="nt">Add a team</label>
          <input id="nt" className="input" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder={`Team ${data.teams.length + 1}`} />
        </div>
        <button className="btn" disabled={!teamName.trim()} onClick={() => run(() => api.admin.addTeam(teamName.trim(), ['#ee352e', '#b933ad', '#996633', '#fccc0a', '#6cbe45'][data.teams.length % 5]), `Created ${teamName.trim()}`).then(() => setTeamName(''))}>Create team</button>
      </div>
      <div className="roster">
        {groups.map((g) => (
          <div key={g.team?.id ?? 'none'} className="card">
            <h3>{g.team ? <span className="team-dot" style={{ background: g.team.color }} /> : null}{g.team?.name ?? 'No team'}<span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{g.players.length}</span></h3>
            {g.players.map((p) => (
              <div key={p.id} className="prow">
                <span>{p.name}{p.isAdmin && <span className="muted"> · GM</span>}</span>
                <select value={p.teamId ?? ''} aria-label={`Team for ${p.name}`}
                  onChange={(e) => run(() => api.admin.movePlayer(p.id, e.target.value ? Number(e.target.value) : null), `Moved ${p.name}`)}>
                  <option value="">No team</option>
                  {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            ))}
            {!g.players.length && <span className="muted">Nobody yet</span>}
          </div>
        ))}
      </div>
    </>
  );
}

function QuestAdmin() {
  const { toast } = useSession();
  const [quests, setQuests] = useState<Quest[] | null>(null);
  useEffect(() => { api.quests().then(setQuests).catch((e) => toast(e.message)); }, [toast]);
  if (!quests) return <div className="spinner" />;

  async function toggle(q: Quest) {
    try {
      await api.admin.setQuestActive(q.id, !q.isActive);
      setQuests((qs) => qs!.map((x) => (x.id === q.id ? { ...x, isActive: !x.isActive } : x)));
    } catch (e) { toast((e as Error).message); }
  }

  return (
    <div className="card" style={{ padding: '6px 14px' }}>
      <p className="muted" style={{ margin: '8px 0' }}>
        Hidden quests disappear for players. To change quest text or points, edit <code>api/seed/quests.json</code> and run the seed with <code>--overwrite</code> (see the README).
      </p>
      <div className="qadmin">
        {quests.map((q) => (
          <div key={q.id} className="r">
            <CatIcon cat={q.category} size={18} />
            <span style={{ flex: 1, minWidth: 0 }}><b>{q.title}</b> <span className="muted">· {q.id} · {q.totalPoints} pts</span></span>
            <button className="switch" role="switch" aria-checked={q.isActive} aria-label={`${q.title} visible`} onClick={() => toggle(q)} />
          </div>
        ))}
      </div>
    </div>
  );
}
