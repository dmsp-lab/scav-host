import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, type Me } from './api';

interface SessionValue {
  me: Me;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  toast: (msg: string) => void;
}

const Ctx = createContext<SessionValue | null>(null);
export const useSession = () => useContext(Ctx)!;

export function SessionGate({ signedOut, children }: { signedOut: (onIn: () => void) => ReactNode; children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>(undefined);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setMe(null);
      else throw err;
    }
  }, []);

  useEffect(() => { refresh().catch(() => setMe(null)); }, [refresh]);

  const toast = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2800);
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {});
    setMe(null);
  }, []);

  if (me === undefined) return <div className="center"><div className="spinner" /></div>;
  if (me === null) return <>{signedOut(() => void refresh())}</>;
  return (
    <Ctx.Provider value={{ me, refresh, signOut, toast }}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </Ctx.Provider>
  );
}
