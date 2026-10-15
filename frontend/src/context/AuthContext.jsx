import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as authService from '../services/authService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore the session from the cookie on page load.
  useEffect(() => {
    authService.fetchMe().then((d) => setUser(d.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (creds) => {
    const d = await authService.loginUser(creds);
    setUser(d.user);
    return d.user;
  }, []);

  const register = useCallback(async (form) => {
    const d = await authService.registerUser(form);
    setUser(d.user);
    return d.user;
  }, []);

  const logout = useCallback(async () => {
    await authService.logoutUser();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
