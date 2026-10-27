import { useEffect, useState } from 'react';
import { api, type Submission, type Team } from '../api';
import { SubmissionCard } from '../components/Media';
import { useSession } from '../session';

/** Everything teams have done so far: approved proof from everyone, plus your own team's pending posts. */
export default function FeedPage() {
  const { me } = useSession();
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [team, setTeam] = useState<number | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => { api.players().then((d) => setTeams(d.teams)).catch(() => {}); }, []);
  useEffect(() => {
    let alive = true;
    const load = () => api.submissions(team ? { teamId: String(team) } : {})
      .then((r) => alive && setSubs(me.isAdmin ? r : r.filter((s) => s.status !== 'rejected' || s.team.id === me.teamId)))
      .catch((e) => alive && setErr(e.message));
    load();
    const t = window.setInterval(load, 20000);
    return () => { alive = false; window.clearInterval(t); };
  }, [team, me]);

  return (
    <div className="page">
      <div className="page-inner">
        <div>
          <h1 className="page-title">Feed</h1>
          <p className="page-sub">Photos, videos and answers from every team. Pending posts are only visible to their own team.</p>
        </div>
        <div className="tabs">
          <button className="chip" aria-pressed={team === null} onClick={() => setTeam(null)}>All teams</button>
          {teams.map((t) => (
            <button key={t.id} className="chip" aria-pressed={team === t.id} onClick={() => setTeam(t.id)}>
              <span className="team-dot" style={{ background: t.color }} />{t.name}
            </button>
          ))}
        </div>
        {err && <p className="err">{err}</p>}
        {!subs && !err && <div className="spinner" />}
        {subs && !subs.length && <div className="empty"><b>Nothing yet</b>Approved quests will show up here.</div>}
        <div className="feed">
          {subs?.map((s) => <SubmissionCard key={s.id} s={s} showQuest />)}
        </div>
      </div>
    </div>
  );
}
