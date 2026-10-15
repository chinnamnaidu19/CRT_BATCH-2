import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';
import { getUnreadCount } from '../services/flowService.js';

const NotificationContext = createContext({ unread: 0, refresh: () => {} });

/** Polls the unread count every 30 s while logged in (real-time push can replace this later). */
export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    if (!user) return setUnread(0);
    getUnreadCount().then(setUnread).catch(() => {});
  }, [user]);

  useEffect(() => {
    refresh();
    if (!user) return undefined;
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [user, refresh]);

  return <NotificationContext.Provider value={{ unread, refresh }}>{children}</NotificationContext.Provider>;
}

export const useNotifications = () => useContext(NotificationContext);
