'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { AccountUser } from '@/lib/types';

type SessionState = {
  status: 'loading' | 'anonymous' | 'authenticated';
  user: AccountUser | null;
  refresh: () => Promise<void>;
  clear: () => void;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<SessionState['status']>('loading');
  const [user, setUser] = useState<AccountUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const nextUser = await api<AccountUser>('/api/auth/me');
      setUser(nextUser);
      setStatus('authenticated');
    } catch {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const clear = useCallback(() => {
    setUser(null);
    setStatus('anonymous');
  }, []);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  const value = useMemo(() => ({ status, user, refresh, clear }), [status, user, refresh, clear]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return session;
}
