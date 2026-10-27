import { useEffect, useState } from 'react';
import { api, type LeaderTeam } from '../api';
import { onColor } from '../util';
import { useSession } from '../session';

export default function LeaderboardPage() {
  const { me } = useSession();
  const [data, setData] = useState<{ teams: LeaderTeam[]; totalQuests: number } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => api.leaderboard().then((d) => alive && setData(d)).catch((e) => alive && setErr(e.message));
    load();
    const t = window.setInterval(load, 15000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const top = Math.max(1, ...(data?.teams.map((t) => t.points) ?? [1]));

  return (
    <div className="page">
      <div className="page-inner">
        <div>
          <h1 className="page-title">Scoreboard</h1>
          <p className="page-sub">Points count once the Game Master approves a submission. Updates live.</p>
        </div>
        {err && <p className="err">{err}</p>}
        {!data && !err && <div className="spinner" />}
        <div className="board">
          {data?.teams.map((t, i) => (
            <div key={t.id} className="card lrow" style={t.id === me.teamId ? { borderColor: t.color, boxShadow: `inset 0 0 0 1px ${t.color}` } : undefined}>
              <span className="rank" style={{ background: t.color, color: onColor(t.color) }}>{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <h3>{t.name}{t.id === me.teamId && <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}> · your team</span>}</h3>
                <div className="members">{t.members?.map((m) => m.name).join(', ') || 'No players yet'}</div>
                <div className="bar-track"><i style={{ width: `${(t.points / top) * 100}%`, background: t.color }} /></div>
                <div className="members" style={{ marginTop: 6 }}>
                  {t.questsCompleted}/{data.totalQuests} quests done{t.pending ? ` · ${t.pending} in review` : ''}
                </div>
              </div>
              <div className="lpts"><b>{t.points}</b><span>points</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
