import { useEffect, useState, type FormEvent } from 'react';
import { api, type Player, type Team } from '../api';
import { Icon } from '../icons';

export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [data, setData] = useState<{ teams: Team[]; players: Player[] } | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [pick, setPick] = useState<Player | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.players().then(setData).catch((e) => setLoadErr(e.message)); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pick) { setErr('Pick your name first.'); return; }
    if (!code.trim()) { setErr(pick.isAdmin ? 'Enter the Game Master code.' : 'Enter the party code.'); return; }
    setBusy(true); setErr('');
    try {
      await api.login(pick.id, code.trim());
      onSignedIn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const groups = data ? [
    ...data.teams.map((t) => ({ key: `t${t.id}`, title: t.name, color: t.color, players: data.players.filter((p) => p.teamId === t.id) })),
    { key: 'none', title: 'Not on a team', color: '', players: data.players.filter((p) => !p.teamId && !p.isAdmin) },
    { key: 'gm', title: 'Game Master', color: '', players: data.players.filter((p) => p.isAdmin) },
  ].filter((g) => g.players.length) : [];

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <div className="login-hero">
          <span className="eyebrow">Friendsgiving 2026 · NYC</span>
          <h1>Who's playing?</h1>
          <p className="muted">Tap your name and enter the party code from the group chat.</p>
        </div>

        {loadErr && <p className="err">Couldn't load the player list: {loadErr}</p>}
        {!data && !loadErr && <div className="spinner" />}

        <div className="name-groups">
          {groups.map((g) => (
            <div className="name-group" key={g.key}>
              <h3>{g.color ? <span className="team-dot" style={{ background: g.color }} /> : g.key === 'gm' && <Icon name="shield" size={13} />}{g.title}</h3>
              <div className="names">
                {g.players.map((p) => (
                  <button type="button" key={p.id} className="name-btn" aria-pressed={pick?.id === p.id}
                    onClick={() => { setPick(p); setErr(''); }}>{p.name}</button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="field">
          <label htmlFor="code">{pick?.isAdmin ? 'Game Master code' : 'Party code'}</label>
          <input id="code" className="input" value={code} onChange={(e) => { setCode(e.target.value); setErr(''); }}
            autoComplete="off" autoCapitalize="none" placeholder={pick ? `Signing in as ${pick.name}` : 'Pick your name above'} />
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : "Let's go"}</button>
      </form>
    </div>
  );
}
