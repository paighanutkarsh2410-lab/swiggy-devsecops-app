import { useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, setToken } from "../services/api";
import { AuthContext } from "./context";

const PARTNER_ROLES = ["OWNER", "STAFF"];

// Holds the signed-in partner and their restaurant. Customer accounts are
// refused here; the API refuses them as well.
export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return undefined;

    let cancelled = false;

    api.me()
      .then((data) => {
        if (cancelled) return;
        setUser(data.user);
        setRestaurant(data.restaurant);
      })
      .catch(() => clearToken())
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => {
    async function login(credentials) {
      const session = await api.login(credentials);

      if (!PARTNER_ROLES.includes(session.user.role)) {
        throw new Error("This console is for restaurant partners. Customers can order on the main website.");
      }

      setToken(session.token);

      const profile = await api.me();

      setUser(profile.user);
      setRestaurant(profile.restaurant);
    }

    return {
      user,
      restaurant,
      loading,
      isOwner: user?.role === "OWNER",
      login,
      logout: () => {
        clearToken();
        setUser(null);
        setRestaurant(null);
      },
      setRestaurant,
    };
  }, [user, restaurant, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
