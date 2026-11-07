import { useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, setToken } from "../services/api";
import { AuthContext } from "./context";

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return undefined;

    let cancelled = false;

    api.me()
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        clearToken();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => {
    function startSession(data) {
      setToken(data.token);
      setUser(data.user);
      return data.user;
    }

    return {
      user,
      loading,
      login: (credentials) => api.login(credentials).then(startSession),
      register: (details) => api.register(details).then(startSession),
      logout: () => {
        clearToken();
        setUser(null);
      },
    };
  }, [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
