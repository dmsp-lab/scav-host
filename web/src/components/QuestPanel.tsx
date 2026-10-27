import { useCallback, useEffect, useState } from 'react';
import { api, type Quest, type Submission } from '../api';
import { CatIcon, Icon, SUB_LABEL } from '../icons';
import { DARK_BULLET, LINE_COLORS, STATUS_LABEL, fmtDur } from '../util';
import { useSession } from '../session';
import SubmitForm from './SubmitForm';
import { SubmissionCard } from './Media';

/** Turns "(1 2 3)" style line lists and "take a downtown 1 train" into colored subway bullets. */
function Transit({ text }: { text: string }) {
  // A line is a lone digit/letter between spaces, slashes or parentheses ("1 train", "B/D", "(A C E)").
  const parts = text.split(/(?<=^|[\s(/])([1-7ABCDEFGJLMNQRSWZ])(?=[\s)/]|$)/g);
  return <>{parts.map((p, i) => (i % 2 === 1 && LINE_COLORS[p] && !(p === 'A' && i === 1 && /^\s*$/.test(parts[0]))
    ? <span key={i} className={`bul${DARK_BULLET.has(p) ? ' dk' : ''}`} style={{ background: LINE_COLORS[p] }}>{p}</span>
    : <span key={i}>{p}</span>))}</>;
}

export default function QuestPanel({ id, categoryName, onClose, onChanged }: {
  id: string; categoryName: (c: string) => string; onClose: () => void; onChanged: () => void;
}) {
  const { me, toast } = useSession();
  const [q, setQ] = useState<(Quest & { submissions: Submission[] }) | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => api.quest(id).then((d) => { setQ(d); setErr(''); }).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { setQ(null); load(); }, [load]);

  // Refresh while any of our media is still processing.
  useEffect(() => {
    if (!q?.submissions.some((s) => s.media.some((m) => m.status === 'processing'))) return;
    const t = window.setTimeout(load, 4000);
    return () => window.clearTimeout(t);
  }, [q, load]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.lightbox') && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const mine = q?.submissions.filter((s) => s.team.id === me.teamId) ?? [];
  const others = q?.submissions.filter((s) => s.team.id !== me.teamId) ?? [];
  const myStatus = mine.some((s) => s.status === 'approved') ? 'approved' : mine.some((s) => s.status === 'pending') ? 'pending' : mine.length ? 'rejected' : 'none';

  async function withdraw(s: Submission) {
    if (!confirm('Withdraw this submission?')) return;
    try { await api.withdraw(s.id); toast('Submission withdrawn'); load(); onChanged(); } catch (e) { toast((e as Error).message); }
  }

  return (
    <aside className="side" aria-label="Quest details">
      <div className="side-top">
        {q && <span className="chipicon" style={{ background: `var(--c-${q.category})` }}><CatIcon cat={q.category} size={22} /></span>}
        <div className="meta">
          <div className="eyebrow2">{q ? `${categoryName(q.category)} · ${q.id}` : id}</div>
          {q && <span className={`status ${myStatus}`}>{STATUS_LABEL[myStatus]}</span>}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
      </div>

      <div className="side-body">
        {err && <p className="err">{err}</p>}
        {!q && !err && <div className="spinner" />}
        {q && (
          <>
            <h2>{q.title}</h2>
            <div className="score">
              <div><b>{q.basePoints}</b><span>Base</span></div>
              <div className="bonus"><b>+{q.bonusPoints}</b><span>Distance</span></div>
              {q.type === 'group' && <div className="grp"><b>+{q.groupPoints}</b><span>Group</span></div>}
              <div><b>{q.totalPoints}</b><span>Total</span></div>
            </div>
            <div className="facts">
              <span className="fact"><Icon name="clock" size={13} />{fmtDur(q.minutes)}</span>
              {q.type === 'group'
                ? <span className="fact"><Icon name="group" size={13} />Group · {q.groupSize} teams</span>
                : <span className="fact">Team quest</span>}
              {q.submissionTypes.map((t) => <span key={t} className="fact"><Icon name={t} size={13} />{SUB_LABEL[t]}</span>)}
            </div>
            <p>{q.description}</p>
            <div className="where">
              <Icon name="pin" size={18} />
              <div>
                <b>{q.place}</b><br />
                <span className="muted">{[q.neighborhood, q.borough].filter(Boolean).join(', ')}{q.anyLocation ? ' · any similar spot counts' : ''}</span><br />
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${q.lat},${q.lng}&travelmode=transit`} target="_blank" rel="noreferrer">Directions in Google Maps</a>
              </div>
            </div>
            <div>
              <h3>Steps</h3>
              <ol className="steps">{q.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </div>
            <div className="box"><b>Proof</b>{q.proof}</div>
            {q.note && <div className="box warn"><b>Heads up</b>{q.note}</div>}
            {q.route && (
              <div className="transit">
                <div className="transit-h"><b>From basecamp</b><span>~{q.route.mins} min{q.distanceMiles ? ` · ${q.distanceMiles.toFixed(1)} mi` : ''}</span></div>
                <ol className="tsteps">{q.route.steps.map((s, i) => <li key={i}><span className="dot">{i + 1}</span><span><Transit text={s} /></span></li>)}</ol>
              </div>
            )}

            <div className="divider" />
            {me.teamId
              ? myStatus === 'approved'
                ? <div className="box" style={{ background: 'var(--ok-soft)' }}><b style={{ color: 'var(--ok)' }}>Done!</b>Your team earned {Math.max(...mine.map((s) => s.pointsAwarded ?? 0))} points here.</div>
                : <SubmitForm key={q.id} quest={q} onSubmitted={() => { toast('Submitted! The Game Master will review it.'); load(); onChanged(); }} />
              : !me.isAdmin && <div className="box warn"><b>You're not on a team yet</b>Ask the Game Master to add you to one.</div>}

            {!!mine.length && (
              <section className="subs">
                <h3>Your team's submissions</h3>
                {mine.map((s) => <SubmissionCard key={s.id} s={s} onWithdraw={() => withdraw(s)} />)}
              </section>
            )}
            {!!others.length && (
              <section className="subs">
                <h3>{me.isAdmin ? 'All submissions' : 'Other teams'}</h3>
                {others.map((s) => <SubmissionCard key={s.id} s={s} />)}
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
