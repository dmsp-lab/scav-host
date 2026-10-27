import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SessionGate, useSession } from './session';
import { Icon } from './icons';
import { api } from './api';
import Login from './pages/Login';
import QuestsPage from './pages/Quests';
import FeedPage from './pages/Feed';
import LeaderboardPage from './pages/Leaderboard';
import AdminPage from './pages/Admin';

export default function App() {
  return (
    <SessionGate signedOut={(onIn) => <Login onSignedIn={onIn} />}>
      <Shell />
    </SessionGate>
  );
}

function Shell() {
  const { me, signOut } = useSession();
  const pending = usePendingCount(me.isAdmin);
  const loc = useLocation();
  const cls = (to: string) => ({ isActive }: { isActive: boolean }) =>
    isActive || (to === '/' && loc.pathname.startsWith('/quests')) ? 'active' : '';
  const links = [
    { to: '/', label: 'Quests', icon: 'map', end: true },
    { to: '/feed', label: 'Feed', icon: 'feed' },
    { to: '/leaderboard', label: 'Scores', icon: 'trophy' },
    ...(me.isAdmin ? [{ to: '/admin', label: 'Review', icon: 'shield', badge: pending }] : []),
  ];

  return (
    <div className="app">
      <header className="hdr">
        <NavLink to="/" className="brand">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="var(--accent)" />
            <path d="M16 6c-4.4 0-8 3.4-8 7.8C8 19.6 16 26 16 26s8-6.4 8-12.2C24 9.4 20.4 6 16 6z" fill="var(--orange)" />
            <circle cx="16" cy="13.5" r="3" fill="#fff" />
          </svg>
          <div>Quest Board<small>Friendsgiving 2026 · NYC</small></div>
        </NavLink>
        <nav className="nav" aria-label="Main">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={cls(l.to)}>
              <Icon name={l.icon} size={16} />{l.label}
              {!!l.badge && <span className="badge">{l.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="hdr-right">
          <span className="who">
            {me.team
              ? <span className="team-pill"><span className="team-dot" style={{ background: me.team.color }} />{me.team.name}</span>
              : me.isAdmin && <span className="team-pill"><Icon name="shield" size={14} />Game Master</span>}
            <span className="who-name">{me.name}</span>
          </span>
          <button className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out"><Icon name="logout" size={18} /></button>
        </div>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<QuestsPage />} />
          <Route path="/quests/:questId" element={<QuestsPage />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          {me.isAdmin && <Route path="/admin" element={<AdminPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="tabbar" aria-label="Main">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={cls(l.to)}>
            <Icon name={l.icon} size={22} />{l.label}
            {!!l.badge && <span className="badge">{l.badge}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Pending-review count for the Game Master's badge, refreshed every 30 s and on navigation. */
function usePendingCount(enabled: boolean) {
  const [n, setN] = useState(0);
  const loc = useLocation();
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => api.admin.queue('pending').then((r) => alive && setN(r.length)).catch(() => {});
    load();
    const t = window.setInterval(load, 30000);
    return () => { alive = false; window.clearInterval(t); };
  }, [enabled, loc.pathname]);
  return n;
}
